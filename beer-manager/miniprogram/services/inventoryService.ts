import { setCustomerStockBottles, customerStockBottles } from './helpers';
import { storageService } from './storageService';
import { product, customer, quantity, touch, id, record, move } from './helpers';
export const inventoryService = {
    purchase(productId: string, count: number): void { quantity(count); storageService.transaction(db => { const p = product(db, productId); const before = p.stock; quantity(before + count, true); p.stock += count; move(db, p.id, 'PURCHASE', before, p.stock); record(db, 'PURCHASE', '进货', `${p.name} × ${count}`, 0, count); }); },
    stocktake(productId: string, actual: number, customerId?: string, actualLoose = 0): void {
        quantity(actual, true);
        quantity(actualLoose, true);
        if (!customerId && actualLoose)
            throw new Error('仓库暂按整箱盘点');
        storageService.transaction(db => {
            const p = product(db, productId);
            let before = p.stock;
            if (customerId) {
                const c = customer(db, customerId);
                let s = db.customerStocks.find(s => s.customerId === customerId && s.productId === productId);
                if (!s) {
                    s = { id: id('cs'), customerId, productId, quantity: 0 };
                    db.customerStocks.push(s);
                }
                before = s.quantity;
                const size = s.bottlesPerCase || p.bottlesPerCase;
                if (actualLoose >= size)
                    throw new Error(`散瓶须少于 ${size} 瓶，请换算为整箱`);
                const beforeBottles = customerStockBottles(s, size);
                setCustomerStockBottles(s, actual * size + actualLoose, size);
                record(db, 'STOCKTAKE', '库存调整', `${p.name}：${beforeBottles} → ${actual * size + actualLoose} 瓶（${size}瓶/箱）`, 0, actual * size + actualLoose - beforeBottles, customerId);
                db.records[0].quantityUnit = 'BOTTLE';
                move(db, p.id, 'STOCKTAKE', beforeBottles, customerStockBottles(s, size), customerId, 'BOTTLE');
                touch(c);
            }
            else
                p.stock = actual;
            if (!customerId)
                move(db, p.id, 'STOCKTAKE', before, actual);
            if (!customerId)
                record(db, 'STOCKTAKE', '库存调整', `${p.name}：${before} → ${actual} 箱`, 0, actual - before, customerId);
        });
    }
};
