import { Database, Customer, Product, BusinessRecord, RecordType } from '../types/models';
let sequence = 0;
export const id = (prefix: string): string => `${prefix}-${Date.now()}-${++sequence}-${Math.random().toString(36).slice(2, 8)}`;
export function quantity(value: number, allowZero = false): void {
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1))
        throw new Error(allowZero ? '数量必须为非负整数' : '数量必须为大于 0 的整数');
}
export function money(value: number, allowZero = false): void {
    if (!Number.isFinite(value) || value < (allowZero ? 0 : 0.01) || value > 99999999 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001)
        throw new Error('金额须为有效的非负数，最多两位小数');
}
export const cents = (n: number): number => Math.round(n * 100);
export function customer(db: Database, customerId: string): Customer {
    const c = db.customers.find(c => c.id === customerId);
    if (!c || c.deletedAt)
        throw new Error('请选择酒吧');
    return c;
}
export function product(db: Database, productId: string): Product {
    const p = db.products.find(p => p.id === productId);
    if (!p || p.deletedAt)
        throw new Error('请选择商品');
    return p;
}
export function touch(c: Customer): void { c.lastOperatedAt = new Date().toISOString(); }
export function record(db: Database, type: RecordType, title: string, description: string, amount: number, count: number, customerId?: string): void { db.records.unshift({ id: id('record'), type, title, description, amount, quantityUnit: type === 'BOTTLE_RETURN' ? 'BOTTLE' : 'BOX', quantity: count, customerId, createdAt: new Date().toISOString() }); }
export function move(db: Database, productId: string, type: 'DELIVERY' | 'PURCHASE' | 'STOCKTAKE', before: number, after: number, customerId?: string, quantityUnit: 'BOX' | 'BOTTLE' = 'BOX'): void { db.stockMovements.push({ id: id('move'), productId, type, quantityUnit, quantity: after - before, beforeQuantity: before, afterQuantity: after, customerId, createdAt: new Date().toISOString() }); }
export function customerStockBottles(s: import('../types/models').CustomerStock, defaultSize: number): number { return s.quantity * (s.bottlesPerCase || defaultSize) + (s.looseBottleQuantity || 0); }
export function setCustomerStockBottles(s: import('../types/models').CustomerStock, total: number, size: number): void { quantity(total, true); quantity(size); s.bottlesPerCase = size; s.quantity = Math.floor(total / size); s.looseBottleQuantity = total % size; }
