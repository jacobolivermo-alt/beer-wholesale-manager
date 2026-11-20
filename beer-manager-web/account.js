/* 账套切换只通过此模块写入；旧账及收据保留一份完整撤销副本。 */
(() => {
  const KEY = 'beer-manager:v1', MODE = 'beer-manager:account-mode';
  const SNAPSHOT = 'local-before-account-reset';
  const app = window.beerApp;
  async function preserve() {
    const backup = await app.makeBackup();
    await app.images.put(SNAPSHOT, JSON.stringify({ ...backup, accountMode: localStorage.getItem(MODE) || 'LIVE' }));
    return backup;
  }
  async function blank(saveBefore = true) {
    const backup = saveBefore ? await preserve() : await app.makeBackup();
    const db = structuredClone(backup.database);
    db.products.forEach(product => { product.stock = 0; });
    for (const key of ['customers', 'customerStocks', 'deliveries', 'payments', 'bottleReturns', 'stockMovements', 'records']) db[key] = [];
    wx.setStorageSync(KEY, db);
    localStorage.setItem(MODE, 'LIVE');
  }
  async function demo() {
    await preserve();
    window.beerRequire('services/storageService').storageService.reset();
    localStorage.setItem(MODE, 'DEMO');
  }
  async function undo() {
    const raw = await app.images.get(SNAPSHOT);
    if (!raw) throw Error('本机还没有可撤销的重置');
    const backup = JSON.parse(raw);
    app.validateBackup(backup);
    app.confirm('撤销最近一次重置', ['恢复重置前的账目和收据。', '当前账套将被替换，请先导出当前账目的备份。'], async () => {
      await app.restoreBackup(backup);
      localStorage.setItem(MODE, backup.accountMode || 'LIVE');
      await app.images.remove(SNAPSHOT);
      app.toast('已恢复重置前的账套');
      app.go('home');
    });
  }
  window.beerAccounts = { blank, demo, undo };
  app.render();
  if (!window.beerFirstVisit) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'welcome-dialog';
  dialog.innerHTML = '<header><h2>欢迎使用啤酒批发管家</h2></header><div class="welcome-body"><p>正式记账从空白账套开始，示例酒吧和欠款不会带入。</p><button class="primary" data-start="live">开始空白账套</button><button data-start="import">从文件备份恢复</button><button data-start="demo">先用示例试一试</button><p class="muted">账目和收据保存在这台设备。请定期在“我的”导出备份。</p></div>';
  document.body.append(dialog);
  dialog.addEventListener('cancel', event => event.preventDefault());
  dialog.addEventListener('click', async event => {
    const action = event.target.closest('[data-start]')?.dataset.start;
    if (!action) return;
    const buttons = [...dialog.querySelectorAll('button')];
    buttons.forEach(button => { button.disabled = true; });
    try {
      if (action !== 'demo') await blank(false);
      else localStorage.setItem(MODE, 'DEMO');
      dialog.close(); dialog.remove(); app.go(action === 'import' ? 'profile' : 'home');
      if (action === 'import') document.querySelector('#backup-file').click();
    } catch (error) { buttons.forEach(button => { button.disabled = false; }); app.toast(error.message); }
  });
  dialog.showModal();
})();
