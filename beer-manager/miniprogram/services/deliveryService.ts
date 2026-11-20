import { customerStockBottles, setCustomerStockBottles } from './helpers';
import { PaymentType, Delivery } from '../types/models';
import { storageService } from './storageService';
import { bottleService } from './bottleService';
import { customer, product, quantity, money, cents, touch, id, record, move } from './helpers';
export interface DeliveryInput {
    productId: string;
    quantity: number;
    unitPrice?: number;
    bottlesPerCase?: number;
}
export const deliveryService = {
    customerPrice(customerId: string, productId: string): number { const db = storageService.read(); const p = product(db, productId); return customerId ? customer(db, customerId).productPrices[productId] ?? p.price : p.price; },
    quote(inputs: DeliveryInput[], checkStock = true, customerId = '') {
        const db = storageService.read();
        const c = customerId ? customer(db, customerId) : undefined;
        if (!inputs.length)
            throw new Error('请选择商品，送货数量不能为 0');
        const seen = new Set<string>();
        const items = inputs.map(input => {
            quantity(input.quantity);
            if (seen.has(input.productId))
                throw new Error('请勿重复选择同一商品');
            seen.add(input.productId);
            const p = product(db, input.productId);
            if (checkStock && input.quantity > p.stock)
                throw new Error(`${p.name} 库存不足（剩余 ${p.stock} 箱）`);
            const unitPrice = input.unitPrice ?? c?.productPrices[p.id] ?? p.price;
            money(unitPrice, true);
            const bottlesPerCase = input.bottlesPerCase ?? p.bottlesPerCase;
            quantity(bottlesPerCase);
            const subtotal = cents(unitPrice) * input.quantity / 100;
            money(subtotal, true);
            return { productId: p.id, productName: p.name, quantity: input.quantity, unitPrice, bottlesPerCase, subtotal };
        });
        const totalQuantity = items.reduce((n, i) => n + i.quantity, 0);
        quantity(totalQuantity);
        const totalAmount = items.reduce((n, i) => n + cents(i.subtotal), 0) / 100;
        money(totalAmount, true);
        const totalEmptyBottleQuantity = bottleService.deliveryBottles(items);
        return { items, totalQuantity, totalAmount, totalEmptyBottleQuantity };
    },
    createDelivery(customerId: string, inputs: DeliveryInput[], paymentType: PaymentType, settlement?: {
        amount: number;
        reason: string;
    }): Delivery {
        if (paymentType !== 'CREDIT' && paymentType !== 'PAID')
            throw new Error('请选择付款状态');
        const quote = this.quote(inputs, true, customerId);
        const finalAmount = settlement ? settlement.amount : quote.totalAmount;
        money(finalAmount, true);
        if (cents(finalAmount) !== cents(quote.totalAmount) && !settlement?.reason.trim())
            throw new Error('调整货款请填写协商说明');
        return storageService.transaction(db => {
            const c = customer(db, customerId);
            const d = { ...quote, calculatedAmount: quote.totalAmount, totalAmount: finalAmount, adjustmentReason: settlement?.reason.trim() || '', id: id('delivery'), customerId, paymentType, createdAt: new Date().toISOString() };
            d.items.forEach(item => {
                const p = product(db, item.productId);
                if (p.stock < item.quantity)
                    throw new Error(`${p.name} 库存不足`);
                const before = p.stock;
                p.stock -= item.quantity;
                move(db, p.id, 'DELIVERY', before, p.stock);
                let s = db.customerStocks.find(s => s.customerId === customerId && s.productId === p.id);
                if (!s) {
                    s = { id: id('cs'), customerId, productId: p.id, quantity: 0 };
                    db.customerStocks.push(s);
                }
                const size = s.bottlesPerCase || p.bottlesPerCase;
                const customerBefore = customerStockBottles(s, size);
                setCustomerStockBottles(s, customerStockBottles(s, size) + item.quantity * item.bottlesPerCase, size);
                move(db, p.id, 'DELIVERY', customerBefore, customerStockBottles(s, size), customerId, 'BOTTLE');
            });
            bottleService.accrueForDelivery(c, d.items);
            if (paymentType === 'CREDIT') {
                c.receivable = (cents(c.receivable) + cents(d.totalAmount)) / 100;
                money(c.receivable, true);
            }
            touch(c);
            db.deliveries.push(d);
            record(db, 'DELIVERY', '送货', d.items.map(i => `${i.productName} × ${i.quantity} 箱 · ¥${i.unitPrice}/箱 · ${i.bottlesPerCase}瓶/箱`).join('；') + (paymentType === 'PAID' ? ' · 已付款' : ' · 赊账') + (cents(finalAmount) !== cents(quote.totalAmount) ? `；计算 ¥${quote.totalAmount} → 协商 ¥${finalAmount}（${d.adjustmentReason}）` : ''), d.totalAmount, d.totalQuantity, customerId);
            return d;
        });
    }
};
