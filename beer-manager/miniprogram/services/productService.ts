import { Product } from '../types/models';
import { storageService } from './storageService';
import { id, product, quantity, money, move, record } from './helpers';
export const productService = {
    list(includeDeleted = false): Product[] { return storageService.read().products.filter(p => includeDeleted || !p.deletedAt); },
    remove(productId: string): void {
        storageService.transaction(db => {
            const p = product(db, productId);
            if (p.stock > 0)
                throw new Error(`仓库仍有 ${p.stock} 箱，请先处理库存后再删除`);
            const active = new Set(db.customers.filter(c => !c.deletedAt).map(c => c.id));
            if (db.customerStocks.some(s => s.productId === productId && active.has(s.customerId) && (s.quantity > 0 || (s.looseBottleQuantity || 0) > 0)))
                throw new Error('酒吧仍有该商品库存，请先盘点或处理后再删除');
            if (db.customers.some(c => !c.deletedAt && (c.emptyBottlesByProduct?.[productId] || 0) > 0))
                throw new Error('该商品仍有待回空瓶，请先回收后再删除');
            p.deletedAt = new Date().toISOString();
        });
    },
    restore(productId: string): void {
        storageService.transaction(db => {
            const p = db.products.find(p => p.id === productId);
            if (!p || !p.deletedAt)
                throw new Error('找不到已删除商品');
            if (db.products.some(other => !other.deletedAt && other.id !== p.id && other.name === p.name))
                throw new Error('已有同名商品，请先修改在用商品名称再恢复');
            delete p.deletedAt;
        });
    },
    save(input: {
        id?: string;
        name: string;
        price: number;
        stock: number;
        lowStockThreshold: number;
        bottlesPerCase?: number;
    }): Product {
        if (!input.name.trim())
            throw new Error('商品名称不能为空');
        money(input.price, true);
        quantity(input.stock, true);
        quantity(input.lowStockThreshold, true);
        if (input.bottlesPerCase !== undefined)
            quantity(input.bottlesPerCase);
        return storageService.transaction(db => {
            if (db.products.some(p => !p.deletedAt && p.name === input.name.trim() && p.id !== input.id))
                throw new Error('商品名称已存在');
            if (input.id) {
                const p = product(db, input.id);
                const before = p.stock;
                Object.assign(p, { ...input, bottlesPerCase: input.bottlesPerCase ?? p.bottlesPerCase, name: input.name.trim() });
                if (before !== p.stock) {
                    move(db, p.id, 'STOCKTAKE', before, p.stock);
                    record(db, 'STOCKTAKE', '库存调整', `${p.name}：${before} → ${p.stock} 箱`, 0, p.stock - before);
                }
                return p;
            }
            const p = { ...input, bottlesPerCase: input.bottlesPerCase ?? 24, id: id('product'), name: input.name.trim(), createdAt: new Date().toISOString() };
            db.products.push(p);
            if (p.stock > 0) {
                move(db, p.id, 'PURCHASE', 0, p.stock);
                record(db, 'PURCHASE', '新增商品期初库存', `${p.name} × ${p.stock}`, 0, p.stock);
            }
            return p;
        });
    }
};
