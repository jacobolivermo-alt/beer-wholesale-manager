const BeerModules = {};
BeerModules["services/analysisService"] = function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analysisService = void 0;
exports.periodRange = periodRange;
exports.chartModel = chartModel;
const storageService_1 = require("./storageService");
const helpers_1 = require("./helpers");
const format_1 = require("../utils/format");
function periodRange(period, offset = 0, now = new Date()) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    let end = new Date(start);
    if (period === 'WEEK') {
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7);
        end = new Date(start);
        end.setDate(end.getDate() + 7);
    }
    else if (period === 'MONTH') {
        start.setDate(1);
        start.setMonth(start.getMonth() + offset);
        end = new Date(start);
        end.setMonth(end.getMonth() + 1);
    }
    else if (period === '7' || period === '30') {
        start.setDate(start.getDate() - Number(period) + 1);
        end.setDate(end.getDate() + 1);
    }
    else {
        start.setFullYear(1970, 0, 1);
        end = new Date(now.getTime() + 1);
    }
    const last = new Date(end);
    last.setDate(last.getDate() - 1);
    return { start, end, label: period === 'ALL' ? '全部业务' : `${(0, format_1.dayKey)(start.toISOString())} — ${(0, format_1.dayKey)(last.toISOString())}` };
}
const sum = (values) => values.reduce((n, v) => n + (0, helpers_1.cents)(v), 0) / 100;
exports.analysisService = { summary(period = 'MONTH', offset = 0, now = new Date()) {
        const db = storageService_1.storageService.read();
        const range = periodRange(period, offset, now);
        const included = (date) => new Date(date) >= range.start && new Date(date) < range.end;
        const deliveries = db.deliveries.filter(d => included(d.createdAt));
        const payments = db.payments.filter(p => included(p.createdAt));
        const returns = db.bottleReturns.filter(r => included(r.createdAt));
        const sales = sum(deliveries.map(d => d.totalAmount));
        const collected = sum([...payments.map(p => p.amount), ...deliveries.filter(d => d.paymentType === 'PAID').map(d => d.totalAmount)]);
        const active = db.customers.filter(c => !c.deletedAt);
        const customers = db.customers.map(c => { const ds = deliveries.filter(d => d.customerId === c.id); return { id: c.id, name: c.name + (c.deletedAt ? '（已删除）' : ''), amount: sum(ds.map(d => d.totalAmount)), quantity: ds.reduce((n, d) => n + d.totalQuantity, 0) }; }).filter(c => c.quantity > 0).sort((a, b) => b.amount - a.amount).map(c => ({ ...c, amountText: (0, format_1.moneyText)(c.amount), width: sales > 0 ? Math.max(2, Math.round(c.amount / sales * 100)) : 0 }));
        const productRows = db.products.map(p => ({ id: p.id, name: p.name, quantity: deliveries.flatMap(d => d.items).filter(i => i.productId === p.id).reduce((n, i) => n + i.quantity, 0) })).filter(p => p.quantity > 0).sort((a, b) => b.quantity - a.quantity);
        const maxProduct = productRows[0]?.quantity || 0;
        const products = productRows.map(p => ({ ...p, width: maxProduct ? Math.max(2, Math.round(p.quantity / maxProduct * 100)) : 0 }));
        const keys = [...new Set([...deliveries.map(d => (0, format_1.dayKey)(d.createdAt)), ...payments.map(p => (0, format_1.dayKey)(p.createdAt)), ...returns.map(r => (0, format_1.dayKey)(r.createdAt))])].sort().reverse();
        const daily = keys.map(day => ({ day, salesText: (0, format_1.moneyText)(sum(deliveries.filter(d => (0, format_1.dayKey)(d.createdAt) === day).map(d => d.totalAmount))), collectedText: (0, format_1.moneyText)(sum([...payments.filter(p => (0, format_1.dayKey)(p.createdAt) === day).map(p => p.amount), ...deliveries.filter(d => (0, format_1.dayKey)(d.createdAt) === day && d.paymentType === 'PAID').map(d => d.totalAmount)])) }));
        const points = [];
        const bucket = (label, start, end) => {
            const inBucket = (date) => new Date(date) >= start && new Date(date) < end;
            const ds = deliveries.filter(d => inBucket(d.createdAt));
            points.push({ label, sales: sum(ds.map(d => d.totalAmount)), collected: sum([...payments.filter(p => inBucket(p.createdAt)).map(p => p.amount), ...ds.filter(d => d.paymentType === 'PAID').map(d => d.totalAmount)]), quantity: ds.reduce((n, d) => n + d.totalQuantity, 0), returned: returns.filter(r => inBucket(r.createdAt)).reduce((n, r) => n + r.quantity, 0) });
        };
        if (period === 'ALL') {
            const start = new Date(now);
            start.setHours(0, 0, 0, 0);
            start.setDate(1);
            start.setMonth(start.getMonth() - 11);
            for (let i = 0; i < 12; i++) {
                const a = new Date(start);
                a.setMonth(a.getMonth() + i);
                const b = new Date(a);
                b.setMonth(b.getMonth() + 1);
                bucket(`${a.getMonth() + 1}月`, a, b);
            }
        }
        else {
            const step = period === 'WEEK' || period === '7' ? 1 : 7;
            for (let a = new Date(range.start); a < range.end;) {
                const b = new Date(a);
                b.setDate(b.getDate() + step);
                if (b > range.end)
                    b.setTime(range.end.getTime());
                const last = new Date(b);
                last.setDate(last.getDate() - 1);
                const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
                bucket(step === 1 ? `周${weekdays[a.getDay()]}` : `${a.getDate()}–${last.getDate()}日`, a, b);
                a = b;
            }
        }
        return { rangeLabel: range.label, chartNote: period === 'ALL' ? '图表显示最近12个月，指标统计全部业务' : period === 'MONTH' ? '按月内日期分段汇总，包含无业务日期' : '按自然日汇总，包含无业务日期', points, salesText: (0, format_1.moneyText)(sales), collectedText: (0, format_1.moneyText)(collected), quantity: deliveries.reduce((n, d) => n + d.totalQuantity, 0), returned: returns.reduce((n, r) => n + r.quantity, 0), negotiatedText: (0, format_1.moneyText)(sum(deliveries.map(d => (d.calculatedAmount ?? d.totalAmount) - d.totalAmount))), forgivenText: (0, format_1.moneyText)(sum(payments.map(p => p.forgivenAmount || 0))), receivableText: (0, format_1.moneyText)(sum(active.map(c => c.receivable))), bottles: active.reduce((n, c) => n + c.emptyBottleCount, 0), customers, products, daily };
    } };
function chartModel(points, kind) {
    const values = points.map(p => ({ ...p, first: kind === 'MONEY' ? p.sales : kind === 'DELIVERY' ? p.quantity : p.returned, second: kind === 'MONEY' ? p.collected : 0 }));
    const max = Math.max(0, ...values.flatMap(p => [p.first, p.second]));
    return { maxText: (0, format_1.moneyText)(max), empty: max === 0, points: values.map(p => ({ ...p, firstText: (0, format_1.moneyText)(p.first), secondText: (0, format_1.moneyText)(p.second), firstHeight: max && p.first ? Math.max(1, Math.round(p.first / max * 100)) : 0, secondHeight: max && p.second ? Math.max(1, Math.round(p.second / max * 100)) : 0 })) };
}

};
BeerModules["services/bottleService"] = function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bottleService = exports.UNCLASSIFIED = void 0;
const helpers_1 = require("./helpers");
const storageService_1 = require("./storageService");
const helpers_2 = require("./helpers");
exports.UNCLASSIFIED = 'UNCLASSIFIED';
function balances(c) { return c.emptyBottlesByProduct || { [exports.UNCLASSIFIED]: c.emptyBottleCount }; }
exports.bottleService = {
    fromCases(cases, bottlesPerCase) { (0, helpers_2.quantity)(cases, true); (0, helpers_2.quantity)(bottlesPerCase); const bottles = cases * bottlesPerCase; (0, helpers_2.quantity)(bottles, true); return bottles; },
    deliveryBottles(items) { const total = items.reduce((n, i) => n + this.fromCases(i.quantity, i.bottlesPerCase), 0); (0, helpers_2.quantity)(total); return total; },
    accrueForDelivery(c, items) {
        const bottles = this.deliveryBottles(items);
        (0, helpers_2.quantity)(c.emptyBottleCount + bottles, true);
        c.emptyBottlesByProduct = { ...balances(c) };
        items.forEach(i => { const n = (c.emptyBottlesByProduct[i.productId] || 0) + this.fromCases(i.quantity, i.bottlesPerCase); (0, helpers_2.quantity)(n, true); c.emptyBottlesByProduct[i.productId] = n; });
        c.emptyBottleCount += bottles;
        return bottles;
    },
    list(customerId) { const db = storageService_1.storageService.read(); const c = (0, helpers_2.customer)(db, customerId); return Object.entries(balances(c)).filter(([, n]) => n > 0).map(([productId, count]) => ({ productId, name: productId === exports.UNCLASSIFIED ? '历史未分类空瓶' : db.products.find(p => p.id === productId)?.name || '历史商品空瓶', quantity: count, bottlesPerCase: db.products.find(p => p.id === productId)?.bottlesPerCase || 24 })); },
    createReturn(customerId, inputs, deductInventory = false) {
        const requested = typeof inputs === 'number' ? [{ productId: exports.UNCLASSIFIED, quantity: inputs }] : inputs;
        if (!requested.length)
            throw new Error('请选择空瓶种类');
        storageService_1.storageService.transaction(db => {
            const c = (0, helpers_2.customer)(db, customerId);
            const pools = { ...balances(c) };
            const seen = new Set();
            const items = requested.map(i => {
                (0, helpers_2.quantity)(i.quantity);
                if (seen.has(i.productId))
                    throw new Error('空瓶种类不能重复');
                seen.add(i.productId);
                if (i.productId !== exports.UNCLASSIFIED)
                    (0, helpers_2.product)(db, i.productId);
                if (i.quantity > (pools[i.productId] || 0))
                    throw new Error('回瓶数量不能超过该种类待回数量');
                return { ...i, productName: i.productId === exports.UNCLASSIFIED ? '历史未分类空瓶' : (0, helpers_2.product)(db, i.productId).name };
            });
            if (deductInventory) {
                if (items.some(i => i.productId === exports.UNCLASSIFIED))
                    throw new Error('历史未分类空瓶须先分类，才能估算对应库存');
                items.forEach(i => {
                    const p = (0, helpers_2.product)(db, i.productId);
                    const s = db.customerStocks.find(s => s.customerId === customerId && s.productId === i.productId);
                    const before = s ? (0, helpers_1.customerStockBottles)(s, p.bottlesPerCase) : 0;
                    if (!s || i.quantity > before)
                        throw new Error(`${i.productName} 库存不足扣减；若已盘点扣除，请关闭本次库存扣减`);
                    (0, helpers_1.setCustomerStockBottles)(s, before - i.quantity, s.bottlesPerCase || p.bottlesPerCase);
                    db.stockMovements.push({ id: (0, helpers_2.id)('move'), productId: i.productId, customerId, type: 'BOTTLE_RETURN', quantityUnit: 'BOTTLE', quantity: -i.quantity, beforeQuantity: before, afterQuantity: before - i.quantity, createdAt: new Date().toISOString() });
                });
            }
            const count = items.reduce((n, i) => n + i.quantity, 0);
            (0, helpers_2.quantity)(count);
            if (count > c.emptyBottleCount)
                throw new Error('回瓶数量不能超过待回数量');
            items.forEach(i => { pools[i.productId] -= i.quantity; });
            c.emptyBottlesByProduct = pools;
            c.emptyBottleCount -= count;
            (0, helpers_2.touch)(c);
            db.bottleReturns.push({ id: (0, helpers_2.id)('return'), customerId, quantity: count, items, deductInventory, createdAt: new Date().toISOString() });
            (0, helpers_2.record)(db, 'BOTTLE_RETURN', '回瓶', items.map(i => `${i.productName} ${i.quantity} 瓶`).join('；') + (deductInventory ? '；已按回瓶扣减酒吧库存' : '；未扣减酒吧库存'), 0, count, customerId);
        });
    },
    classify(customerId, productId, count) {
        (0, helpers_2.quantity)(count);
        storageService_1.storageService.transaction(db => {
            const c = (0, helpers_2.customer)(db, customerId);
            (0, helpers_2.product)(db, productId);
            const pools = { ...balances(c) };
            if (count > (pools[exports.UNCLASSIFIED] || 0))
                throw new Error('分类数量不能超过历史未分类余额');
            pools[exports.UNCLASSIFIED] -= count;
            pools[productId] = (pools[productId] || 0) + count;
            (0, helpers_2.quantity)(pools[productId], true);
            c.emptyBottlesByProduct = pools;
            (0, helpers_2.touch)(c);
            (0, helpers_2.record)(db, 'STOCKTAKE', '空瓶分类', `历史未分类 → ${(0, helpers_2.product)(db, productId).name} ${count} 瓶（总待回不变）`, 0, 0, customerId);
            db.records[0].quantityUnit = 'BOTTLE';
        });
    }
};

};
BeerModules["services/customerService"] = function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerService = void 0;
const helpers_1 = require("./helpers");
const storageService_1 = require("./storageService");
const helpers_2 = require("./helpers");
exports.customerService = {
    list(search = '') { const db = storageService_1.storageService.read(); return db.customers.filter(c => !c.deletedAt && c.name.toLowerCase().includes(search.trim().toLowerCase())).map(c => ({ ...c, looseTotal: db.customerStocks.filter(s => s.customerId === c.id).reduce((n, s) => n + (s.looseBottleQuantity || 0), 0), stockTotal: db.customerStocks.filter(s => s.customerId === c.id).reduce((n, s) => n + s.quantity, 0) })).sort((a, b) => (b.lastOperatedAt || '').localeCompare(a.lastOperatedAt || '')); },
    get(customerId) { return (0, helpers_2.customer)(storageService_1.storageService.read(), customerId); },
    stocks(customerId) { const db = storageService_1.storageService.read(); (0, helpers_2.customer)(db, customerId); return db.products.filter(p => !p.deletedAt).map(p => { const s = db.customerStocks.find(s => s.customerId === customerId && s.productId === p.id); return { ...p, quantity: s?.quantity || 0, looseBottleQuantity: s?.looseBottleQuantity || 0, inventoryCaseSize: s?.bottlesPerCase || p.bottlesPerCase, totalBottles: s ? (0, helpers_1.customerStockBottles)(s, p.bottlesPerCase) : 0 }; }); },
    remove(customerId) {
        storageService_1.storageService.transaction(db => {
            const c = (0, helpers_2.customer)(db, customerId);
            if (c.receivable > 0)
                throw new Error('酒吧仍有欠款，请先结清后再删除');
            if (c.emptyBottleCount > 0)
                throw new Error('酒吧仍有待回空瓶，请先回收后再删除');
            c.deletedAt = new Date().toISOString();
        });
    },
    save(input) {
        if (!input.name.trim())
            throw new Error('酒吧名称不能为空');
        return storageService_1.storageService.transaction(db => {
            if (db.customers.some(c => !c.deletedAt && c.name === input.name.trim() && c.id !== input.id))
                throw new Error('酒吧名称已存在');
            if (input.productPrices)
                Object.entries(input.productPrices).forEach(([productId, price]) => {
                    if (!db.products.some(p => p.id === productId && !p.deletedAt))
                        throw new Error('专属售价对应的商品不存在');
                    (0, helpers_2.money)(price, true);
                });
            if (input.id) {
                const c = (0, helpers_2.customer)(db, input.id);
                Object.assign(c, { ...input, productPrices: input.productPrices ?? c.productPrices, name: input.name.trim() });
                return c;
            }
            const c = { ...input, productPrices: input.productPrices ?? {}, id: (0, helpers_2.id)('customer'), name: input.name.trim(), receivable: 0, emptyBottleCount: 0, createdAt: new Date().toISOString() };
            db.customers.push(c);
            return c;
        });
    }
};

};
BeerModules["services/deliveryService"] = function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliveryService = void 0;
const helpers_1 = require("./helpers");
const storageService_1 = require("./storageService");
const bottleService_1 = require("./bottleService");
const helpers_2 = require("./helpers");
exports.deliveryService = {
    customerPrice(customerId, productId) { const db = storageService_1.storageService.read(); const p = (0, helpers_2.product)(db, productId); return customerId ? (0, helpers_2.customer)(db, customerId).productPrices[productId] ?? p.price : p.price; },
    quote(inputs, checkStock = true, customerId = '') {
        const db = storageService_1.storageService.read();
        const c = customerId ? (0, helpers_2.customer)(db, customerId) : undefined;
        if (!inputs.length)
            throw new Error('请选择商品，送货数量不能为 0');
        const seen = new Set();
        const items = inputs.map(input => {
            (0, helpers_2.quantity)(input.quantity);
            if (seen.has(input.productId))
                throw new Error('请勿重复选择同一商品');
            seen.add(input.productId);
            const p = (0, helpers_2.product)(db, input.productId);
            if (checkStock && input.quantity > p.stock)
                throw new Error(`${p.name} 库存不足（剩余 ${p.stock} 箱）`);
            const unitPrice = input.unitPrice ?? c?.productPrices[p.id] ?? p.price;
            (0, helpers_2.money)(unitPrice, true);
            const bottlesPerCase = input.bottlesPerCase ?? p.bottlesPerCase;
            (0, helpers_2.quantity)(bottlesPerCase);
            const subtotal = (0, helpers_2.cents)(unitPrice) * input.quantity / 100;
            (0, helpers_2.money)(subtotal, true);
            return { productId: p.id, productName: p.name, quantity: input.quantity, unitPrice, bottlesPerCase, subtotal };
        });
        const totalQuantity = items.reduce((n, i) => n + i.quantity, 0);
        (0, helpers_2.quantity)(totalQuantity);
        const totalAmount = items.reduce((n, i) => n + (0, helpers_2.cents)(i.subtotal), 0) / 100;
        (0, helpers_2.money)(totalAmount, true);
        const totalEmptyBottleQuantity = bottleService_1.bottleService.deliveryBottles(items);
        return { items, totalQuantity, totalAmount, totalEmptyBottleQuantity };
    },
    createDelivery(customerId, inputs, paymentType, settlement) {
        if (paymentType !== 'CREDIT' && paymentType !== 'PAID')
            throw new Error('请选择付款状态');
        const quote = this.quote(inputs, true, customerId);
        const finalAmount = settlement ? settlement.amount : quote.totalAmount;
        (0, helpers_2.money)(finalAmount, true);
        if ((0, helpers_2.cents)(finalAmount) !== (0, helpers_2.cents)(quote.totalAmount) && !settlement?.reason.trim())
            throw new Error('调整货款请填写协商说明');
        return storageService_1.storageService.transaction(db => {
            const c = (0, helpers_2.customer)(db, customerId);
            const d = { ...quote, calculatedAmount: quote.totalAmount, totalAmount: finalAmount, adjustmentReason: settlement?.reason.trim() || '', id: (0, helpers_2.id)('delivery'), customerId, paymentType, createdAt: new Date().toISOString() };
            d.items.forEach(item => {
                const p = (0, helpers_2.product)(db, item.productId);
                if (p.stock < item.quantity)
                    throw new Error(`${p.name} 库存不足`);
                const before = p.stock;
                p.stock -= item.quantity;
                (0, helpers_2.move)(db, p.id, 'DELIVERY', before, p.stock);
                let s = db.customerStocks.find(s => s.customerId === customerId && s.productId === p.id);
                if (!s) {
                    s = { id: (0, helpers_2.id)('cs'), customerId, productId: p.id, quantity: 0 };
                    db.customerStocks.push(s);
                }
                const size = s.bottlesPerCase || p.bottlesPerCase;
                const customerBefore = (0, helpers_1.customerStockBottles)(s, size);
                (0, helpers_1.setCustomerStockBottles)(s, (0, helpers_1.customerStockBottles)(s, size) + item.quantity * item.bottlesPerCase, size);
                (0, helpers_2.move)(db, p.id, 'DELIVERY', customerBefore, (0, helpers_1.customerStockBottles)(s, size), customerId, 'BOTTLE');
            });
            bottleService_1.bottleService.accrueForDelivery(c, d.items);
            if (paymentType === 'CREDIT') {
                c.receivable = ((0, helpers_2.cents)(c.receivable) + (0, helpers_2.cents)(d.totalAmount)) / 100;
                (0, helpers_2.money)(c.receivable, true);
            }
            (0, helpers_2.touch)(c);
            db.deliveries.push(d);
            (0, helpers_2.record)(db, 'DELIVERY', '送货', d.items.map(i => `${i.productName} × ${i.quantity} 箱 · ¥${i.unitPrice}/箱 · ${i.bottlesPerCase}瓶/箱`).join('；') + (paymentType === 'PAID' ? ' · 已付款' : ' · 赊账') + ((0, helpers_2.cents)(finalAmount) !== (0, helpers_2.cents)(quote.totalAmount) ? `；计算 ¥${quote.totalAmount} → 协商 ¥${finalAmount}（${d.adjustmentReason}）` : ''), d.totalAmount, d.totalQuantity, customerId);
            return d;
        });
    }
};

};
BeerModules["services/helpers"] = function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cents = exports.id = void 0;
exports.quantity = quantity;
exports.money = money;
exports.customer = customer;
exports.product = product;
exports.touch = touch;
exports.record = record;
exports.move = move;
exports.customerStockBottles = customerStockBottles;
exports.setCustomerStockBottles = setCustomerStockBottles;
let sequence = 0;
const id = (prefix) => `${prefix}-${Date.now()}-${++sequence}-${Math.random().toString(36).slice(2, 8)}`;
exports.id = id;
function quantity(value, allowZero = false) {
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1))
        throw new Error(allowZero ? '数量必须为非负整数' : '数量必须为大于 0 的整数');
}
function money(value, allowZero = false) {
    if (!Number.isFinite(value) || value < (allowZero ? 0 : 0.01) || value > 99999999 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001)
        throw new Error('金额须为有效的非负数，最多两位小数');
}
const cents = (n) => Math.round(n * 100);
exports.cents = cents;
function customer(db, customerId) {
    const c = db.customers.find(c => c.id === customerId);
    if (!c || c.deletedAt)
        throw new Error('请选择酒吧');
    return c;
}
function product(db, productId) {
    const p = db.products.find(p => p.id === productId);
    if (!p || p.deletedAt)
        throw new Error('请选择商品');
    return p;
}
function touch(c) { c.lastOperatedAt = new Date().toISOString(); }
function record(db, type, title, description, amount, count, customerId) { db.records.unshift({ id: (0, exports.id)('record'), type, title, description, amount, quantityUnit: type === 'BOTTLE_RETURN' ? 'BOTTLE' : 'BOX', quantity: count, customerId, createdAt: new Date().toISOString() }); }
function move(db, productId, type, before, after, customerId, quantityUnit = 'BOX') { db.stockMovements.push({ id: (0, exports.id)('move'), productId, type, quantityUnit, quantity: after - before, beforeQuantity: before, afterQuantity: after, customerId, createdAt: new Date().toISOString() }); }
function customerStockBottles(s, defaultSize) { return s.quantity * (s.bottlesPerCase || defaultSize) + (s.looseBottleQuantity || 0); }
function setCustomerStockBottles(s, total, size) { quantity(total, true); quantity(size); s.bottlesPerCase = size; s.quantity = Math.floor(total / size); s.looseBottleQuantity = total % size; }

};
BeerModules["services/inventoryService"] = function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inventoryService = void 0;
const helpers_1 = require("./helpers");
const storageService_1 = require("./storageService");
const helpers_2 = require("./helpers");
exports.inventoryService = {
    purchase(productId, count) { (0, helpers_2.quantity)(count); storageService_1.storageService.transaction(db => { const p = (0, helpers_2.product)(db, productId); const before = p.stock; (0, helpers_2.quantity)(before + count, true); p.stock += count; (0, helpers_2.move)(db, p.id, 'PURCHASE', before, p.stock); (0, helpers_2.record)(db, 'PURCHASE', '进货', `${p.name} × ${count}`, 0, count); }); },
    stocktake(productId, actual, customerId, actualLoose = 0) {
        (0, helpers_2.quantity)(actual, true);
        (0, helpers_2.quantity)(actualLoose, true);
        if (!customerId && actualLoose)
            throw new Error('仓库暂按整箱盘点');
        storageService_1.storageService.transaction(db => {
            const p = (0, helpers_2.product)(db, productId);
            let before = p.stock;
            if (customerId) {
                const c = (0, helpers_2.customer)(db, customerId);
                let s = db.customerStocks.find(s => s.customerId === customerId && s.productId === productId);
                if (!s) {
                    s = { id: (0, helpers_2.id)('cs'), customerId, productId, quantity: 0 };
                    db.customerStocks.push(s);
                }
                before = s.quantity;
                const size = s.bottlesPerCase || p.bottlesPerCase;
                if (actualLoose >= size)
                    throw new Error(`散瓶须少于 ${size} 瓶，请换算为整箱`);
                const beforeBottles = (0, helpers_1.customerStockBottles)(s, size);
                (0, helpers_1.setCustomerStockBottles)(s, actual * size + actualLoose, size);
                (0, helpers_2.record)(db, 'STOCKTAKE', '库存调整', `${p.name}：${beforeBottles} → ${actual * size + actualLoose} 瓶（${size}瓶/箱）`, 0, actual * size + actualLoose - beforeBottles, customerId);
                db.records[0].quantityUnit = 'BOTTLE';
                (0, helpers_2.move)(db, p.id, 'STOCKTAKE', beforeBottles, (0, helpers_1.customerStockBottles)(s, size), customerId, 'BOTTLE');
                (0, helpers_2.touch)(c);
            }
            else
                p.stock = actual;
            if (!customerId)
                (0, helpers_2.move)(db, p.id, 'STOCKTAKE', before, actual);
            if (!customerId)
                (0, helpers_2.record)(db, 'STOCKTAKE', '库存调整', `${p.name}：${before} → ${actual} 箱`, 0, actual - before, customerId);
        });
    }
};

};
BeerModules["services/paymentService"] = function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentService = exports.PAYMENT_METHODS = void 0;
const storageService_1 = require("./storageService");
const helpers_1 = require("./helpers");
exports.PAYMENT_METHODS = [{ value: 'WECHAT', label: '微信' }, { value: 'ALIPAY', label: '支付宝' }, { value: 'CASH', label: '现金' }, { value: 'BANK', label: '银行卡' }];
exports.paymentService = { createPayment(customerId, amount, paymentMethod, adjustment = { forgivenAmount: 0, reason: '' }) {
        (0, helpers_1.money)(amount);
        (0, helpers_1.money)(adjustment.forgivenAmount, true);
        if (adjustment.forgivenAmount > 0 && !adjustment.reason.trim())
            throw new Error('减免应收请填写协商说明');
        if (!exports.PAYMENT_METHODS.some(m => m.value === paymentMethod))
            throw new Error('请选择支付方式');
        storageService_1.storageService.transaction(db => {
            const c = (0, helpers_1.customer)(db, customerId);
            if ((0, helpers_1.cents)(amount) > (0, helpers_1.cents)(c.receivable))
                throw new Error('收款金额不能超过当前应收');
            if ((0, helpers_1.cents)(amount) + (0, helpers_1.cents)(adjustment.forgivenAmount) > (0, helpers_1.cents)(c.receivable))
                throw new Error('实收与减免合计不能超过当前应收');
            c.receivable = ((0, helpers_1.cents)(c.receivable) - (0, helpers_1.cents)(amount) - (0, helpers_1.cents)(adjustment.forgivenAmount)) / 100;
            (0, helpers_1.touch)(c);
            db.payments.push({ id: (0, helpers_1.id)('payment'), customerId, amount, paymentMethod, forgivenAmount: adjustment.forgivenAmount, adjustmentReason: adjustment.reason.trim(), createdAt: new Date().toISOString() });
            (0, helpers_1.record)(db, 'PAYMENT', '收款', exports.PAYMENT_METHODS.find(m => m.value === paymentMethod).label + (adjustment.forgivenAmount > 0 ? `；协商减免 ¥${adjustment.forgivenAmount}（${adjustment.reason.trim()}）` : ''), amount, 0, customerId);
        });
    } };

};
BeerModules["services/productService"] = function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productService = void 0;
const storageService_1 = require("./storageService");
const helpers_1 = require("./helpers");
exports.productService = {
    list(includeDeleted = false) { return storageService_1.storageService.read().products.filter(p => includeDeleted || !p.deletedAt); },
    remove(productId) {
        storageService_1.storageService.transaction(db => {
            const p = (0, helpers_1.product)(db, productId);
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
    restore(productId) {
        storageService_1.storageService.transaction(db => {
            const p = db.products.find(p => p.id === productId);
            if (!p || !p.deletedAt)
                throw new Error('找不到已删除商品');
            if (db.products.some(other => !other.deletedAt && other.id !== p.id && other.name === p.name))
                throw new Error('已有同名商品，请先修改在用商品名称再恢复');
            delete p.deletedAt;
        });
    },
    save(input) {
        if (!input.name.trim())
            throw new Error('商品名称不能为空');
        (0, helpers_1.money)(input.price, true);
        (0, helpers_1.quantity)(input.stock, true);
        (0, helpers_1.quantity)(input.lowStockThreshold, true);
        if (input.bottlesPerCase !== undefined)
            (0, helpers_1.quantity)(input.bottlesPerCase);
        return storageService_1.storageService.transaction(db => {
            if (db.products.some(p => !p.deletedAt && p.name === input.name.trim() && p.id !== input.id))
                throw new Error('商品名称已存在');
            if (input.id) {
                const p = (0, helpers_1.product)(db, input.id);
                const before = p.stock;
                Object.assign(p, { ...input, bottlesPerCase: input.bottlesPerCase ?? p.bottlesPerCase, name: input.name.trim() });
                if (before !== p.stock) {
                    (0, helpers_1.move)(db, p.id, 'STOCKTAKE', before, p.stock);
                    (0, helpers_1.record)(db, 'STOCKTAKE', '库存调整', `${p.name}：${before} → ${p.stock} 箱`, 0, p.stock - before);
                }
                return p;
            }
            const p = { ...input, bottlesPerCase: input.bottlesPerCase ?? 24, id: (0, helpers_1.id)('product'), name: input.name.trim(), createdAt: new Date().toISOString() };
            db.products.push(p);
            if (p.stock > 0) {
                (0, helpers_1.move)(db, p.id, 'PURCHASE', 0, p.stock);
                (0, helpers_1.record)(db, 'PURCHASE', '新增商品期初库存', `${p.name} × ${p.stock}`, 0, p.stock);
            }
            return p;
        });
    }
};

};
BeerModules["services/receiptService"] = function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.receiptService = void 0;
const storageService_1 = require("./storageService");
const helpers_1 = require("./helpers");
function cleanup(paths) { paths.forEach(path => wx.getFileSystemManager().unlink({ filePath: path })); }
exports.receiptService = {
    list(recordId) {
        const r = storageService_1.storageService.read().records.find(r => r.id === recordId);
        if (!r)
            throw new Error('业务记录不存在');
        return r.receipts || [];
    },
    async attach(recordId, files) {
        const existing = this.list(recordId);
        if (!files.length)
            return;
        if (existing.length + files.length > 6)
            throw new Error('每笔业务最多保存 6 张收据');
        if (files.some(f => !f.tempFilePath || f.size <= 0 || f.size > 5 * 1024 * 1024))
            throw new Error('每张图片需小于等于 5MB');
        const saved = [];
        try {
            for (const f of files) {
                const path = await new Promise((resolve, reject) => wx.getFileSystemManager().saveFile({ tempFilePath: f.tempFilePath, success: result => resolve(result.savedFilePath), fail: () => reject(new Error('收据保存失败，请检查设备剩余空间')) }));
                saved.push({ id: (0, helpers_1.id)('receipt'), path, createdAt: new Date().toISOString() });
            }
            storageService_1.storageService.transaction(db => {
                const r = db.records.find(r => r.id === recordId);
                if (!r)
                    throw new Error('业务记录不存在');
                if ((r.receipts || []).length + saved.length > 6)
                    throw new Error('每笔业务最多保存 6 张收据');
                r.receipts = [...(r.receipts || []), ...saved];
            });
        }
        catch (e) {
            cleanup(saved.map(r => r.path));
            throw e;
        }
    },
    remove(recordId, receiptId) {
        const receipt = this.list(recordId).find(r => r.id === receiptId);
        if (!receipt)
            throw new Error('收据不存在');
        storageService_1.storageService.transaction(db => { const r = db.records.find(r => r.id === recordId); r.receipts = (r.receipts || []).filter(r => r.id !== receiptId); });
        cleanup([receipt.path]);
    }
};

};
BeerModules["services/recordService"] = function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordService = void 0;
const storageService_1 = require("./storageService");
const format_1 = require("../utils/format");
exports.recordService = {
    list(filter = 'ALL', customerId) { const db = storageService_1.storageService.read(); return db.records.filter(r => (!customerId || r.customerId === customerId) && (filter === 'ALL' || (filter === 'INVENTORY' ? (r.type === 'PURCHASE' || r.type === 'STOCKTAKE') : r.type === filter))).map(r => ({ ...r, customerName: r.customerId ? (db.customers.find(c => c.id === r.customerId)?.name || '未知酒吧') + (db.customers.find(c => c.id === r.customerId)?.deletedAt ? '（已删除）' : '') : '仓库', unitText: r.quantityUnit === 'BOTTLE' ? '瓶' : '箱', timeText: (0, format_1.dateText)(r.createdAt), amountText: (0, format_1.moneyText)(r.amount), quantityText: r.type === 'STOCKTAKE' && r.quantity > 0 ? '+' + r.quantity : String(r.quantity) })); },
    dashboard() { const db = storageService_1.storageService.read(); const today = (0, format_1.dayKey)(new Date().toISOString()); const todaysDeliveries = db.deliveries.filter(d => (0, format_1.dayKey)(d.createdAt) === today); return { todayDelivery: todaysDeliveries.reduce((n, d) => n + d.totalQuantity, 0), todayPayment: db.payments.filter(p => (0, format_1.dayKey)(p.createdAt) === today).reduce((n, p) => n + Math.round(p.amount * 100), 0) / 100 + todaysDeliveries.filter(d => d.paymentType === 'PAID').reduce((n, d) => n + Math.round(d.totalAmount * 100), 0) / 100, receivable: db.customers.filter(c => !c.deletedAt).reduce((n, c) => n + Math.round(c.receivable * 100), 0) / 100, emptyBottles: db.customers.filter(c => !c.deletedAt).reduce((n, c) => n + c.emptyBottleCount, 0) }; }
};

};
BeerModules["services/storageService"] = function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageService = exports.MIGRATION_BACKUP_KEY = exports.STORAGE_KEY = void 0;
exports.migrateLegacy = migrateLegacy;
const seed_1 = require("../mock/seed");
exports.STORAGE_KEY = 'beer-manager:v1';
exports.MIGRATION_BACKUP_KEY = 'beer-manager:v1:backup-before-v2';
const clone = (db) => JSON.parse(JSON.stringify(db));
function validShape(value) {
    if (!value || typeof value !== 'object')
        return false;
    const db = value;
    return ['products', 'customers', 'customerStocks', 'deliveries', 'payments', 'bottleReturns', 'stockMovements', 'records'].every(key => Array.isArray(db[key]));
}
// 旧版空瓶单位为箱，按 24 瓶/箱迁移一次。保留原快照，库存和金额不变。
function migrateLegacy(stored) {
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
exports.storageService = {
    read() {
        const stored = wx.getStorageSync(exports.STORAGE_KEY);
        if (stored === '' || stored === undefined || stored === null) {
            const db = (0, seed_1.createSeed)();
            wx.setStorageSync(exports.STORAGE_KEY, db);
            return clone(db);
        }
        if (!validShape(stored))
            throw new Error('本地数据格式异常，请在「我的」中重置数据');
        const version = stored.version;
        if (version === 1) {
            const db = migrateLegacy(stored);
            const backup = wx.getStorageSync(exports.MIGRATION_BACKUP_KEY);
            if (!backup)
                wx.setStorageSync(exports.MIGRATION_BACKUP_KEY, stored);
            wx.setStorageSync(exports.STORAGE_KEY, db);
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
            wx.setStorageSync(exports.STORAGE_KEY, db);
            return clone(db);
        }
        return clone(stored);
    },
    transaction(mutate) { const db = this.read(); const result = mutate(db); wx.setStorageSync(exports.STORAGE_KEY, db); return result; },
    reset() {
        const stored = wx.getStorageSync(exports.STORAGE_KEY);
        const paths = validShape(stored) ? stored.records.flatMap(r => (r.receipts || []).map(f => f.path)) : [];
        wx.setStorageSync(exports.STORAGE_KEY, (0, seed_1.createSeed)());
        paths.forEach(filePath => wx.getFileSystemManager().unlink({ filePath }));
    }
};

};
BeerModules["mock/seed"] = function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSeed = createSeed;
function createSeed() {
    const createdAt = new Date().toISOString();
    return { version: 2,
        products: [['p-u8', '燕京 U8', 72, 82], ['p-pure', '燕京纯生', 68, 45], ['p-white', '燕京白啤', 75, 23], ['p-fresh', '燕京鲜啤', 65, 12]].map(([id, name, price, stock]) => ({ id: String(id), name: String(name), price: Number(price), stock: Number(stock), lowStockThreshold: 15, bottlesPerCase: 24, createdAt })),
        customers: [{ id: 'c-old', name: '示例酒吧 A', contactName: '示例联系人', receivable: 3420, emptyBottleCount: 18 }, { id: 'c-space', name: 'DEMO BAR B', contactName: '', receivable: 0, emptyBottleCount: 38 }, { id: 'c-1988', name: 'DEMO BAR C', contactName: '', receivable: 1860, emptyBottleCount: 8 }].map(c => ({ ...c, phone: '', address: '', remark: '', productPrices: {}, emptyBottleCount: c.emptyBottleCount * 24, createdAt })),
        customerStocks: [['c-old', 'p-u8', 12], ['c-old', 'p-pure', 8], ['c-space', 'p-u8', 16], ['c-space', 'p-white', 12], ['c-1988', 'p-u8', 3], ['c-1988', 'p-pure', 2]].map(([customerId, productId, quantity], i) => ({ id: 'cs-' + i, customerId: String(customerId), productId: String(productId), quantity: Number(quantity) })),
        deliveries: [], payments: [], bottleReturns: [], stockMovements: [], records: [] };
}

};
BeerModules["utils/format"] = function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dayKey = exports.dateText = exports.moneyText = void 0;
const moneyText = (value) => value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
exports.moneyText = moneyText;
const dateText = (iso) => { const d = new Date(iso); const pad = (v) => String(v).padStart(2, '0'); return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
exports.dateText = dateText;
const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
exports.dayKey = dayKey;

};
const BeerCache={}; function beerRequire(id){if(BeerCache[id])return BeerCache[id].exports;const module={exports:{}};BeerCache[id]=module;BeerModules[id](request=>{const parts=id.split('/');parts.pop();for(const p of request.split('/')){if(p==='..')parts.pop();else if(p!=='.')parts.push(p);}return beerRequire(parts.join('/'));},module,module.exports);return module.exports;} window.beerRequire=beerRequire;
