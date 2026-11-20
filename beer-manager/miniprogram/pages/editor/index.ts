import { dialogData, openConfirmation, resolveConfirmation } from '../../utils/ui';
import { productService } from '../../services/productService';
import { customerService } from '../../services/customerService';
import { errorText } from '../../utils/ui';
Page({ acceptDialog() { resolveConfirmation(this, true); }, cancelDialog() { resolveConfirmation(this, false); }, data: { ...dialogData, id: '', kind: 'PRODUCT', name: '', price: '', stock: '0', threshold: '15', bottlesPerCase: '24', prices: [] as {
            productId: string;
            name: string;
            defaultPrice: string;
            value: string;
        }[], contactName: '', phone: '', address: '', remark: '', error: '', confirming: false }, onLoad(o: {
        kind?: string;
        id?: string;
    }) {
        this.setData({ kind: o.kind === 'CUSTOMER' ? 'CUSTOMER' : 'PRODUCT', id: o.id || '', prices: productService.list().map(p => ({ productId: p.id, name: p.name, defaultPrice: String(p.price), value: '' })) });
        if (o.id)
            try {
                if (this.data.kind === 'PRODUCT') {
                    const p = productService.list().find(p => p.id === o.id);
                    if (!p)
                        throw new Error('商品不存在');
                    this.setData({ name: p.name, price: String(p.price), stock: String(p.stock), threshold: String(p.lowStockThreshold), bottlesPerCase: String(p.bottlesPerCase) });
                }
                else {
                    const c = customerService.get(o.id);
                    this.setData({ name: c.name, contactName: c.contactName, phone: c.phone, address: c.address, remark: c.remark, prices: this.data.prices.map(p => ({ ...p, value: c.productPrices[p.productId] === undefined ? '' : String(c.productPrices[p.productId]) })) });
                }
            }
            catch (e) {
                this.setData({ error: errorText(e) });
            }
    }, input(e: UIEvent) {
        const field = e.currentTarget.dataset.field;
        const value = e.detail.value;
        switch (field) {
            case 'name':
                this.setData({ name: value });
                break;
            case 'price':
                this.setData({ price: value });
                break;
            case 'stock':
                this.setData({ stock: value });
                break;
            case 'threshold':
                this.setData({ threshold: value });
                break;
            case 'bottlesPerCase':
                this.setData({ bottlesPerCase: value });
                break;
            case 'contactName':
                this.setData({ contactName: value });
                break;
            case 'phone':
                this.setData({ phone: value });
                break;
            case 'address':
                this.setData({ address: value });
                break;
            case 'remark':
                this.setData({ remark: value });
                break;
        }
        this.setData({ error: '' });
    }, stockChange(e: { detail: { value: number } }) { this.setData({ stock: String(e.detail.value), error: '' }); }, priceInput(e: UIEvent) { this.setData({ prices: this.data.prices.map(p => p.productId === e.currentTarget.dataset.id ? { ...p, value: e.detail.value } : p), error: '' }); },
    customerPrices() {
        const prices: Record<string, number> = {};
        this.data.prices.forEach(p => {
            if (p.value.trim() !== '') {
                if (!/^\d+(\.\d{1,2})?$/.test(p.value))
                    throw new Error(`${p.name} 专属售价无效`);
                prices[p.productId] = Number(p.value);
            }
        });
        return prices;
    },
    remove() {
        if (!this.data.id || this.data.confirming) return;
        const isProduct = this.data.kind === 'PRODUCT';
        this.setData({ confirming: true });
        openConfirmation(this, isProduct ? '删除商品？' : '删除酒吧？', isProduct ? '商品移入已删除列表，历史单据保留。须先处理仓库、酒吧库存与该商品待回空瓶。' : '酒吧将从列表移除，历史流水和库存保留。欠款与待回空瓶必须先结清。', () => {
            if (isProduct) { productService.remove(this.data.id); wx.navigateBack(); }
            else { customerService.remove(this.data.id); wx.switchTab({ url: '/pages/customers/index' }); }
            wx.showToast({ title: isProduct ? '已删除商品' : '已删除酒吧' });
        }, error => this.setData({ error }), () => this.setData({ confirming: false }));
    },
    save() {
        if (this.data.confirming)
            return;
        const d = this.data;
        try {
            if (!d.name.trim())
                throw new Error('名称不能为空');
            if (d.kind === 'PRODUCT' && (!/^\d+(\.\d{1,2})?$/.test(d.price) || !/^\d+$/.test(d.stock) || !/^\d+$/.test(d.threshold) || !/^\d+$/.test(d.bottlesPerCase) || Number(d.bottlesPerCase) < 1))
                throw new Error('售价须为非负金额，库存和提醒值须为非负整数，每箱瓶数须为正整数');
            const productPrices = d.kind === 'CUSTOMER' ? this.customerPrices() : {};
            this.setData({ confirming: true });
            openConfirmation(this, '保存资料？', d.kind === 'PRODUCT' ? `${d.name}\n售价 ¥${d.price} · 库存 ${d.stock} 箱 · ${d.bottlesPerCase} 瓶/箱\n修改库存将生成库存调整记录` : `${d.name}\n${d.contactName} ${d.phone}`, () => {
                if (d.kind === 'PRODUCT')
                    productService.save({ id: d.id || undefined, name: d.name, price: Number(d.price), stock: Number(d.stock), lowStockThreshold: Number(d.threshold), bottlesPerCase: Number(d.bottlesPerCase) });
                else
                    customerService.save({ id: d.id || undefined, name: d.name, contactName: d.contactName, phone: d.phone, address: d.address, remark: d.remark, productPrices });
                wx.navigateBack();
                wx.showToast({ title: '保存成功' });
            }, message => this.setData({ error: message }), () => this.setData({ confirming: false }));
        }
        catch (e) {
            this.setData({ error: errorText(e) });
        }
    } });
