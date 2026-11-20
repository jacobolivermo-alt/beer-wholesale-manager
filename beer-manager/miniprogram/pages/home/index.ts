import { productService } from '../../services/productService';
import { customerService } from '../../services/customerService';
import { recordService } from '../../services/recordService';
import { moneyText } from '../../utils/format';
import { tab, errorText, openOperation } from '../../utils/ui';
interface Attention {
    id: string;
    name: string;
    detail: string;
    tone: string;
}
Page({ data: { stats: { todayDelivery: 0, todayPayment: '0', receivable: '0', emptyBottles: 0 }, products: productService.list(), attention: [] as Attention[], error: '' },
    onShow() { tab(this, 0); this.refresh(); },
    refresh() {
        try {
            const stats = recordService.dashboard();
            const customers = customerService.list();
            const attention: Attention[] = [];
            customers.forEach(c => {
                if (c.receivable > 0)
                    attention.push({ id: c.id, name: c.name, detail: `欠款 ¥${moneyText(c.receivable)}`, tone: 'danger' });
                if (c.emptyBottleCount >= 30 * 24)
                    attention.push({ id: c.id, name: c.name, detail: `待回空瓶 ${c.emptyBottleCount} 瓶`, tone: 'warning' });
                if (c.stockTotal < 10)
                    attention.push({ id: c.id, name: c.name, detail: `库存仅剩 ${c.stockTotal} 箱${c.looseTotal ? '＋' + c.looseTotal + '瓶' : ''}`, tone: 'warning' });
            });
            this.setData({ stats: { todayDelivery: stats.todayDelivery, todayPayment: moneyText(stats.todayPayment), receivable: moneyText(stats.receivable), emptyBottles: stats.emptyBottles }, products: productService.list(), attention, error: '' });
        }
        catch (e) {
            this.setData({ error: errorText(e) });
        }
    },
    openCustomer(e: UIEvent) { wx.navigateTo({ url: '/pages/customer-detail/index?id=' + e.currentTarget.dataset.id }); }, deliver() { openOperation('DELIVERY'); }, purchase() { openOperation('PURCHASE'); }
});
