import { PaymentMethod } from '../types/models';
import { storageService } from './storageService';
import { money, cents, customer, touch, id, record } from './helpers';
export const PAYMENT_METHODS = [{ value: 'WECHAT', label: '微信' }, { value: 'ALIPAY', label: '支付宝' }, { value: 'CASH', label: '现金' }, { value: 'BANK', label: '银行卡' }] as const;
export const paymentService = { createPayment(customerId: string, amount: number, paymentMethod: PaymentMethod, adjustment: {
        forgivenAmount: number;
        reason: string;
    } = { forgivenAmount: 0, reason: '' }): void {
        money(amount);
        money(adjustment.forgivenAmount, true);
        if (adjustment.forgivenAmount > 0 && !adjustment.reason.trim())
            throw new Error('减免应收请填写协商说明');
        if (!PAYMENT_METHODS.some(m => m.value === paymentMethod))
            throw new Error('请选择支付方式');
        storageService.transaction(db => {
            const c = customer(db, customerId);
            if (cents(amount) > cents(c.receivable))
                throw new Error('收款金额不能超过当前应收');
            if (cents(amount) + cents(adjustment.forgivenAmount) > cents(c.receivable))
                throw new Error('实收与减免合计不能超过当前应收');
            c.receivable = (cents(c.receivable) - cents(amount) - cents(adjustment.forgivenAmount)) / 100;
            touch(c);
            db.payments.push({ id: id('payment'), customerId, amount, paymentMethod, forgivenAmount: adjustment.forgivenAmount, adjustmentReason: adjustment.reason.trim(), createdAt: new Date().toISOString() });
            record(db, 'PAYMENT', '收款', PAYMENT_METHODS.find(m => m.value === paymentMethod)!.label + (adjustment.forgivenAmount > 0 ? `；协商减免 ¥${adjustment.forgivenAmount}（${adjustment.reason.trim()}）` : ''), amount, 0, customerId);
        });
    } };
