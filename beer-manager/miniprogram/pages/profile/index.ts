import { dialogData, openConfirmation, resolveConfirmation } from '../../utils/ui';
import { storageService } from '../../services/storageService';
import { tab } from '../../utils/ui';
Page({ acceptDialog() { resolveConfirmation(this, true); }, cancelDialog() { resolveConfirmation(this, false); }, analysis() { wx.navigateTo({ url: '/pages/analysis/index' }); }, data: { ...dialogData, }, onShow() { tab(this, 4); }, manage(e: UIEvent) { wx.navigateTo({ url: '/pages/manage/index?kind=' + e.currentTarget.dataset.kind }); }, reset() { openConfirmation(this, '重置全部数据？', '将清除所有新增资料和业务记录，并恢复初始商品与酒吧。此操作无法撤销。', () => { storageService.reset(); wx.showToast({ title: '已恢复初始数据' }); }); }, about() { wx.navigateTo({ url: '/pages/about/index' }); } });
