import { dialogData, openConfirmation, resolveConfirmation } from '../../utils/ui';
import { productService } from '../../services/productService';
import { customerService } from '../../services/customerService';
import { moneyText } from '../../utils/format';
Page({
    data: { ...dialogData, kind: 'PRODUCT', showDeleted: false, deletedCount: 0,
        products: [] as (ReturnType<typeof productService.list>[number] & { priceText: string })[],
        customers: [] as ReturnType<typeof customerService.list> },
    acceptDialog() { resolveConfirmation(this, true); },
    cancelDialog() { resolveConfirmation(this, false); },
    onLoad(o: { kind?: string }) { this.setData({ kind: o.kind === 'CUSTOMER' ? 'CUSTOMER' : 'PRODUCT' }); },
    onShow() { this.refresh(); },
    refresh() { const all = productService.list(true); this.setData({
        deletedCount: all.filter(p => !!p.deletedAt).length,
        products: all.filter(p => this.data.showDeleted ? !!p.deletedAt : !p.deletedAt).map(p => ({ ...p, priceText: moneyText(p.price) })),
        customers: customerService.list() }); },
    switchProducts(e: UIEvent) { this.setData({ showDeleted: e.currentTarget.dataset.deleted === 'true' }); this.refresh(); },
    edit(e: UIEvent) { wx.navigateTo({ url: '/pages/editor/index?kind=' + this.data.kind + '&id=' + (e.currentTarget.dataset.id || '') }); },
    removeProduct(e: UIEvent) { const id = e.currentTarget.dataset.id;
        openConfirmation(this, '删除商品？', '从在用列表与业务选项移除，历史单据保留，可在已删除列表恢复。仓库、在用酒吧库存和该商品待回空瓶须为零。', () => {
            productService.remove(id); this.refresh(); wx.showToast({ title: '已删除商品' });
        }, message => wx.showToast({ title: message, icon: 'none' })); },
    restoreProduct(e: UIEvent) { const id = e.currentTarget.dataset.id;
        openConfirmation(this, '恢复商品？', '恢复后可再次进货、送货；原有历史单据保留。', () => {
            productService.restore(id); this.refresh(); wx.showToast({ title: '已恢复商品' });
        }, message => wx.showToast({ title: message, icon: 'none' })); },
    remove(e: UIEvent) { const id = e.currentTarget.dataset.id;
        openConfirmation(this, '删除酒吧？', '从客户列表移除，历史流水和库存保留。欠款及待回空瓶须先结清。', () => {
            customerService.remove(id); this.refresh(); wx.showToast({ title: '已删除酒吧' });
        }, message => wx.showToast({ title: message, icon: 'none' })); }
});
