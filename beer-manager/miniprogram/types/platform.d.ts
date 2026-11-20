// 仅声明本项目使用的微信 API。运行时由微信开发者工具提供。
interface UIEvent<T = {
    value: string;
}> {
    detail: T;
    currentTarget: {
        dataset: Record<string, string>;
    };
}
interface PageInstance<D> {
    data: D;
    setData(data: Partial<D>): void;
    getTabBar(): {
        setData(data: {
            selected: number;
        }): void;
    } | undefined;
}
declare function Page<D, M>(options: {
    data: D;
} & M & ThisType<M & PageInstance<D>>): void;
declare function Component<D, P, M>(options: {
    data?: D;
    properties?: P;
    methods?: M & ThisType<M & {
        data: D & {
            [K in keyof P]: P[K] extends {
                value: infer V;
            } ? V : never;
        };
        setData(data: object): void;
        triggerEvent(name: string, detail?: unknown): void;
    }>;
    options?: object;
}): void;
declare function App(options: {
    onLaunch(): void;
}): void;
declare const wx: {
    chooseMedia(options: {
        count: number;
        mediaType: string[];
        sourceType: string[];
        sizeType: string[];
        success(result: {
            tempFiles: {
                tempFilePath: string;
                size: number;
            }[];
        }): void;
        fail(error: {
            errMsg: string;
        }): void;
    }): void;
    getFileSystemManager(): {
        saveFile(options: {
            tempFilePath: string;
            success(result: {
                savedFilePath: string;
            }): void;
            fail(error: {
                errMsg: string;
            }): void;
        }): void;
        unlink(options: {
            filePath: string;
            success?(): void;
            fail?(): void;
        }): void;
    };
    previewImage(options: {
        urls: string[];
        current?: string;
        fail?(): void;
    }): void;
    getStorageSync(key: string): unknown;
    setStorageSync(key: string, value: unknown): void;
    showToast(options: {
        title: string;
        icon?: 'success' | 'none';
        duration?: number;
    }): void;
    showModal(options: {
        title: string;
        content: string;
        confirmText?: string;
        confirmColor?: string;
        success(result: {
            confirm: boolean;
            cancel: boolean;
        }): void;
        fail?(): void;
    }): void;
    navigateTo(options: {
        url: string;
    }): void;
    redirectTo(options: {
        url: string;
    }): void;
    switchTab(options: {
        url: string;
    }): void;
    navigateBack(options?: {
        delta?: number;
    }): void;
    makePhoneCall(options: {
        phoneNumber: string;
    }): void;
};
declare function getCurrentPages(): {
    route: string;
    options: Record<string, string>;
}[];
