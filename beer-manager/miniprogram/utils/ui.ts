export function errorText(e: unknown): string { return e instanceof Error ? e.message : '操作失败，请重试'; }
export function confirm(title: string, content: string, action: () => void, onError?: (message: string) => void, onFinish?: () => void): void {
    wx.showModal({ title, content, confirmText: '确认', confirmColor: '#b8232c', success(result) {
            try {
                if (result.confirm)
                    action();
            }
            catch (e) {
                const message = errorText(e);
                if (onError)
                    onError(message);
                wx.showToast({ title: message, icon: 'none' });
            }
            finally {
                if (onFinish)
                    onFinish();
            }
        }, fail() {
            if (onFinish)
                onFinish();
        } });
}
export function tab(instance: {
    getTabBar(): {
        setData(data: {
            selected: number;
        }): void;
    } | undefined;
}, selected: number): void {
    const bar = instance.getTabBar();
    if (bar)
        bar.setData({ selected });
}
export function openOperation(type: string, customerId = ''): void { wx.navigateTo({ url: `/pages/operation/index?type=${type}&customerId=${customerId}` }); }
export const dialogData = { dialogVisible: false, dialogTitle: '', dialogRows: [] as string[] };
interface DialogHost {
    setData(data: Partial<typeof dialogData>): void;
}
const pending = new WeakMap<DialogHost, {
    action: () => void;
    onError?: (message: string) => void;
    onFinish?: () => void;
}>();
export function openConfirmation(host: DialogHost, title: string, content: string, action: () => void, onError?: (message: string) => void, onFinish?: () => void): void {
    if (pending.has(host))
        return;
    pending.set(host, { action, onError, onFinish });
    host.setData({ dialogVisible: true, dialogTitle: title, dialogRows: content.split('\n').filter(row => row.trim()) });
}
export function resolveConfirmation(host: DialogHost, accepted: boolean): void {
    const request = pending.get(host);
    if (!request)
        return;
    pending.delete(host);
    host.setData({ dialogVisible: false });
    try {
        if (accepted)
            request.action();
    }
    catch (e) {
        const message = errorText(e);
        request.onError?.(message);
        wx.showToast({ title: message, icon: 'none' });
    }
    finally {
        request.onFinish?.();
    }
}
