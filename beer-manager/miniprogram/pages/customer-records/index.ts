import { recordService } from '../../services/recordService';
Page({ openRecord(e: UIEvent) { wx.navigateTo({ url: '/pages/record-detail/index?id=' + e.currentTarget.dataset.id }); }, data: { id: '', records: [] as ReturnType<typeof recordService.list> }, onLoad(o: {
        id?: string;
    }) { this.setData({ id: o.id || '' }); }, onShow() { this.setData({ records: recordService.list('ALL', this.data.id) }); } });
