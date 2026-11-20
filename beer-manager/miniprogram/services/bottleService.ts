import { customerStockBottles, setCustomerStockBottles } from './helpers';
import { Customer, DeliveryItem, BottleReturnItem } from '../types/models';
import { storageService } from './storageService';
import { quantity, customer, touch, id, record, product } from './helpers';
export const UNCLASSIFIED = 'UNCLASSIFIED';
function balances(c: Customer): Record<string, number> { return c.emptyBottlesByProduct || { [UNCLASSIFIED]: c.emptyBottleCount }; }
export const bottleService = {
    fromCases(cases: number, bottlesPerCase: number): number { quantity(cases, true); quantity(bottlesPerCase); const bottles = cases * bottlesPerCase; quantity(bottles, true); return bottles; },
    deliveryBottles(items: Pick<DeliveryItem, 'quantity' | 'bottlesPerCase'>[]): number { const total = items.reduce((n, i) => n + this.fromCases(i.quantity, i.bottlesPerCase), 0); quantity(total); return total; },
    accrueForDelivery(c: Customer, items: Pick<DeliveryItem, 'productId' | 'quantity' | 'bottlesPerCase'>[]): number {
        const bottles = this.deliveryBottles(items);
        quantity(c.emptyBottleCount + bottles, true);
        c.emptyBottlesByProduct = { ...balances(c) };
        items.forEach(i => { const n = (c.emptyBottlesByProduct![i.productId] || 0) + this.fromCases(i.quantity, i.bottlesPerCase); quantity(n, true); c.emptyBottlesByProduct![i.productId] = n; });
        c.emptyBottleCount += bottles;
        return bottles;
    },
    list(customerId: string) { const db = storageService.read(); const c = customer(db, customerId); return Object.entries(balances(c)).filter(([, n]) => n > 0).map(([productId, count]) => ({ productId, name: productId === UNCLASSIFIED ? '历史未分类空瓶' : db.products.find(p => p.id === productId)?.name || '历史商品空瓶', quantity: count, bottlesPerCase: db.products.find(p => p.id === productId)?.bottlesPerCase || 24 })); },
    createReturn(customerId: string, inputs: {
        productId: string;
        quantity: number;
    }[] | number, deductInventory = false): void {
        const requested = typeof inputs === 'number' ? [{ productId: UNCLASSIFIED, quantity: inputs }] : inputs;
        if (!requested.length)
            throw new Error('请选择空瓶种类');
        storageService.transaction(db => {
            const c = customer(db, customerId);
            const pools = { ...balances(c) };
            const seen = new Set<string>();
            const items: BottleReturnItem[] = requested.map(i => {
                quantity(i.quantity);
                if (seen.has(i.productId))
                    throw new Error('空瓶种类不能重复');
                seen.add(i.productId);
                if (i.productId !== UNCLASSIFIED)
                    product(db, i.productId);
                if (i.quantity > (pools[i.productId] || 0))
                    throw new Error('回瓶数量不能超过该种类待回数量');
                return { ...i, productName: i.productId === UNCLASSIFIED ? '历史未分类空瓶' : product(db, i.productId).name };
            });
            if (deductInventory) {
                if (items.some(i => i.productId === UNCLASSIFIED))
                    throw new Error('历史未分类空瓶须先分类，才能估算对应库存');
                items.forEach(i => {
                    const p = product(db, i.productId);
                    const s = db.customerStocks.find(s => s.customerId === customerId && s.productId === i.productId);
                    const before = s ? customerStockBottles(s, p.bottlesPerCase) : 0;
                    if (!s || i.quantity > before)
                        throw new Error(`${i.productName} 库存不足扣减；若已盘点扣除，请关闭本次库存扣减`);
                    setCustomerStockBottles(s, before - i.quantity, s.bottlesPerCase || p.bottlesPerCase);
                    db.stockMovements.push({ id: id('move'), productId: i.productId, customerId, type: 'BOTTLE_RETURN', quantityUnit: 'BOTTLE', quantity: -i.quantity, beforeQuantity: before, afterQuantity: before - i.quantity, createdAt: new Date().toISOString() });
                });
            }
            const count = items.reduce((n, i) => n + i.quantity, 0);
            quantity(count);
            if (count > c.emptyBottleCount)
                throw new Error('回瓶数量不能超过待回数量');
            items.forEach(i => { pools[i.productId] -= i.quantity; });
            c.emptyBottlesByProduct = pools;
            c.emptyBottleCount -= count;
            touch(c);
            db.bottleReturns.push({ id: id('return'), customerId, quantity: count, items, deductInventory, createdAt: new Date().toISOString() });
            record(db, 'BOTTLE_RETURN', '回瓶', items.map(i => `${i.productName} ${i.quantity} 瓶`).join('；') + (deductInventory ? '；已按回瓶扣减酒吧库存' : '；未扣减酒吧库存'), 0, count, customerId);
        });
    },
    classify(customerId: string, productId: string, count: number): void {
        quantity(count);
        storageService.transaction(db => {
            const c = customer(db, customerId);
            product(db, productId);
            const pools = { ...balances(c) };
            if (count > (pools[UNCLASSIFIED] || 0))
                throw new Error('分类数量不能超过历史未分类余额');
            pools[UNCLASSIFIED] -= count;
            pools[productId] = (pools[productId] || 0) + count;
            quantity(pools[productId], true);
            c.emptyBottlesByProduct = pools;
            touch(c);
            record(db, 'STOCKTAKE', '空瓶分类', `历史未分类 → ${product(db, productId).name} ${count} 瓶（总待回不变）`, 0, 0, customerId);
            db.records[0].quantityUnit = 'BOTTLE';
        });
    }
};
