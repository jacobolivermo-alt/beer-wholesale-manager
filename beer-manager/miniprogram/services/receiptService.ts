import { storageService } from './storageService';
import { id } from './helpers';
import { Receipt } from '../types/models';
function cleanup(paths: string[]): void { paths.forEach(path => wx.getFileSystemManager().unlink({ filePath: path })); }
export const receiptService = {
    list(recordId: string): Receipt[] {
        const r = storageService.read().records.find(r => r.id === recordId);
        if (!r)
            throw new Error('业务记录不存在');
        return r.receipts || [];
    },
    async attach(recordId: string, files: {
        tempFilePath: string;
        size: number;
    }[]): Promise<void> {
        const existing = this.list(recordId);
        if (!files.length)
            return;
        if (existing.length + files.length > 6)
            throw new Error('每笔业务最多保存 6 张收据');
        if (files.some(f => !f.tempFilePath || f.size <= 0 || f.size > 5 * 1024 * 1024))
            throw new Error('每张图片需小于等于 5MB');
        const saved: Receipt[] = [];
        try {
            for (const f of files) {
                const path = await new Promise<string>((resolve, reject) => wx.getFileSystemManager().saveFile({ tempFilePath: f.tempFilePath, success: result => resolve(result.savedFilePath), fail: () => reject(new Error('收据保存失败，请检查设备剩余空间')) }));
                saved.push({ id: id('receipt'), path, createdAt: new Date().toISOString() });
            }
            storageService.transaction(db => {
                const r = db.records.find(r => r.id === recordId);
                if (!r)
                    throw new Error('业务记录不存在');
                if ((r.receipts || []).length + saved.length > 6)
                    throw new Error('每笔业务最多保存 6 张收据');
                r.receipts = [...(r.receipts || []), ...saved];
            });
        }
        catch (e) {
            cleanup(saved.map(r => r.path));
            throw e;
        }
    },
    remove(recordId: string, receiptId: string): void {
        const receipt = this.list(recordId).find(r => r.id === receiptId);
        if (!receipt)
            throw new Error('收据不存在');
        storageService.transaction(db => { const r = db.records.find(r => r.id === recordId)!; r.receipts = (r.receipts || []).filter(r => r.id !== receiptId); });
        cleanup([receipt.path]);
    }
};
