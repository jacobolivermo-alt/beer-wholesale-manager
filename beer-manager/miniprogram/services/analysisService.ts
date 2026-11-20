import { storageService } from './storageService';
import { cents } from './helpers';
import { dayKey, moneyText } from '../utils/format';
export type AnalysisPeriod = 'WEEK' | 'MONTH' | '7' | '30' | 'ALL';
export function periodRange(period: AnalysisPeriod, offset = 0, now = new Date()) {
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
    return { start, end, label: period === 'ALL' ? '全部业务' : `${dayKey(start.toISOString())} — ${dayKey(last.toISOString())}` };
}
export interface ChartPoint {
    label: string;
    sales: number;
    collected: number;
    quantity: number;
    returned: number;
}
const sum = (values: number[]): number => values.reduce((n, v) => n + cents(v), 0) / 100;
export const analysisService = { summary(period: AnalysisPeriod = 'MONTH', offset = 0, now = new Date()) {
        const db = storageService.read();
        const range = periodRange(period, offset, now);
        const included = (date: string): boolean => new Date(date) >= range.start && new Date(date) < range.end;
        const deliveries = db.deliveries.filter(d => included(d.createdAt));
        const payments = db.payments.filter(p => included(p.createdAt));
        const returns = db.bottleReturns.filter(r => included(r.createdAt));
        const sales = sum(deliveries.map(d => d.totalAmount));
        const collected = sum([...payments.map(p => p.amount), ...deliveries.filter(d => d.paymentType === 'PAID').map(d => d.totalAmount)]);
        const active = db.customers.filter(c => !c.deletedAt);
        const customers = db.customers.map(c => { const ds = deliveries.filter(d => d.customerId === c.id); return { id: c.id, name: c.name + (c.deletedAt ? '（已删除）' : ''), amount: sum(ds.map(d => d.totalAmount)), quantity: ds.reduce((n, d) => n + d.totalQuantity, 0) }; }).filter(c => c.quantity > 0).sort((a, b) => b.amount - a.amount).map(c => ({ ...c, amountText: moneyText(c.amount), width: sales > 0 ? Math.max(2, Math.round(c.amount / sales * 100)) : 0 }));
        const productRows = db.products.map(p => ({ id: p.id, name: p.name, quantity: deliveries.flatMap(d => d.items).filter(i => i.productId === p.id).reduce((n, i) => n + i.quantity, 0) })).filter(p => p.quantity > 0).sort((a, b) => b.quantity - a.quantity);
        const maxProduct = productRows[0]?.quantity || 0;
        const products = productRows.map(p => ({ ...p, width: maxProduct ? Math.max(2, Math.round(p.quantity / maxProduct * 100)) : 0 }));
        const keys = [...new Set([...deliveries.map(d => dayKey(d.createdAt)), ...payments.map(p => dayKey(p.createdAt)), ...returns.map(r => dayKey(r.createdAt))])].sort().reverse();
        const daily = keys.map(day => ({ day, salesText: moneyText(sum(deliveries.filter(d => dayKey(d.createdAt) === day).map(d => d.totalAmount))), collectedText: moneyText(sum([...payments.filter(p => dayKey(p.createdAt) === day).map(p => p.amount), ...deliveries.filter(d => dayKey(d.createdAt) === day && d.paymentType === 'PAID').map(d => d.totalAmount)])) }));
        const points: ChartPoint[] = [];
        const bucket = (label: string, start: Date, end: Date) => {
            const inBucket = (date: string) => new Date(date) >= start && new Date(date) < end;
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
        return { rangeLabel: range.label, chartNote: period === 'ALL' ? '图表显示最近12个月，指标统计全部业务' : period === 'MONTH' ? '按月内日期分段汇总，包含无业务日期' : '按自然日汇总，包含无业务日期', points, salesText: moneyText(sales), collectedText: moneyText(collected), quantity: deliveries.reduce((n, d) => n + d.totalQuantity, 0), returned: returns.reduce((n, r) => n + r.quantity, 0), negotiatedText: moneyText(sum(deliveries.map(d => (d.calculatedAmount ?? d.totalAmount) - d.totalAmount))), forgivenText: moneyText(sum(payments.map(p => p.forgivenAmount || 0))), receivableText: moneyText(sum(active.map(c => c.receivable))), bottles: active.reduce((n, c) => n + c.emptyBottleCount, 0), customers, products, daily };
    } };
export function chartModel(points: ChartPoint[], kind: 'MONEY' | 'DELIVERY' | 'BOTTLE') {
    const values = points.map(p => ({ ...p, first: kind === 'MONEY' ? p.sales : kind === 'DELIVERY' ? p.quantity : p.returned, second: kind === 'MONEY' ? p.collected : 0 }));
    const max = Math.max(0, ...values.flatMap(p => [p.first, p.second]));
    return { maxText: moneyText(max), empty: max === 0, points: values.map(p => ({ ...p, firstText: moneyText(p.first), secondText: moneyText(p.second), firstHeight: max && p.first ? Math.max(1, Math.round(p.first / max * 100)) : 0, secondHeight: max && p.second ? Math.max(1, Math.round(p.second / max * 100)) : 0 })) };
}
