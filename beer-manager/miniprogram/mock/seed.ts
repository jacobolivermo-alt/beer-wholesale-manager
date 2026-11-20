import { Database } from '../types/models';
export function createSeed(): Database {
    const createdAt = new Date().toISOString();
    return { version: 2,
        products: [['p-u8', '燕京 U8', 72, 82], ['p-pure', '燕京纯生', 68, 45], ['p-white', '燕京白啤', 75, 23], ['p-fresh', '燕京鲜啤', 65, 12]].map(([id, name, price, stock]) => ({ id: String(id), name: String(name), price: Number(price), stock: Number(stock), lowStockThreshold: 15, bottlesPerCase: 24, createdAt })),
        customers: [{ id: 'c-old', name: '示例酒吧 A', contactName: '示例联系人', receivable: 3420, emptyBottleCount: 18 }, { id: 'c-space', name: 'DEMO BAR B', contactName: '', receivable: 0, emptyBottleCount: 38 }, { id: 'c-1988', name: 'DEMO BAR C', contactName: '', receivable: 1860, emptyBottleCount: 8 }].map(c => ({ ...c, phone: '', address: '', remark: '', productPrices: {}, emptyBottleCount: c.emptyBottleCount * 24, createdAt })),
        customerStocks: [['c-old', 'p-u8', 12], ['c-old', 'p-pure', 8], ['c-space', 'p-u8', 16], ['c-space', 'p-white', 12], ['c-1988', 'p-u8', 3], ['c-1988', 'p-pure', 2]].map(([customerId, productId, quantity], i) => ({ id: 'cs-' + i, customerId: String(customerId), productId: String(productId), quantity: Number(quantity) })),
        deliveries: [], payments: [], bottleReturns: [], stockMovements: [], records: [] };
}
