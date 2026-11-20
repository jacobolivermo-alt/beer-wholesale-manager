import { bottleService } from '../../services/bottleService';
import { productService } from '../../services/productService';
import { dialogData, openConfirmation, resolveConfirmation } from '../../utils/ui';
import { Customer } from '../../types/models';
import { customerService } from '../../services/customerService';
import { recordService } from '../../services/recordService';
import { moneyText } from '../../utils/format';
import { openOperation, errorText } from '../../utils/ui';
Page({ acceptDialog() { resolveConfirmation(this, true); }, cancelDialog() { resolveConfirmation(this, false); }, openRecord(e: UIEvent) { wx.navigateTo({ url: '/pages/record-detail/index?id=' + e.currentTarget.dataset.id }); }, data: { ...dialogData, unclassified: 0, bottleKinds: [] as ReturnType<typeof bottleService.list>, products: productService.list(), classProductIndex: 0, classQuantity: '', id: '', customer: null as Customer | null, stocks: [] as ReturnType<typeof customerService.stocks>, records: [] as ReturnType<typeof recordService.list>, amountText: '0', error: '' },
    onLoad(options: {
        id?: string;
    }) { this.setData({ id: options.id || '' }); }, onShow() {
        try {
            const c = customerService.get(this.data.id);
            this.setData({ bottleKinds: bottleService.list(c.id), unclassified: c.emptyBottlesByProduct?.UNCLASSIFIED || 0 });
            this.setData({ customer: c, stocks: customerService.stocks(c.id), amountText: moneyText(c.receivable), records: recordService.list('ALL', c.id).slice(0, 8), error: '' });
        }
        catch (e) {
            this.setData({ error: errorText(e) });
        }
    },
    classProduct(e: UIEvent) { this.setData({ classProductIndex: Number(e.detail.value) }); }, classInput(e: UIEvent) { this.setData({ classQuantity: e.detail.value }); }, classify() {
        try {
            if (!/^\d+$/.test(this.data.classQuantity) || Number(this.data.classQuantity) < 1)
                throw new Error('分类数量须为正整数瓶');
            const p = this.data.products[this.data.classProductIndex];
            if (!p)
                throw new Error('请选择商品');
            const count = Number(this.data.classQuantity);
            openConfirmation(this, '确认空瓶分类？', `历史未分类 → ${p.name}\n${count} 瓶，总待回不变`, () => { bottleService.classify(this.data.id, p.id, count); this.setData({ classQuantity: '' }); this.onShow(); wx.showToast({ title: '已完成分类' }); }, error => this.setData({ error }));
        }
        catch (e) {
            this.setData({ error: errorText(e) });
        }
    },
    operate(e: UIEvent) { openOperation(e.currentTarget.dataset.type, this.data.id); }, call() {
        if (this.data.customer?.phone)
            wx.makePhoneCall({ phoneNumber: this.data.customer.phone });
    }, edit() { wx.navigateTo({ url: '/pages/editor/index?kind=CUSTOMER&id=' + this.data.id }); }, allRecords() { wx.navigateTo({ url: '/pages/customer-records/index?id=' + this.data.id }); }
});
