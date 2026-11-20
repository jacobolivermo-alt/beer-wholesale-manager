Component({
  data: {
    selected: 0,
    list: [
      { text: '首页', icon: '/assets/icons/home.png', activeIcon: '/assets/icons/home-active.png', url: '/pages/home/index' },
      { text: '酒吧', icon: '/assets/icons/customer.png', activeIcon: '/assets/icons/customer-active.png', url: '/pages/customers/index' },
      { text: '记一笔', icon: '', activeIcon: '', url: '/pages/entry/index' },
      { text: '记录', icon: '/assets/icons/record.png', activeIcon: '/assets/icons/record-active.png', url: '/pages/records/index' },
      { text: '我的', icon: '/assets/icons/profile.png', activeIcon: '/assets/icons/profile-active.png', url: '/pages/profile/index' }
    ]
  },
  methods: { switchTab(e: UIEvent): void { wx.switchTab({ url: e.currentTarget.dataset.url }); } }
});
