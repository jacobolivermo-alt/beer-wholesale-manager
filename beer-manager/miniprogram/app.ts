import { storageService } from './services/storageService';
App({ onLaunch() {
        try {
            storageService.read();
        }
        catch (e) {
            wx.showToast({ title: e instanceof Error ? e.message : '初始化失败', icon: 'none' });
        }
    } });
