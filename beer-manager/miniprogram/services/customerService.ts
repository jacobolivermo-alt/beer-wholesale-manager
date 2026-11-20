import { customerStockBottles } from './helpers';
import { Customer } from '../types/models';
import { storageService } from './storageService';
import { customer, id, money } from './helpers';
export const customerService = {
    list(search = ''): (Customer & {
        stockTotal: number;
        looseTotal: number;
    })[] { const db = storageService.read(); return db.customers.filter(c => !c.deletedAt && c.name.toLowerCase().includes(search.trim().toLowerCase())).map(c => ({ ...c, looseTotal: db.customerStocks.filter(s => s.customerId === c.id).reduce((n, s) => n + (s.looseBottleQuantity || 0), 0), stockTotal: db.customerStocks.filter(s => s.customerId === c.id).reduce((n, s) => n + s.quantity, 0) })).sort((a, b) => (b.lastOperatedAt || '').localeCompare(a.lastOperatedAt || '')); },
    get(customerId: string): Customer { return customer(storageService.read(), customerId); },
    stocks(customerId: string) { const db = storageService.read(); customer(db, customerId); return db.products.filter(p => !p.deletedAt).map(p => { const s = db.customerStocks.find(s => s.customerId === customerId && s.productId === p.id); return { ...p, quantity: s?.quantity || 0, looseBottleQuantity: s?.looseBottleQuantity || 0, inventoryCaseSize: s?.bottlesPerCase || p.bottlesPerCase, totalBottles: s ? customerStockBottles(s, p.bottlesPerCase) : 0 }; }); },
    remove(customerId: string): void {
        storageService.transaction(db => {
            const c = customer(db, customerId);
            if (c.receivable > 0)
                throw new Error('酒吧仍有欠款，请先结清后再删除');
            if (c.emptyBottleCount > 0)
                throw new Error('酒吧仍有待回空瓶，请先回收后再删除');
            c.deletedAt = new Date().toISOString();
        });
    },
    save(input: {
        id?: string;
        name: string;
        contactName: string;
        phone: string;
        address: string;
        remark: string;
        productPrices?: Record<string, number>;
    }): Customer {
        if (!input.name.trim())
            throw new Error('酒吧名称不能为空');
        return storageService.transaction(db => {
            if (db.customers.some(c => !c.deletedAt && c.name === input.name.trim() && c.id !== input.id))
                throw new Error('酒吧名称已存在');
            if (input.productPrices)
                Object.entries(input.productPrices).forEach(([productId, price]) => {
                    if (!db.products.some(p => p.id === productId && !p.deletedAt))
                        throw new Error('专属售价对应的商品不存在');
                    money(price, true);
                });
            if (input.id) {
                const c = customer(db, input.id);
                Object.assign(c, { ...input, productPrices: input.productPrices ?? c.productPrices, name: input.name.trim() });
                return c;
            }
            const c = { ...input, productPrices: input.productPrices ?? {}, id: id('customer'), name: input.name.trim(), receivable: 0, emptyBottleCount: 0, createdAt: new Date().toISOString() };
            db.customers.push(c);
            return c;
        });
    }
};
