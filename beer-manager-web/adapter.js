/* 微信 API 的平台适配层：业务 services 保持原逻辑。 */
const tempImages = new Map();

function imageDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('beer-manager-receipts', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('images');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function imageTransaction(mode, operation) {
  const db = await imageDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('images', mode),
        r = operation(tx.objectStore('images'));
      tx.oncomplete = () => resolve(r?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
const images = {
  get: path => imageTransaction('readonly', s => s.get(path)),
  put: (path, data) => imageTransaction('readwrite', s => s.put(data, path)),
  remove: path => imageTransaction('readwrite', s => s.delete(path))
};
window.wx = {
  getStorageSync(key) {
    const raw = localStorage.getItem(key);
    return raw === null ? '' : JSON.parse(raw);
  },
  setStorageSync(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  showToast({
    title
  }) {
    window.toast?.(title);
  },
  getFileSystemManager() {
    return {
      saveFile({
        tempFilePath,
        success,
        fail
      }) {
        const data = tempImages.get(tempFilePath),
          path = 'receipt-' + crypto.randomUUID();
        if (!data) {
          fail({
            errMsg: '图片不存在'
          });
          return;
        }
        images.put(path, data).then(() => success({
          savedFilePath: path
        }), e => fail({
          errMsg: String(e)
        }));
      },
      unlink({
        filePath,
        success,
        fail
      }) {
        images.remove(filePath).then(() => success?.(), e => fail?.({
          errMsg: String(e)
        }));
      }
    };
  },
  previewImage({
    current
  }) {
    images.get(current).then(data => {
      if (!data) throw Error('收据图片不存在');
      document.querySelector('#photo-image').src = data;
      document.querySelector('#photo').showModal();
    }).catch(e => toast(e.message));
  }
};
