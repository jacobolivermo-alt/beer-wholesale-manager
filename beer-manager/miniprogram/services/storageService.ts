import { Database } from '../types/models';
import { createSeed } from '../mock/seed';
export const STORAGE_KEY = 'beer-manager:v1';
export const MIGRATION_BACKUP_KEY = 'beer-manager:v1:backup-before-v2';
const clone = (db: Database): Database => JSON.parse(JSON.stringify(db)) as Database;
function validShape(value: unknown): value is Database {
    if (!value || typeof value !== 'object')
        return false;
    const db = value as Partial<Database>;
    return ['products', 'customers', 'customerStocks', 'deliveries', 'payments', 'bottleReturns', 'stockMovements', 'records'].every(key => Array.isArray((db as unknown as Record<string, unknown>)[key]));
}
// 旧版空瓶单位为箱，按 24 瓶/箱迁移一次。保留原快照，库存和金额不变。
export function migrateLegacy(stored: Database): Database {
    const db = clone(stored);
    db.products.forEach(p => { p.bottlesPerCase = 24; });
    db.customers.forEach(c => { c.emptyBottleCount *= 24; c.productPrices = {}; });
    db.deliveries.forEach(d => { d.items.forEach(i => { i.bottlesPerCase = 24; }); d.totalEmptyBottleQuantity = d.totalQuantity * 24; });
    db.bottleReturns.forEach(r => { r.quantity *= 24; });
    db.records.forEach(r => {
        r.quantityUnit = r.type === 'BOTTLE_RETURN' ? 'BOTTLE' : 'BOX';
        if (r.type === 'BOTTLE_RETURN') {
            r.quantity *= 24;
            r.description = `回收空瓶 ${r.quantity} 瓶（旧版箱数换算）`;
        }
    });
    db.version = 2;
    return db;
}
export const storageService = {
    read(): Database {
        const stored = wx.getStorageSync(STORAGE_KEY);
        if (stored === '' || stored === undefined || stored === null) {
            const db = createSeed();
            wx.setStorageSync(STORAGE_KEY, db);
            return clone(db);
        }
        if (!validShape(stored))
            throw new Error('本地数据格式异常，请在「我的」中重置数据');
        const version = (stored as unknown as {
            version: number;
        }).version;
        if (version === 1) {
            const db = migrateLegacy(stored);
            const backup = wx.getStorageSync(MIGRATION_BACKUP_KEY);
            if (!backup)
                wx.setStorageSync(MIGRATION_BACKUP_KEY, stored);
            wx.setStorageSync(STORAGE_KEY, db);
            return clone(db);
        }
        if (version !== 2)
            throw new Error('本地数据版本不支持，请勿覆盖旧数据');
        if (stored.customers.some(c => !c.emptyBottlesByProduct) || stored.customerStocks.some(s => !s.bottlesPerCase)) {
            const db = clone(stored);
            db.customers.forEach(c => {
                if (!c.emptyBottlesByProduct)
                    c.emptyBottlesByProduct = { UNCLASSIFIED: c.emptyBottleCount };
            });
            db.customerStocks.forEach(s => {
                if (!s.bottlesPerCase) {
                    s.bottlesPerCase = db.products.find(p => p.id === s.productId)?.bottlesPerCase || 24;
                    s.looseBottleQuantity = 0;
                }
            });
            wx.setStorageSync(STORAGE_KEY, db);
            return clone(db);
        }
        return clone(stored);
    },
    transaction<T>(mutate: (db: Database) => T): T { const db = this.read(); const result = mutate(db); wx.setStorageSync(STORAGE_KEY, db); return result; },
    reset(): void {
        const stored = wx.getStorageSync(STORAGE_KEY);
        const paths = validShape(stored) ? stored.records.flatMap(r => (r.receipts || []).map(f => f.path)) : [];
        wx.setStorageSync(STORAGE_KEY, createSeed());
        paths.forEach(filePath => wx.getFileSystemManager().unlink({ filePath }));
    }
};
