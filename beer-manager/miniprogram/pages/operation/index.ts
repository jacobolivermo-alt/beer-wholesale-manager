import { dialogData, openConfirmation, resolveConfirmation } from '../../utils/ui';
import { Product, PaymentType, PaymentMethod, RecordType } from '../../types/models';
import { productService } from '../../services/productService';
import { customerService } from '../../services/customerService';
import { deliveryService } from '../../services/deliveryService';
import { bottleService } from '../../services/bottleService';
import { paymentService, PAYMENT_METHODS } from '../../services/paymentService';
import { inventoryService } from '../../services/inventoryService';
import { moneyText } from '../../utils/format';
import { errorText } from '../../utils/ui';
interface ProductInput extends Product {
    quantity: number;
    priceText: string;
    unitPriceInput: string;
    caseSizeInput: string;
}
const TITLES: Record<RecordType, string> = { DELIVERY: '送货', PURCHASE: '进货', BOTTLE_RETURN: '回瓶', PAYMENT: '收款', STOCKTAKE: '盘点' };
Page({ acceptDialog() { resolveConfirmation(this, true); }, cancelDialog() { resolveConfirmation(this, false); }, data: { ...dialogData, type: 'DELIVERY' as RecordType, title: '送货', customerId: '', customerName: '请选择酒吧', customers: [] as ReturnType<typeof customerService.list>, customerIndex: 0, products: [] as ProductInput[], productIndex: 0, productName: '请选择商品', productId: '', quantity: 0, systemStock: 0, scope: 'WAREHOUSE', paymentType: 'CREDIT' as PaymentType, paymentMethod: 'WECHAT' as PaymentMethod, methods: PAYMENT_METHODS, amount: '', receivable: 0, receivableText: '0', bottles: 0, totalQuantity: 0, totalAmount: '0', totalBottles: 0, returnCaseSize: '24', finalAmount: '', adjustmentReason: '', forgivenAmount: '0', bottleKinds: [] as ReturnType<typeof bottleService.list>, bottleKindIndex: 0, bottleProductId: '', bottleKindName: '请选择空瓶种类', bottleKindBalance: 0, deductInventory: true, stocktakeLoose: '0', inventoryCaseSize: 24, systemLoose: 0, error: '', confirming: false },
    onLoad(o: {
        type?: string;
        customerId?: string;
    }) {
        const type = (o.type || 'DELIVERY') as RecordType;
        if (!TITLES[type]) {
            this.setData({ error: '未知操作' });
            return;
        }
        const products = productService.list().map(p => ({ ...p, quantity: 0, priceText: moneyText(p.price), unitPriceInput: String(p.price), caseSizeInput: String(p.bottlesPerCase) }));
        const customers = customerService.list();
        this.setData({ type, title: TITLES[type], products, customers, scope: o.customerId ? 'CUSTOMER' : 'WAREHOUSE' });
        if (o.customerId)
            this.selectCustomer(o.customerId);
    },
    selectCustomer(customerId: string) {
        const c = customerService.get(customerId);
        this.setData({ customerId: c.id, customerName: c.name, customerIndex: Math.max(0, this.data.customers.findIndex(i => i.id === c.id)), receivable: c.receivable, receivableText: moneyText(c.receivable), bottles: c.emptyBottleCount, error: '' });
        if (this.data.type === 'BOTTLE_RETURN') {
            const kinds = bottleService.list(c.id);
            this.setData({ bottleKinds: kinds, bottleKindIndex: 0, quantity: 0 });
            this.selectBottleKind(0);
        }
        this.updateSystemStock();
        if (this.data.type === 'DELIVERY') {
            this.setData({ products: this.data.products.map(p => ({ ...p, unitPriceInput: String(deliveryService.customerPrice(c.id, p.id)) })) });
            this.recalculate();
        }
    },
    customerChanged(e: UIEvent) {
        const index = Number(e.detail.value);
        const c = this.data.customers[index];
        if (c)
            this.selectCustomer(c.id);
    },
    selectBottleKind(index: number) { const kind = this.data.bottleKinds[index]; this.setData({ bottleKindIndex: index, bottleProductId: kind?.productId || '', bottleKindName: kind?.name || '暂无待回空瓶', bottleKindBalance: kind?.quantity || 0, returnCaseSize: String(kind?.bottlesPerCase || 24), quantity: 0, deductInventory: kind?.productId !== 'UNCLASSIFIED', error: '' }); },
    deductChanged(e: UIEvent<{
        value: boolean;
    }>) { this.setData({ deductInventory: e.detail.value }); }, looseInput(e: UIEvent) { this.setData({ stocktakeLoose: e.detail.value, error: '' }); },
    bottleKindChanged(e: UIEvent) { this.selectBottleKind(Number(e.detail.value)); },
    productChanged(e: UIEvent) {
        const index = Number(e.detail.value);
        const p = this.data.products[index];
        if (p) {
            this.setData({ productIndex: index, productId: p.id, productName: p.name, error: '' });
            this.updateSystemStock();
        }
    },
    scopeChanged(e: UIEvent) { this.setData({ scope: e.currentTarget.dataset.value, error: '' }); this.updateSystemStock(); },
    updateSystemStock() {
        if (!this.data.productId)
            return;
        const p = this.data.products.find(p => p.id === this.data.productId);
        const stock = this.data.scope === 'CUSTOMER' && this.data.customerId ? customerService.stocks(this.data.customerId).find(p => p.id === this.data.productId)?.quantity || 0 : p?.stock || 0;
        const cs = this.data.scope === 'CUSTOMER' && this.data.customerId ? customerService.stocks(this.data.customerId).find(p => p.id === this.data.productId) : undefined;
        this.setData({ inventoryCaseSize: cs?.inventoryCaseSize || p?.bottlesPerCase || 24, systemLoose: cs?.looseBottleQuantity || 0, stocktakeLoose: String(cs?.looseBottleQuantity || 0) });
        this.setData({ systemStock: stock, quantity: this.data.type === 'STOCKTAKE' ? stock : 0 });
    },
    deliveryInputs() {
        return this.data.products.filter(p => p.quantity > 0).map(p => {
            if (!/^\d+(\.\d{1,2})?$/.test(p.unitPriceInput))
                throw new Error(`${p.name}：请输入有效本次单价`);
            if (!/^\d+$/.test(p.caseSizeInput) || Number(p.caseSizeInput) < 1)
                throw new Error(`${p.name}：每箱瓶数必须为正整数`);
            return { productId: p.id, quantity: p.quantity, unitPrice: Number(p.unitPriceInput), bottlesPerCase: Number(p.caseSizeInput) };
        });
    },
    recalculate() {
        try {
            const inputs = this.deliveryInputs();
            if (!inputs.length) {
                this.setData({ totalQuantity: 0, totalAmount: '0', totalBottles: 0, error: '' });
                return;
            }
            const q = deliveryService.quote(inputs, false, this.data.customerId);
            this.setData({ totalQuantity: q.totalQuantity, totalAmount: moneyText(q.totalAmount), totalBottles: q.totalEmptyBottleQuantity, error: '' });
        }
        catch (err) {
            this.setData({ error: errorText(err), totalAmount: '—', totalBottles: 0 });
        }
    },
    changeItem(e: UIEvent<{
        value: number;
    }>) {
        this.setData({ products: this.data.products.map(p => p.id === e.currentTarget.dataset.id ? { ...p, quantity: e.detail.value } : p) });
        this.recalculate();
    },
    priceInput(e: UIEvent) {
        this.setData({ products: this.data.products.map(p => p.id === e.currentTarget.dataset.id ? { ...p, unitPriceInput: e.detail.value } : p) });
        this.recalculate();
    },
    caseSizeInput(e: UIEvent) {
        this.setData({ products: this.data.products.map(p => p.id === e.currentTarget.dataset.id ? { ...p, caseSizeInput: e.detail.value } : p) });
        this.recalculate();
    },
    returnCaseInput(e: UIEvent) { this.setData({ returnCaseSize: e.detail.value, error: '' }); },
    appendCase() {
        try {
            if (!/^\d+$/.test(this.data.returnCaseSize))
                throw new Error('每箱瓶数必须为正整数');
            const count = bottleService.fromCases(1, Number(this.data.returnCaseSize));
            this.setData({ quantity: this.data.quantity + count, error: '' });
        }
        catch (e) {
            this.setData({ error: errorText(e) });
        }
    },
    changeQuantity(e: UIEvent<{
        value: number;
    }>) { this.setData({ quantity: e.detail.value, error: '' }); },
    amountInput(e: UIEvent) { this.setData({ amount: e.detail.value, error: '' }); },
    choosePayment(e: UIEvent) { this.setData({ paymentType: e.currentTarget.dataset.value as PaymentType }); },
    chooseMethod(e: UIEvent) { this.setData({ paymentMethod: e.currentTarget.dataset.value as PaymentMethod }); },
    settlementInput(e: UIEvent) {
        const field = e.currentTarget.dataset.field;
        if (field === 'finalAmount')
            this.setData({ finalAmount: e.detail.value, error: '' });
        if (field === 'adjustmentReason')
            this.setData({ adjustmentReason: e.detail.value, error: '' });
        if (field === 'forgivenAmount')
            this.setData({ forgivenAmount: e.detail.value, error: '' });
    },
    negotiatedAmount(calculated: number): number {
        if (!this.data.finalAmount.trim())
            return calculated;
        if (!/^\d+(\.\d{1,2})?$/.test(this.data.finalAmount))
            throw new Error('请输入有效协商货款，最多两位小数');
        return Number(this.data.finalAmount);
    },
    submit() {
        if (this.data.confirming)
            return;
        const d = this.data;
        this.setData({ error: '' });
        try {
            if ((d.type === 'DELIVERY' || d.type === 'PAYMENT' || d.type === 'BOTTLE_RETURN' || (d.type === 'STOCKTAKE' && d.scope === 'CUSTOMER')) && !d.customerId)
                throw new Error('请选择酒吧');
            if ((d.type === 'PURCHASE' || d.type === 'STOCKTAKE') && !d.productId)
                throw new Error('请选择商品');
            let content = '';
            if (d.type === 'DELIVERY') {
                const q = deliveryService.quote(this.deliveryInputs(), true, d.customerId);
                const agreed = this.negotiatedAmount(q.totalAmount);
                if (agreed !== q.totalAmount && !d.adjustmentReason.trim())
                    throw new Error('调整货款请填写协商说明');
                content = `计算金额 ¥${moneyText(q.totalAmount)} → 最终货款 ¥${moneyText(agreed)}\n${d.adjustmentReason}\n${d.customerName}\n${q.items.map(i => `${i.productName} × ${i.quantity} 箱 · ¥${i.unitPrice}/箱 · ${i.bottlesPerCase}瓶/箱`).join('\n')}\n共 ${q.totalQuantity} 箱 · 最终 ¥${moneyText(agreed)}\n${d.paymentType === 'CREDIT' ? '赊账，计入应收' : '已付款，计入今日收款'}，待回空瓶 +${q.totalEmptyBottleQuantity} 瓶`;
            }
            if (d.type === 'BOTTLE_RETURN')
                content = `${d.customerName}\n${d.bottleKindName}\n回收 ${d.quantity} 瓶\n该种类待回 ${d.bottleKindBalance} 瓶\n${d.deductInventory ? '同步扣减对应库存（按瓶估算）' : '只回收空瓶，不扣库存'}`;
            if (d.type === 'PAYMENT')
                content = `${d.customerName}\n收款 ¥${d.amount || '0'} · ${PAYMENT_METHODS.find(m => m.value === d.paymentMethod)!.label}`;
            if (d.type === 'PURCHASE')
                content = `仓库入库\n${d.productName} +${d.quantity} 箱`;
            if (d.type === 'STOCKTAKE')
                content = `${d.scope === 'CUSTOMER' ? d.customerName : '仓库'} · ${d.productName}\n系统 ${d.systemStock} 箱${d.scope === 'CUSTOMER' ? `＋${d.systemLoose} 瓶` : ''} → 实际 ${d.quantity} 箱${d.scope === 'CUSTOMER' ? `＋${d.stocktakeLoose} 瓶` : ''}\n仅调整库存，不改变欠款或待回空瓶`;
            if ((d.type === 'PURCHASE' || d.type === 'BOTTLE_RETURN') && d.quantity === 0)
                throw new Error('数量必须大于 0');
            if (d.type === 'BOTTLE_RETURN' && d.quantity > d.bottleKindBalance)
                throw new Error('回瓶数量不能超过该种类待回数量');
            if (d.type === 'PAYMENT') {
                const amount = Number(d.amount);
                if (!/^\d+(\.\d{1,2})?$/.test(d.amount) || !Number.isFinite(amount) || amount <= 0)
                    throw new Error('请输入大于 0 的金额，最多两位小数');
                if (amount > d.receivable)
                    throw new Error('收款金额不能超过当前应收');
                if (!/^\d+(\.\d{1,2})?$/.test(d.forgivenAmount))
                    throw new Error('请输入有效减免金额');
                const forgiven = Number(d.forgivenAmount);
                if (forgiven > 0 && !d.adjustmentReason.trim())
                    throw new Error('减免应收请填写协商说明');
                if (Math.round((amount + forgiven) * 100) > Math.round(d.receivable * 100))
                    throw new Error('实收与减免合计不能超过当前应收');
                content += `\n减免 ¥${d.forgivenAmount} · 剩余应收 ¥${moneyText((Math.round(d.receivable * 100) - Math.round(amount * 100) - Math.round(forgiven * 100)) / 100)}\n${d.adjustmentReason}`;
            }
            if (d.type === 'STOCKTAKE' && d.scope === 'CUSTOMER') {
                if (!/^\d+$/.test(d.stocktakeLoose) || Number(d.stocktakeLoose) >= d.inventoryCaseSize)
                    throw new Error(`散瓶须为 0 至 ${d.inventoryCaseSize - 1} 的整数`);
                content = `${d.customerName} · ${d.productName}\n系统 ${d.systemStock} 箱＋${d.systemLoose} 瓶 → 实际 ${d.quantity} 箱＋${d.stocktakeLoose} 瓶\n按 ${d.inventoryCaseSize} 瓶/箱盘点，不改变欠款与待回瓶`;
            }
            this.setData({ confirming: true });
            openConfirmation(this, `确认${d.title}？`, content, () => {
                if (d.type === 'DELIVERY')
                    deliveryService.createDelivery(d.customerId, this.deliveryInputs(), d.paymentType, { amount: this.negotiatedAmount(Number(d.totalAmount.replace(/,/g, ''))), reason: d.adjustmentReason });
                if (d.type === 'BOTTLE_RETURN')
                    bottleService.createReturn(d.customerId, [{ productId: d.bottleProductId, quantity: d.quantity }], d.deductInventory);
                if (d.type === 'PAYMENT')
                    paymentService.createPayment(d.customerId, Number(d.amount), d.paymentMethod, { forgivenAmount: Number(d.forgivenAmount), reason: d.adjustmentReason });
                if (d.type === 'PURCHASE')
                    inventoryService.purchase(d.productId, d.quantity);
                if (d.type === 'STOCKTAKE')
                    inventoryService.stocktake(d.productId, d.quantity, d.scope === 'CUSTOMER' ? d.customerId : undefined, d.scope === 'CUSTOMER' ? Number(d.stocktakeLoose) : 0);
                const message = d.type === 'PAYMENT' ? `已收款 ¥${moneyText(Number(d.amount))}` : d.type === 'BOTTLE_RETURN' ? `已回收 ${d.quantity} 瓶空瓶` : d.title + '成功';
                const destination = d.customerId && (d.type !== 'PURCHASE') && (d.type !== 'STOCKTAKE' || d.scope === 'CUSTOMER') ? d.customerId : '';
                if (destination) {
                    const pages = getCurrentPages();
                    const previous = pages[pages.length - 2];
                    if (previous?.route === 'pages/customer-detail/index' && previous.options.id === destination)
                        wx.navigateBack();
                    else
                        wx.redirectTo({ url: '/pages/customer-detail/index?id=' + destination });
                }
                else
                    wx.switchTab({ url: '/pages/home/index' });
                wx.showToast({ title: message, icon: d.type === 'PAYMENT' || d.type === 'BOTTLE_RETURN' ? 'none' : 'success' });
            }, message => this.setData({ error: message }), () => this.setData({ confirming: false }));
        }
        catch (e) {
            this.setData({ error: errorText(e) });
        }
    }
});
