import { customerService } from '../../services/customerService';
import { moneyText } from '../../utils/format';
import { tab } from '../../utils/ui';
const rows = () => customerService.list().map(c => ({ ...c, amountText: moneyText(c.receivable) }));
Page({ data: { search: '', customers: rows() }, onShow() { tab(this, 1); this.refresh(); }, refresh() { this.setData({ customers: customerService.list(this.data.search).map(c => ({ ...c, amountText: moneyText(c.receivable) })) }); }, search(e: UIEvent) { this.setData({ search: e.detail.value }); this.refresh(); }, open(e: UIEvent) { wx.navigateTo({ url: '/pages/customer-detail/index?id=' + e.currentTarget.dataset.id }); }, add() { wx.navigateTo({ url: '/pages/manage/index?kind=CUSTOMER' }); } });
