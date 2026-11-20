import { dialogData, openConfirmation, resolveConfirmation } from '../../utils/ui';
import { recordService } from '../../services/recordService';
import { receiptService } from '../../services/receiptService';
import { errorText } from '../../utils/ui';
import { Receipt } from '../../types/models';
Page({ acceptDialog() { resolveConfirmation(this, true); }, cancelDialog() { resolveConfirmation(this, false); }, data: { ...dialogData, id: '', record: null as ReturnType<typeof recordService.list>[number] | null, receipts: [] as Receipt[], busy: false, error: '' },
    onLoad(o: {
        id?: string;
    }) { this.setData({ id: o.id || '' }); },
    onShow() { this.refresh(); },
    refresh() {
        try {
            const record = recordService.list().find(r => r.id === this.data.id);
            if (!record)
                throw new Error('业务记录不存在');
            this.setData({ record, receipts: receiptService.list(this.data.id) });
        }
        catch (e) {
            this.setData({ error: errorText(e) });
        }
    },
    upload() {
        if (this.data.busy)
            return;
        const count = 6 - this.data.receipts.length;
        if (count <= 0) {
            this.setData({ error: '每笔业务最多保存 6 张收据' });
            return;
        }
        this.setData({ busy: true, error: '' });
        wx.chooseMedia({ count, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'], success: async (result) => {
                try {
                    await receiptService.attach(this.data.id, result.tempFiles);
                    this.refresh();
                    wx.showToast({ title: '收据已保存' });
                }
                catch (e) {
                    this.setData({ error: errorText(e) });
                }
                finally {
                    this.setData({ busy: false });
                }
            }, fail: error => { this.setData({ busy: false, error: error.errMsg.includes('cancel') ? '' : '无法选择图片，请检查相册或相机权限' }); } });
    },
    preview(e: UIEvent) { wx.previewImage({ urls: this.data.receipts.map(r => r.path), current: e.currentTarget.dataset.path, fail: () => this.setData({ error: '图片无法打开，请重新添加收据' }) }); },
    remove(e: UIEvent) {
        if (this.data.busy)
            return;
        openConfirmation(this, '移除这张收据？', '仅移除图片，业务流水保留。', () => { receiptService.remove(this.data.id, e.currentTarget.dataset.id); this.refresh(); });
    }
});
