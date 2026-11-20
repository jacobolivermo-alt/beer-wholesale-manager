Component({ properties: { unit: { type: String, value: '箱' }, value: { type: Number, value: 0 } }, methods: {
        change(e: UIEvent): void {
            const delta = Number(e.currentTarget.dataset.delta);
            const value = Math.max(0, this.data.value + delta);
            if (Number.isSafeInteger(value))
                this.triggerEvent('change', { value });
        },
        input(e: UIEvent): void {
            const raw = e.detail.value;
            if (raw === '') {
                this.triggerEvent('change', { value: 0 });
                return;
            }
            const value = Number(raw);
            if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value)) {
                wx.showToast({ title: '请输入非负整数', icon: 'none' });
                this.setData({ value: this.data.value });
                return;
            }
            this.triggerEvent('change', { value });
        }
    } });
