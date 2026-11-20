'use strict';
const {
  storageService,
  STORAGE_KEY
} = beerRequire('services/storageService');
const {
  productService
} = beerRequire('services/productService');
const {
  customerService
} = beerRequire('services/customerService');
const {
  deliveryService
} = beerRequire('services/deliveryService');
const {
  paymentService,
  PAYMENT_METHODS
} = beerRequire('services/paymentService');
const {
  bottleService
} = beerRequire('services/bottleService');
const {
  inventoryService
} = beerRequire('services/inventoryService');
const {
  recordService
} = beerRequire('services/recordService');
const {
  analysisService,
  chartModel
} = beerRequire('services/analysisService');
const {
  receiptService
} = beerRequire('services/receiptService');
const {
  moneyText
} = beerRequire('utils/format');
const {
  money: validateMoney,
  quantity: validateQuantity,
  cents
} = beerRequire('services/helpers');
const $ = s => document.querySelector(s),
  esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  } [c]));
let route = {
    page: 'home'
  },
  search = '',
  filter = 'ALL',
  period = 'WEEK',
  offset = 0,
  chartKind = 'MONEY',
  productView = 'ACTIVE',
  pending = null,
  saving = false,
  toastTimer;
const operationKinds = ['DELIVERY', 'PURCHASE', 'BOTTLE_RETURN', 'PAYMENT', 'STOCKTAKE'];
const operationDrafts = new Map();
const completedFlows = new Map();

function routeHash(value) {
  const kindPage = ['operation', 'manage', 'editor'].includes(value.page);
  const parts = [value.page, ...(kindPage && value.kind ? [value.kind] : []), ...(value.id ? [value.id] : [])];
  return '#' + parts.map(encodeURIComponent).join('/') + (value.page === 'operation' ? '?stage=' + (value.stage || 'fill') : '');
}

function readRoute() {
  try {
    const [path, query = ''] = location.hash.slice(1).split('?');
    const parts = path.split('/').map(decodeURIComponent), page = parts[0] || 'home';
    const kindPage = ['operation', 'manage', 'editor'].includes(page);
    if (!['home','customers','customer','entry','operation','records','record','result','profile','analysis','manage','editor'].includes(page)) return { page: 'home' };
    const value = { page, id: parts[kindPage ? 2 : 1] || '', kind: kindPage ? parts[1] || '' : '' };
    if (page === 'operation') {
      if (!operationKinds.includes(value.kind)) return { page: 'entry' };
      const stage = new URLSearchParams(query).get('stage');
      value.stage = ['fill','payment','review'].includes(stage) && (stage !== 'payment' || value.kind === 'DELIVERY') ? stage : 'fill';
    }
    if (['manage','editor'].includes(page) && !['PRODUCT','CUSTOMER'].includes(value.kind)) return { page: 'profile' };
    return value;
  } catch (_) { return { page: 'home' }; }
}

function draftKey(value = route) { return value.kind + ':' + (value.id || ''); }

function rememberOperation() {
  const operationForm = $('#operation-form');
  if (route.page !== 'operation' || !operationForm) return;
  const values = {};
  for (const field of operationForm.elements) {
    if (!field.name || field.disabled || (['radio','checkbox'].includes(field.type) && !field.checked)) continue;
    values[field.name] = field.value;
  }
  route.draft = values;
  route.openDetails = [...operationForm.querySelectorAll('details[open]')].map(element => element.id).filter(Boolean);
  operationDrafts.set(draftKey(), { draft: values, openDetails: route.openDetails, flowId: route.flowId, stage: route.stage === 'review' ? (route.kind === 'DELIVERY' ? 'payment' : 'fill') : route.stage || 'fill' });
  history.replaceState(route, '', routeHash(route));
}

function toast(text) {
  clearTimeout(toastTimer);
  $('#toast').textContent = text;
  $('#toast').style.display = 'block';
  toastTimer = setTimeout(() => $('#toast').style.display = 'none', 3000);
}
window.toast = toast;

function go(page, id = '', kind = '') {
  rememberOperation();
  const returnTo = page === 'record' && ['customer','result'].includes(route.page) ? { ...route } : null;
  pending = null;
  $('#review').close();
  $('#picker').close();
  route = {
    page,
    id,
    kind
  };
  if (returnTo) route.returnTo = returnTo;
  if (page === 'operation') Object.assign(route, operationDrafts.get(draftKey(route)) || { stage: 'fill', flowId: 'flow-' + Date.now() + '-' + Math.random().toString(36).slice(2) });
  history.pushState(route, '', routeHash(route));
  render();
  window.scrollTo(0, 0);
}
function resumeRoute() {
  pending = null;
  $('#review').close();
  $('#picker').close();
  const parsed = readRoute();
  route = history.state && routeHash(history.state) === routeHash(parsed) ? { ...parsed, ...history.state } : parsed;
  if (route.page === 'operation') {
    if (!route.flowId) route.flowId = 'flow-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const draft = operationDrafts.get(draftKey());
    if (draft?.flowId === route.flowId) {
      route.draft = draft.draft;
      route.openDetails = draft.openDetails;
    }
  }
  if (route.page === 'result' && route.flowId) completedFlows.set(route.flowId, { ...route });
  if (route.page === 'operation' && completedFlows.has(route.flowId)) {
    route = completedFlows.get(route.flowId);
    history.replaceState(route, '', routeHash(route));
  }
  render();
}
window.addEventListener('popstate', resumeRoute);
window.addEventListener('hashchange', () => { if (routeHash(route) !== routeHash(readRoute())) resumeRoute(); });

function setOperationStage(stage) {
  rememberOperation();
  route = { ...route, stage };
  history.pushState(route, '', routeHash(route));
  render();
  window.scrollTo(0, 0);
}
const iconPaths = {
  home: '<path d="m3 10 9-7 9 7v10H4V10"/><path d="M9 20v-7h6v7"/>',
  customers: '<path d="M5 20V5h14v15M3 20h18M8 8h2m4 0h2M8 12h2m4 0h2M10 20v-4h4v4"/>',
  entry: '<path d="M12 5v14M5 12h14"/>',
  records: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  DELIVERY: '<path d="M3 6h11v11H3zM14 10h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  PURCHASE: '<path d="M3 9 12 4l9 5v11H3V9M9 20v-6h6v6M12 6v6M9 9l3 3 3-3"/>',
  BOTTLE_RETURN: '<path d="M9 3h6v4l2 4v9H7v-9l2-4V3M9 7h6M7 14h10"/>',
  PAYMENT: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M15 14h3"/>',
  STOCKTAKE: '<path d="M9 4H5v17h14V4h-4M9 3h6v4H9zM8 12l2 2 5-5M8 18h8"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  crate: '<path d="M4 13h16v8H4zM7 13V7l1-2V2h2v3l1 2v6M13 13V7l1-2V2h2v3l1 2v6M8 17h8"/>'
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="icon" aria-hidden="true">${iconPaths[name]||iconPaths.records}</svg>`;
}

function pageHead(title, subtitle = '', action = '') {
  return `<section class="page-head"><div><h1>${esc(title)}</h1>${subtitle?`<p class="muted">${esc(subtitle)}</p>`:''}</div>${action}</section>`;
}

function workflowSteps(active = 1, kind = '') {
  const steps = kind === 'DELIVERY' ? ['酒吧与数量','货款','核对','完成'] : ['填写','核对','完成'];
  return `<ol class="workflow-steps ${steps.length===4?'four-steps':''}" aria-label="${esc(typeTitle(kind)||'资料')}保存步骤">${steps.map((name,i)=>`<li class="${i+1===active?'current':i+1<active?'done':''}" ${i+1===active?'aria-current="step"':''}><span>${i+1<active?'✓':i+1}</span><b>${name}</b></li>`).join('')}</ol>`;
}

function operationResult() {
  const record = recordService.list().find(value => value.id === route.id);
  if (!record) return `${pageHead('找不到这笔记录')}${emptyState('记录已不存在','可能已恢复其他备份或重置数据。')}<button class="primary" data-go="records">查看业务记录</button>`;
  const summary = route.result && route.result.recordId === record.id && route.result.kind === record.type ? route.result : null;
  const customerExists = !!record.customerId && customerService.list().some(value => value.id === record.customerId);
  return `<section id="operation-result" data-kind="${esc(record.type)}">${pageHead(typeTitle(record.type)+'已保存',record.customerName+' · '+record.timeText)}${workflowSteps(record.type==='DELIVERY'?4:3,record.type)}<div class="result-success"><span class="result-check" aria-hidden="true">✓</span><div><strong>这笔${esc(typeTitle(record.type))}已完成</strong><p>已写入本机，重新打开仍可在记录中查看。</p></div></div><section class="card"><h2>本笔内容</h2><p>${esc(record.description)}</p><div class="result-figures">${record.quantity!==0?`<strong>${esc(record.quantityText)} <small>${esc(record.unitText)}</small></strong>`:''}${record.amount?`<strong>¥${moneyText(record.amount)}</strong>`:''}</div></section>${summary?.changes?.length?`<section class="card"><h2>本笔保存前后</h2><dl class="result-changes">${summary.changes.map(([label,before,after])=>`<div><dt>${esc(label)}</dt><dd><span>${esc(before)}</span><span class="change-arrow">→</span><b>${esc(after)}</b></dd></div>`).join('')}</dl>${summary.estimated?'<p class="field-help">酒吧库存按本次回瓶估算；实际剩余酒以盘点为准。</p>':''}</section>`:'<p class="field-help">本笔已保存。保存前后的对照仅在原操作窗口保留，历史内容可查看下方记录。</p>'}<div class="result-actions"><button class="primary" data-record="${esc(record.id)}">查看这笔记录 / 添加收据</button><button ${customerExists?`data-customer="${esc(record.customerId)}" data-result-customer="${esc(record.customerId)}"`:'data-go="home"'}>${customerExists?'返回酒吧详情':'返回首页'}</button></div>${customerExists?`<section class="card other-business"><h2>还发生了其他业务？</h2><p class="muted">按实际情况选择，分别记账。</p><div class="other-business-grid">${['DELIVERY','BOTTLE_RETURN','PAYMENT','STOCKTAKE'].map(kind=>`<button data-op="${kind}" data-id="${esc(record.customerId)}">${icon(kind)}${typeTitle(kind)}</button>`).join('')}</div></section>`:''}</section>`;
}

function stockText(stock) {
  return `${stock?.quantity||0} 箱${stock?.looseBottleQuantity?' + '+stock.looseBottleQuantity+' 瓶':''}`;
}

function pickerControl(field, label, selected, options) {
  return `<label class="label">${esc(label)}</label><select name="${field==='operation-customer'?'customer':'product'}" id="${field}" hidden>${options}</select><button type="button" class="picker-trigger" data-picker="${field}" aria-haspopup="dialog"><strong id="${field}-display">${esc(selected||label)}</strong>${icon('chevron')}</button>`;
}
let pickerField = '';
function renderPicker(query='') {
  const customerPicker=pickerField==='operation-customer';
  const field=$('#'+pickerField);
  const rows=customerPicker?customerService.list(query).map(c=>({value:c.id,name:c.name,detail:c.receivable?'应收 ¥'+moneyText(c.receivable):'已结清'})):bottleService.list($('#operation-customer').value).map(p=>({value:p.productId,name:p.name,detail:'待回 '+p.quantity+' 瓶'}));
  $('#picker-list').innerHTML=rows.map(p=>`<button type="button" class="picker-row ${field.value===p.value?'chosen':''}" data-pick-value="${esc(p.value)}"><span><strong>${esc(p.name)}</strong><small>${esc(p.detail)}</small></span><span>${field.value===p.value?'✓':'›'}</span></button>`).join('')||emptyState(customerPicker?'没有找到这家酒吧':'没有待回空瓶',customerPicker?'换个名称试试':'这家酒吧目前没有待回的空瓶。');
}
$('#picker-search').addEventListener('input',e=>renderPicker(e.target.value));
$('[data-picker-close]').onclick=()=>$('#picker').close();

function emptyState(title, description = '') {
  return `<div class="empty"><strong>${esc(title)}</strong>${description?`<p>${esc(description)}</p>`:''}</div>`;
}

function metricValue(value) {
  const match = String(value).match(/^(¥?)([\d,\.\-]+)\s*(箱|瓶)?$/);
  if (!match) return esc(value);
  return `${match[1]?'<span class="metric-currency">¥</span>':''}<span class="metric-number ${match[2].length>8?'long':''}">${esc(match[2])}</span>${match[3]?`<span class="metric-unit">${match[3]}</span>`:''}`;
}

function renderTabs() {
  const active = ({
    customer: 'customers',
    operation: 'entry',
    analysis: 'profile',
    manage: 'profile',
    editor: 'profile',
    record: 'records'
  })[route.page] || route.page;
  return [
    ['home', '首页'],
    ['customers', '酒吧'],
    ['entry', '记一笔'],
    ['records', '记录'],
    ['profile', '我的']
  ].map(([p, t]) =>
    `<button data-go="${p}" aria-label="${t}" ${active===p?'aria-current="page"':''} class="${p==='entry'?'entry ':''}${active===p?'selected':''}"><span class="nav-icon">${icon(p)}</span><span>${t}</span></button>`
    ).join('');
}

function heading(title) {
  const main = ['home', 'customers', 'entry', 'records', 'profile'].includes(route.page);
  const recordBack = route.returnTo?.page === 'result' ? '<button class="back-button" data-record-return>‹ 保存结果</button>' : route.returnTo?.page === 'customer' ? `<button class="back-button" data-customer="${esc(route.returnTo.id)}">‹ 酒吧详情</button>` : '<button class="back-button" data-go="records">‹ 业务记录</button>';
  $('#header').innerHTML = main ?
    `<div class="brand"><span class="brand-mark">${icon('crate')}</span><strong>啤酒批发管家</strong></div><span class="local-status" id="cloud-status">本机保存</span>` :
    `${route.page==='customer'?'<button class="back-button" data-go="customers">‹ 酒吧列表</button>':route.page==='record'?recordBack:route.page==='result'?'<button class="back-button" data-go="entry">‹ 记一笔</button>':route.page==='operation'?(route.kind==='DELIVERY'&&route.stage==='payment'?'<button class="back-button" data-fill-back>‹ 修改酒吧与数量</button>':`<button class="back-button" data-operation-exit>‹ ${route.id?'酒吧详情':'记一笔'}（保留填写）</button>`):'<button class="back-button" data-back aria-label="返回">‹ 返回</button>'}<strong>${esc(title)}</strong>`;
}

function render() {
  try {
    const views = {
      home,
      customers,
      customer,
      entry,
      operation,
      records,
      profile,
      analysis,
      manage,
      editor,
      record,
      result: operationResult
    };
    heading(route.page === 'operation' ? typeTitle(route.kind) : ({
      home: '啤酒批发管家',
      customers: '酒吧',
      customer: '酒吧详情',
      entry: '记一笔',
      operation: '记业务',
      records: '业务记录',
      profile: '我的',
      analysis: '经营分析',
      manage: '资料管理',
      editor: '编辑资料',
      record: '流水详情',
      result: '保存完成'
    })[route.page] || '啤酒管家');
    $('#app').dataset.page = route.page;
    document.body.dataset.page = route.page;
    $('#app').innerHTML = (views[route.page] || home)();
    $('#tabs').innerHTML = renderTabs();
    if (route.page === 'operation') bindOperation();
    if (route.page === 'record') loadReceipts();
    window.cloudBackup?.refresh();
  } catch (e) {
    $('#app').innerHTML =
      `<div class="card red"><h2>数据暂时无法读取</h2><p>${esc(e.message)}</p><p>已保留原数据，请勿清理浏览器缓存。可从备份恢复。</p><button data-import>恢复备份</button></div>`;
  }
}
const card = (title, value, tone = '') =>
  `<div class="card stat-card"><small>${esc(title)}</small><div class="metric ${tone}">${metricValue(value)}</div></div>`;

function home() {
  const d = recordService.dashboard(),
    products = productService.list(),
    customers = customerService.list(),
    attention = customers.filter(c => c.receivable > 0 || c.emptyBottleCount >= 720 || c.stockTotal < 10),
    today = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }).format(new Date());
  return `<section class="home-hero"><div><p class="eyebrow">${esc(today)}</p><h1>今天的经营</h1><p class="muted">酒、空瓶、货款，随时有数。</p></div><span class="version-label">V1.5.3</span></section><div class="grid stats-grid">${card('今日送货',d.todayDelivery+' 箱')}${card('今日收款','¥'+moneyText(d.todayPayment),'green')}${card('当前应收','¥'+moneyText(d.receivable),'red')}${card('待回空瓶',d.emptyBottles+' 瓶')}</div>${!products.length||!customers.length?`<section class="card section setup-guide"><h2>开始记账前，补好基础资料</h2><p class="muted">先添加商品和期初仓库库存，再添加酒吧。需要核对酒吧已有余酒时，用酒吧盘点填写实际库存。</p><div class="controls"><button data-go="manage" data-kind="PRODUCT">商品与期初库存</button><button data-go="manage" data-kind="CUSTOMER">添加酒吧</button></div></section>`:''}<button class="primary home-delivery section" data-op="DELIVERY">${icon('DELIVERY')}<span>记一笔送货</span><span class="button-trailing">›</span></button><div class="home-sections"><section class="card warehouse-card"><div class="section-heading"><div><h2>仓库库存</h2><small>${products.length} 种商品 · 以箱统计</small></div><button class="text-button" data-op="PURCHASE">进货 ${icon('chevron')}</button></div>${products.map(p=>`<div class="row list-row"><div><strong>${esc(p.name)}</strong><p class="subline">${p.bottlesPerCase} 瓶/箱</p></div><div class="stock-number">${p.stock<p.lowStockThreshold?'<span class="badge orange">偏低</span>':''}<strong class="${p.stock<p.lowStockThreshold?'orange':''}">${p.stock}<small> 箱</small></strong></div></div>`).join('')||emptyState('还没有商品','到商品管理中添加第一种酒。')}</section><section class="card attention-card"><div class="section-heading"><div><h2>需要注意</h2><small>${attention.length?attention.length+' 家酒吧有待处理事项':'今天的待处理事项'}</small></div><button class="text-button" data-go="customers">全部 ${icon('chevron')}</button></div>${attention.map(c=>`<div class="attention-row clickable" role="button" tabindex="0" data-customer="${esc(c.id)}"><div><strong>${esc(c.name)}</strong><div class="attention-details">${c.receivable>0?`<span class="red">欠款 ¥${moneyText(c.receivable)}</span>`:''}${c.emptyBottleCount>=720?`<span class="orange">待回 ${c.emptyBottleCount} 瓶</span>`:''}${c.stockTotal<10?`<span class="orange">余 ${c.stockTotal} 箱${c.looseTotal?'＋'+c.looseTotal+' 瓶':''}</span>`:''}</div></div>${icon('chevron')}</div>`).join('')||emptyState('暂时没有提醒','欠款、待回瓶和低库存会显示在这里。')}</section></div>`;
}

function customerCards(query = '') {
  return customerService.list(query).map(c =>
    `<article class="card customer-card clickable" role="button" tabindex="0" data-customer="${esc(c.id)}"><div class="row"><h3>${esc(c.name)}</h3>${icon('chevron')}</div><div class="customer-metrics"><div><small>当前库存</small><p><b>${c.stockTotal}</b> 箱${c.looseTotal?`<span class="loose">＋${c.looseTotal} 瓶</span>`:''}</p></div><div><small>待回空瓶</small><p><b>${c.emptyBottleCount}</b> 瓶</p></div></div><div class="row receivable-row"><small>当前应收</small><strong class="${c.receivable>0?'red':'green'}">${c.receivable>0?'¥'+moneyText(c.receivable):'已结清'}</strong></div></article>`
    ).join('') || emptyState(query ? '没有找到这家酒吧' : '还没有酒吧', query ? '试试其他名称。' : '点击右上角新增，开始记录业务。');
}

function customers() {
  return `${pageHead('酒吧',customerService.list().length+' 家客户 · 最近操作排在前面','<button class="compact-primary" data-edit="CUSTOMER">＋ 新增</button>')}<div class="search-field">${icon('customers')}<input type="search" id="search" aria-label="搜索酒吧名称" placeholder="搜索酒吧名称" value="${esc(search)}"></div><div id="customer-list" class="section">${customerCards(search)}</div>`;
}

function customer() {
  const c = customerService.get(route.id),
    stocks = customerService.stocks(c.id),
    kinds = bottleService.list(c.id);
  return `${pageHead(c.name,'',`<button class="text-button" data-edit="CUSTOMER" data-id="${esc(c.id)}">编辑资料</button>`)}<p class="muted">${esc(c.contactName||'联系人待补充')}${c.phone?' · '+esc(c.phone):''}<br>${esc(c.address||'地址待补充')}</p>${c.remark?`<p>${esc(c.remark)}</p>`:''}<div class="grid">${card('待回空瓶',c.emptyBottleCount+' 瓶')}${card('当前应收','¥'+moneyText(c.receivable),c.receivable?'red':'green')}</div><h2 class="section">当前库存</h2><p class="muted">送货增加库存；回瓶可选择只登记或估算余酒；盘点按实际数量校准。</p><div class="card">${stocks.map(s=>`<div class="list-row"><div class="row wrap"><strong>${esc(s.name)}</strong><strong>${s.quantity} 箱${s.looseBottleQuantity?'＋'+s.looseBottleQuantity+' 瓶':''}</strong></div><p class="muted">${s.inventoryCaseSize} 瓶/箱 · 共 ${s.totalBottles} 瓶</p></div>`).join('')}</div><h2 class="section">待回空瓶明细</h2><div class="card">${kinds.map(k=>`<div class="row list-row wrap"><span>${esc(k.name)}</span><b>${k.quantity} 瓶</b></div>`).join('')||'<p class="green">空瓶已回齐</p>'}${(c.emptyBottlesByProduct?.UNCLASSIFIED||0)>0?`<details class="history-details"><summary>核对历史种类 <span>${c.emptyBottlesByProduct.UNCLASSIFIED} 瓶未分类</span></summary><p class="muted">只分类旧余额，不改变总待回或库存。</p><select id="class-product">${productOptions()}</select><label class="label" for="class-count">归入此类的瓶数</label><input id="class-count" inputmode="numeric" type="number" min="1" placeholder="分类瓶数"><button class="primary section" data-classify="${esc(c.id)}">核对并分类</button></details>`:''}</div><div class="customer-actions">${['DELIVERY','BOTTLE_RETURN','PAYMENT','STOCKTAKE'].map(k=>`<button class="${k==='DELIVERY'?'primary':''}" data-op="${k}" data-id="${esc(c.id)}">${icon(k)}<span>${typeTitle(k)}</span></button>`).join('')}</div><h2 class="section">最近业务</h2><div class="card">${recordRows(recordService.list('ALL',c.id).slice(0,5))}</div>`;
}

function typeTitle(k) {
  return ({
    DELIVERY: '送货',
    PURCHASE: '进货',
    BOTTLE_RETURN: '回瓶',
    PAYMENT: '收款',
    STOCKTAKE: '盘点'
  })[k];
}

function entry() {
  const details = {
    DELIVERY: '送出酒，记录货款和待回瓶',
    PURCHASE: '补充仓库库存',
    BOTTLE_RETURN: '按种类收瓶，可选择估算余酒',
    PAYMENT: '收货款，核对剩余应收',
    STOCKTAKE: '核对仓库或酒吧的实际库存'
  };
  return `${pageHead('记一笔','发生哪笔业务，就选哪一项；分别核对、保存')}<div class="operation-menu">${['DELIVERY','PURCHASE','BOTTLE_RETURN','PAYMENT','STOCKTAKE'].map((k,i)=>`<button data-op="${k}" class="operation-choice ${i===0?'featured':''}"><span class="operation-icon">${icon(k)}</span><span class="operation-copy"><strong>${typeTitle(k)}</strong><small>${details[k]}</small></span>${icon('chevron')}</button>`).join('')}</div>`;
}

function productOptions(selected = '') {
  return productService.list().map(p =>
    `<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('');
}

function customerOptions(selected = '') {
  return `<option value="">请选择酒吧</option>` + customerService.list().map(c =>
    `<option value="${esc(c.id)}" ${c.id===selected?'selected':''}>${esc(c.name)}</option>`).join('');
}
const input = (name, label, value = '', type = 'text', placeholder = '') =>
  `<label class="label" for="${name}">${esc(label)}</label><input id="${name}" name="${name}" type="${type==='money'?'text':type}" ${type==='money'?'inputmode="decimal"':type==='number'?'inputmode="numeric" min="0" step="1"':''} value="${esc(value)}" placeholder="${esc(placeholder)}">`;
const step = (name, label, value = '0') =>
  `<label class="label" for="${name}">${esc(label)}</label><div class="stepper"><button type="button" data-step="${name}" data-delta="-1" aria-label="减一">−</button><input name="${name}" id="${name}" inputmode="numeric" type="number" min="0" step="1" value="${esc(value)}"><button type="button" data-step="${name}" data-delta="1" aria-label="加一">＋</button></div><div class="quick">${[1,5,10].map(n=>`<button type="button" data-step="${name}" data-delta="${n}">＋${n}</button>`).join('')}</div>`;

function operation() {
  const k = route.kind, c = route.id ? customerService.get(route.id) : null, products = productService.list();
  if (!products.length && ['DELIVERY','PURCHASE','STOCKTAKE'].includes(k)) return `${pageHead(typeTitle(k))}${emptyState('先添加商品','填写商品名称、售价和每箱瓶数，就能开始记账。')}<button class="primary" data-edit="PRODUCT">添加商品</button>`;
  const section = (n,title,body,extra='') => `<section class="card form-section ${extra}"><h2 class="form-section-title">${title}</h2>${body}</section>`;
  const chooseCustomer = `<div id="customer-field">${pickerControl('operation-customer','选择酒吧',c?.name,customerOptions(route.id))}</div>`;
  let body = '';
  if (k === 'DELIVERY') {
    const rows = products.map((p,i)=>`<div class="product-form compact-product ${i===0?'is-expanded':''}" data-product="${esc(p.id)}"><div class="delivery-product-row"><button class="product-copy" type="button" data-expand-product="${esc(p.id)}" aria-expanded="${i===0}"><strong>${esc(p.name)}</strong><span id="terms-${p.id}">¥${moneyText(c?.productPrices[p.id]??p.price)} / 箱 · ${p.bottlesPerCase} 瓶/箱</span><small>仓库 ${p.stock} 箱</small></button><div class="mini-stepper"><button type="button" data-step="q-${esc(p.id)}" data-delta="-1" aria-label="${esc(p.name)}减一箱">−</button><input id="q-${esc(p.id)}" name="q-${esc(p.id)}" type="number" min="0" step="1" inputmode="numeric" value="0" aria-label="${esc(p.name)}送货箱数"><button type="button" data-step="q-${esc(p.id)}" data-delta="1" aria-label="${esc(p.name)}加一箱">＋</button></div></div><div class="product-extra"><div class="quick">${[1,5,10].map(n=>`<button type="button" data-step="q-${esc(p.id)}" data-delta="${n}">＋${n} 箱</button>`).join('')}</div><details class="price-details"><summary>调整本次售价 / 每箱瓶数 ${icon('chevron')}</summary><div class="price-fields">${input('price-'+p.id,'本次售价（元/箱）',c?.productPrices[p.id]??p.price,'money')}${input('size-'+p.id,'本次包装（瓶/箱）',p.bottlesPerCase,'number')}</div></details></div><p class="product-validation red" id="warning-${p.id}" hidden></p></div>`).join('');
    body = section(1,'送给谁',chooseCustomer) + section(2,'送哪些酒 · 按箱',rows,'delivery-products') + section(3,'这笔货款怎么记',`<div class="choice payment-choice"><label><input type="radio" name="paid" value="CREDIT" checked><span><strong>赊账</strong><small>还没收钱，增加应收</small></span></label><label><input type="radio" name="paid" value="PAID"><span><strong>已付款</strong><small>已经收到本次货款</small></span></label></div><div class="calculated-line">按商品计算 <strong id="calculated-money">¥0</strong></div><details class="optional-fields" id="delivery-agreement"><summary>协商价格与计算金额不同？</summary>${input('final','最终收取货款（元）','','money','例如：计算3420，协商3400')}${input('reason','协商说明','','text','改金额时填写，如整单优惠')}<p class="field-help">保留原计算金额，按最终货款记录应收或已收。</p></details>`);
  }
  if (k === 'BOTTLE_RETURN') {
    const kinds=c?bottleService.list(c.id):[];
    body=section(1,'向谁收瓶',chooseCustomer)+section(2,'收哪一种 · 按瓶',`${pickerControl('return-kind','选择空瓶种类','', '<option value="">请选择空瓶种类</option>'+kinds.map(p=>`<option value="${esc(p.productId)}">${esc(p.name)} · 待回 ${p.quantity} 瓶</option>`).join(''))}<p id="balance" class="balance-strip">该种待回 0 瓶</p>${step('count','本次回收瓶数')}<div class="case-shortcut"><label for="case-size">每箱 <input id="case-size" name="case-size" type="number" min="1" inputmode="numeric" value="24"> 瓶</label><button type="button" data-case>＋1 箱（24 瓶）</button></div>`)+section(3,'回瓶如何影响余酒',`<div class="return-mode-options"><label><input type="radio" name="return-mode" value="ONLY" checked><span><strong>只登记回瓶</strong><small>减少待回空瓶，酒吧库存保持不变</small></span></label><label><input type="radio" name="return-mode" value="ESTIMATE" id="deduct"><span><strong>按回瓶估算余酒</strong><small>该商品的库存按回收瓶数扣减</small></span></label></div><p class="field-help">如果已经盘点过实际余酒，请选“只登记回瓶”，避免再次扣减。估算值以盘点为准。</p><p id="remaining" class="success-note"></p>`);
  }
  if (k === 'PAYMENT') body=section(1,'向谁收款',chooseCustomer+'<p id="balance" class="balance-strip red">当前应收 ¥'+moneyText(c?.receivable||0)+'</p>')+section(2,'实际收到多少钱',input('amount','本次实收（元）','','money','输入收到的金额')+`<label class="label">支付方式</label><div class="method-options">${PAYMENT_METHODS.map((p,i)=>`<label><input type="radio" name="method" value="${p.value}" ${i===0?'checked':''}><span>${esc(p.label)}</span></label>`).join('')}</div><details class="optional-fields" id="payment-forgiveness"><summary>这次还协商减免了欠款？</summary>${input('forgiven','协商减免（元）','0','money')}${input('reason','减免说明','','text','例如尾款减免')}<p class="field-help">欠款 ¥3,420，实收 ¥3,400，减免 ¥20 才会结清。</p></details>`);
  if (k === 'PURCHASE' || k === 'STOCKTAKE') body=section(1,k==='PURCHASE'?'给仓库进货':'盘点哪里',`${k==='STOCKTAKE'?'<label class="label">盘点位置</label><select name="scope" id="scope"><option value="WAREHOUSE">仓库</option><option value="CUSTOMER">酒吧</option></select>'+chooseCustomer:''}<label class="label">选择商品</label><select name="product" id="inventory-product">${productOptions()}</select><p id="balance" class="balance-strip"></p>`)+section(2,k==='PURCHASE'?'新增数量':'按实际数量填写',step('count',k==='PURCHASE'?'本次进货（箱）':'实际整箱')+`<div id="loose-field" hidden>${input('loose','另有散瓶（不足一箱）','0','number')}</div>${k==='STOCKTAKE'?'<p class="field-help">盘点只校准库存，不改变欠款或待回空瓶。</p>':''}`);
  return `${pageHead(typeTitle(k),({DELIVERY:'先选酒吧与数量，再处理货款',PAYMENT:'实收的钱与减免分开记',BOTTLE_RETURN:'按商品种类回收，可以输入散瓶',PURCHASE:'只增加仓库库存',STOCKTAKE:'以实际数量校准库存'})[k])}<div id="workflow-progress" data-stage="${route.stage||'fill'}">${workflowSteps(k==='DELIVERY'&&route.stage!=='fill'&&route.stage?2:1,k)}</div><div class="operation-context"><div><small id="stage-label"></small><strong id="context-subject">${esc(c?.name||'')}</strong></div><small id="context-brief"></small></div><form id="operation-form" class="${k==='DELIVERY'&&route.stage&&route.stage!=='fill'?'settlement-step':''}">${k==='DELIVERY'?'<div id="delivery-summary" class="card checkout-summary"></div>':''}${body}<footer class="sticky-action workflow-footer"><p class="form-error" id="form-error" role="alert" hidden></p><div class="row" id="quote"></div><p class="draft-hint" id="draft-hint">填写中 · 尚未保存</p><button type="submit" class="primary">${k==='DELIVERY'?(route.stage&&route.stage!=='fill'?'下一步：核对送货':'下一步：处理货款'):'下一步：核对'+typeTitle(k)}</button></footer></form>`;
}

function form() {
  return new FormData($('#operation-form'));
}

function operationLines() {
  return productService.list().map(p => ({
    productId: p.id,
    quantity: Number($('#q-' + p.id).value),
    unitPrice: Number($('#price-' + p.id).value),
    bottlesPerCase: Number($('#size-' + p.id).value)
  })).filter(p => p.quantity !== 0);
}

function bindOperation() {
  const f = $('#operation-form');
  if (!f) return;
  f.addEventListener('submit', e => {
    e.preventDefault();
    submitOperation();
  });
  if (route.kind === 'STOCKTAKE' && route.id) $('#scope').value = 'CUSTOMER';
  if (route.draft) {
    if (route.kind === 'BOTTLE_RETURN' && route.draft.customer) {
      $('#return-kind').innerHTML = '<option value="">请选择空瓶种类</option>' + bottleService.list(route.draft.customer).map(value => `<option value="${esc(value.productId)}">${esc(value.name)} · 待回 ${value.quantity} 瓶</option>`).join('');
    }
    for (const field of f.elements) {
      if (!field.name) continue;
      if (['radio','checkbox'].includes(field.type)) field.checked = route.draft[field.name] === field.value;
      else if (Object.hasOwn(route.draft,field.name)) field.value = route.draft[field.name];
    }
    for (const id of route.openDetails || []) document.getElementById(id)?.setAttribute('open','');
  }
  const change = () => {
    const error = $('#form-error');
    error.hidden = true;
    error.textContent = '';
    const data = form(),
      cid = data.get('customer'),
      k = route.kind,
      c = cid ? customerService.get(cid) : null;
    if ($('#operation-customer-display')) $('#operation-customer-display').textContent=c?.name||'选择酒吧';
    if ($('#return-kind-display')) $('#return-kind-display').textContent=$('#return-kind').selectedOptions[0]?.textContent||'选择空瓶种类';
    if (k === 'PAYMENT') $('#balance').textContent = '当前应收 ¥' + moneyText(c?.receivable || 0);
    if (k === 'DELIVERY') {
      for (const p of productService.list()) {
        const q = Number($('#q-' + p.id).value),
          price = Number($('#price-' + p.id).value),
          size = Number($('#size-' + p.id).value);
        $('[data-product="' + p.id + '"]').classList.toggle('has-quantity', q > 0);
        $('#terms-' + p.id).textContent = '¥' + moneyText(Number.isFinite(price) ? price : 0) + '/箱 · ' + (Number
          .isFinite(size) ? size : 0) + '瓶/箱';
      }
      const inputs = operationLines();
      const quantity = inputs.reduce((a, b) => a + b.quantity, 0),
        amount = inputs.reduce((a, b) => a + b.quantity * b.unitPrice, 0);
      $('#quote').innerHTML =
        `<div><small>本次送货</small><b>${Number.isFinite(quantity)?quantity:0} <span class="metric-unit">箱</span></b></div><div class="quote-money"><small>合计货款</small><b class="red">¥${moneyText(Number(data.get('final')||amount)||0)}</b></div>`;
      $('#calculated-money').textContent = '¥' + moneyText(amount || 0);
      if ($('#operation-form').classList.contains('settlement-step')) $('#delivery-summary').innerHTML=`<div class="row"><strong>${esc(c?.name||'')}</strong><button type="button" class="text-button" data-fill-back>修改酒 / 数量</button></div><p>${inputs.map(i=>`${esc(getProduct(i.productId).name)} × ${i.quantity} 箱`).join('；')}</p>`;
      for (const p of productService.list()) {
        const n=Number($('#q-'+p.id).value), warning=$('#warning-'+p.id);
        warning.hidden=!(n>p.stock);
        warning.textContent=n>p.stock?`库存只有 ${p.stock} 箱，请减少数量`:'';
      }
      $('#context-brief').textContent = inputs.map(value => `${getProduct(value.productId).name} ${value.quantity} 箱`).join(' · ') || '尚未填写送货数量';
      $('#draft-hint').textContent = !cid ? '先选择酒吧 · 尚未保存' : quantity <= 0 ? '添加送货数量 · 尚未保存' : `${c.name} · ${route.stage==='fill'?'酒吧与数量':route.stage==='review'?'核对':'货款'} · 尚未保存`;
    }
    if (k === 'BOTTLE_RETURN') {
      const pid = data.get('product'),
        balance = c?.emptyBottlesByProduct?.[pid] || 0;
      $('#balance').innerHTML = `<strong>该商品待回 ${balance} 瓶</strong><small>客户所有种类合计待回 ${c?.emptyBottleCount||0} 瓶</small>`;
      const deduct = $('#deduct');
      deduct.disabled = pid === 'UNCLASSIFIED' || !pid;
      if (deduct.disabled) {
        deduct.checked = false;
        $('[name="return-mode"][value="ONLY"]').checked = true;
      }
      const s = c ? customerService.stocks(cid).find(s => s.id === pid) : null;
      const n = Number(data.get('count') || 0);
      $('#remaining').textContent = s && deduct.checked && Number.isSafeInteger(n) && n >= 0 && n <= s.totalBottles ?
        '回瓶后预计 ' + Math.floor((s.totalBottles - n) / s.inventoryCaseSize) + ' 箱＋' + ((s.totalBottles - n) % s
          .inventoryCaseSize) + ' 瓶' : deduct.checked ? '库存不足时会拦截，不能扣成负数。' : '只减少待回空瓶，不扣减库存。';
      $('[data-case]').textContent = `＋1 箱（${Number(data.get('case-size'))||24} 瓶）`;
      $('#quote').innerHTML = `<div><small>本次回收</small><b>${n} 瓶</b></div><div class="quote-money"><small>该种回瓶后待回</small><b>${Math.max(0,balance-n)} 瓶</b></div>`;
      $('#context-brief').textContent = `${$('#return-kind').selectedOptions[0]?.textContent?.split(' · ')[0]||'尚未选择种类'} · 本次 ${n} 瓶 · ${deduct.checked?'估算余酒':'只登记回瓶'}`;
    }
    if (k === 'PAYMENT') {
      const cash=Number(data.get('amount')||0), forgiven=Number(data.get('forgiven')||0);
      $('#quote').innerHTML=`<div><small>本次实收</small><b class="green">¥${moneyText(cash||0)}</b></div><div class="quote-money"><small>收款后剩余应收</small><b>¥${moneyText(Math.max(0,(c?.receivable||0)-cash-forgiven))}</b></div>`;
      $('#context-brief').textContent = `本次实收 ¥${moneyText(cash||0)}${forgiven?' · 减免 ¥'+moneyText(forgiven):''}`;
    }
    if (k === 'STOCKTAKE' || k === 'PURCHASE') {
      const isCustomer = k === 'STOCKTAKE' && data.get('scope') === 'CUSTOMER',
        p = getProduct(data.get('product')),
        s = isCustomer && cid ? customerService.stocks(cid).find(s => s.id === p.id) : null;
      $('#customer-field')?.toggleAttribute('hidden', !isCustomer);
      $('#loose-field').hidden = !isCustomer;
      $('#balance').textContent = isCustomer ? '系统库存 ' + (s?.quantity || 0) + ' 箱＋' + (s?.looseBottleQuantity || 0) +
        ' 瓶 · ' + (s?.inventoryCaseSize || p.bottlesPerCase) + ' 瓶/箱' : '仓库现存 ' + p.stock + ' 箱';
      $('#quote').innerHTML=`<div><small>${k==='PURCHASE'?'本次进货':'实际库存'}</small><b>${Number(data.get('count')||0)} 箱${isCustomer?' + '+Number(data.get('loose')||0)+' 瓶':''}</b></div>`;
      $('#context-brief').textContent = `${p.name} · ${Number(data.get('count')||0)} 箱${isCustomer?' + '+Number(data.get('loose')||0)+' 瓶':''}`;
    }
    const subject = k === 'PURCHASE' || (k === 'STOCKTAKE' && data.get('scope') !== 'CUSTOMER') ? '仓库' : c?.name || '尚未选择酒吧';
    $('#context-subject').textContent = subject;
    $('#stage-label').textContent = (k === 'DELIVERY' ? route.stage==='review'?'第 3 步 · 核对':route.stage==='payment'?'第 2 步 · 货款':'第 1 步 · 酒吧与数量' : route.stage==='review'?'第 2 步 · 核对':'第 1 步 · 填写') + ' · 尚未保存';
    if (k !== 'DELIVERY') $('#draft-hint').textContent = `${subject} · ${route.stage==='review'?'核对':'填写'} · 尚未保存`;
    rememberOperation();
  };
  f.addEventListener('input', change);
  f.addEventListener('change', e => {
    if (e.target.id === 'operation-customer') {
      if (route.kind === 'DELIVERY') {
        const c = e.target.value ? customerService.get(e.target.value) : null;
        for (const p of productService.list()) {
          $('#price-' + p.id).value = c?.productPrices[p.id] ?? p.price;
          $('#q-' + p.id).value = '0';
        }
        $('#final').value = '';
        $('#reason').value = '';
      }
      if (route.kind === 'BOTTLE_RETURN') {
        const kinds = e.target.value ? bottleService.list(e.target.value) : [];
        $('#return-kind').innerHTML = '<option value="">请选择</option>' + kinds.map(p =>
          `<option value="${esc(p.productId)}">${esc(p.name)} · 待回 ${p.quantity} 瓶</option>`).join('');
        $('#count').value = '0';
        $('[name="return-mode"][value="ONLY"]').checked = true;
        $('#deduct').checked = false;
      }
      if (route.kind === 'PAYMENT') {
        $('#amount').value = '';
        $('#forgiven').value = '0';
        $('#reason').value = '';
      }
    }
    if (e.target.id === 'return-kind') {
      $('#count').value = '0';
      $('#deduct').checked = false;
      $('[name="return-mode"][value="ONLY"]').checked = true;
      $('#case-size').value = productService.list().find(p => p.id === e.target.value)?.bottlesPerCase || 24;
    }
    if (route.kind === 'STOCKTAKE' && ['inventory-product', 'scope', 'operation-customer'].includes(e.target.id)) {
      const data = form(),
        cid = data.get('customer'),
        p = getProduct(data.get('product')),
        s = data.get('scope') === 'CUSTOMER' && cid ? customerService.stocks(cid).find(s => s.id === p.id) : null;
      $('#count').value = data.get('scope') === 'CUSTOMER' ? (s?.quantity || 0) : p.stock;
      $('#loose').value = s?.looseBottleQuantity || 0;
    }
    change();
  });
  if (route.kind === 'STOCKTAKE' && !route.draft) $('#inventory-product').dispatchEvent(new Event('change', {
    bubbles: true
  }));
  change();
  if (route.stage === 'review') submitOperation();
}

function confirm(title, rows, action) {
  if (pending) return;
  pending = action;
  $('#review-title').textContent = title;
  $('#review').querySelector('.review-steps')?.remove();
  const operationReview = route.page === 'operation';
  if (operationReview && route.stage !== 'review') {
    rememberOperation();
    route = { ...route, stage: 'review' };
    history.pushState(route, '', routeHash(route));
  }
  if (operationReview) {
    $('#workflow-progress').dataset.stage = 'review';
    $('#workflow-progress').innerHTML = workflowSteps(route.kind==='DELIVERY'?3:2,route.kind);
    $('#stage-label').textContent = `${route.kind==='DELIVERY'?'第 3 步':'第 2 步'} · 核对 · 尚未保存`;
    $('#draft-hint').textContent = `${$('#context-subject').textContent} · 核对 · 尚未保存`;
  }
  const progress=document.createElement('div');progress.className='review-steps';progress.innerHTML=workflowSteps(operationReview&&route.kind==='DELIVERY'?3:2,operationReview?route.kind:'')+'<p>核对客户、数量与金额 · 确认后才会保存</p>';
  $('#review-body').before(progress);
  $('#review-error').hidden = true;
  $('#review-error').textContent = '';
  $('#review-body').innerHTML = rows.filter(Boolean).map((row, i) =>
    `<p class="${i===0?'review-subject':''}">${esc(row)}</p>`).join('');
  $('#review-save').disabled = false;
  $('#review-save').textContent = title.includes('送货')?'确认送货并保存':title.includes('回瓶')?'确认回瓶并保存':title.includes('收款')?'确认收款并保存':'确认保存';
  $('#review').showModal();
  $('#review-body').scrollTop=0;
}

function closeReview() {
  if (saving) return;
  pending = null;
  $('#review').close();
  if (route.page === 'operation' && route.stage === 'review') {
    route.stage = route.kind === 'DELIVERY' ? 'payment' : 'fill';
    history.replaceState(route, '', routeHash(route));
    $('#workflow-progress').dataset.stage = route.stage;
    $('#workflow-progress').innerHTML = workflowSteps(route.kind==='DELIVERY'?2:1,route.kind);
    $('#operation-form').dispatchEvent(new Event('input',{bubbles:true}));
  }
}
$('#review').addEventListener('cancel', e => {
  e.preventDefault();
  if (!saving) closeReview();
});
$('[data-close]').onclick = closeReview;
$('#review-save').onclick = async () => {
  if (!pending || saving) return;
  saving = true;
  $('#review-save').disabled = true;
  try {
    await pending();
    pending = null;
    $('#review').close();
  } catch (e) {
    $('#review-error').textContent = e.message;
    $('#review-error').hidden = false;
  } finally {
    saving = false;
    $('#review-save').disabled = false;
  }
};

function submitOperation() {
  try {
    const data = form(),
      k = route.kind,
      cid = data.get('customer') || '',
      c = cid ? customerService.get(cid) : null,
      pid = data.get('product');
    let rows = [c?.name || '仓库'],
      action;
    const before = {
      receivable: c?.receivable || 0,
      emptyBottles: c?.emptyBottleCount || 0,
      products: productService.list(),
      stocks: cid ? customerService.stocks(cid) : []
    };
    if (k === 'DELIVERY') {
      const lines = operationLines(),
        q = deliveryService.quote(lines, true, cid),
        agreed = data.get('final') === '' ? q.totalAmount : Number(data.get('final')),
        reason = String(data.get('reason')),
        payment = data.get('paid');
      if (!cid) throw Error('请选择酒吧');
      if (route.stage === 'fill' || !route.stage) {
        setOperationStage('payment');
        return;
      }
      validateMoney(agreed, true);
      if (Math.round(agreed * 100) !== Math.round(q.totalAmount * 100) && !reason.trim()) throw Error('调整货款请填写协商说明');
      rows.push(...q.items.map(i => `${i.productName} × ${i.quantity} 箱 · ¥${i.unitPrice}/箱 · ${i.bottlesPerCase}瓶/箱`),
        `计算 ¥${moneyText(q.totalAmount)} → 最终 ¥${moneyText(agreed)}`, payment === 'CREDIT' ? '赊账，计入应收' : '已付款，计入实收',
        `待回空瓶 ＋${q.totalEmptyBottleQuantity} 瓶`, reason);
      rows.push(`应收：¥${moneyText(c?.receivable||0)} → ¥${moneyText((c?.receivable||0)+(payment==='CREDIT'?agreed:0))}`);
      action = () => deliveryService.createDelivery(cid, lines, payment, {
        amount: agreed,
        reason
      });
    }
    if (k === 'PAYMENT') {
      const cash = Number(data.get('amount')),
        forgiven = Number(data.get('forgiven') || 0),
        reason = String(data.get('reason')),
        method = data.get('method');
      validateMoney(cash);
      validateMoney(forgiven, true);
      if (c && cents(cash) > cents(c.receivable)) throw Error('收款金额不能超过当前应收');
      if (c && cents(cash) + cents(forgiven) > cents(c.receivable)) throw Error('实收与减免合计不能超过当前应收');
      if (forgiven > 0 && !reason.trim()) throw Error('减免应收请填写协商说明');
      rows.push(`支付方式：${PAYMENT_METHODS.find(p=>p.value===method)?.label||'未选择'}`,
        `实收 ¥${moneyText(cash)} · 减免 ¥${moneyText(forgiven)}`, `剩余应收 ¥${moneyText((c?.receivable||0)-cash-forgiven)}`,
        reason);
      action = () => paymentService.createPayment(cid, cash, method, {
        forgivenAmount: forgiven,
        reason
      });
    }
    if (k === 'BOTTLE_RETURN') {
      const n = Number(data.get('count')),
        deduct = data.get('return-mode') === 'ESTIMATE',
        name = bottleService.list(cid).find(p => p.productId === pid)?.name || '未选择种类';
      validateQuantity(n);
      if (!pid) throw Error('请选择回收种类');
      rows.push(name, `本次回收 ${n} 瓶`, deduct ? '本次模式：按回瓶估算余酒' : '本次模式：只登记回瓶');
      const pool=c?.emptyBottlesByProduct?.[pid]||0;
      if (n>pool) throw Error('回瓶数量不能超过该种类待回数量');
      rows.push(`该商品待回：${pool} → ${pool-n} 瓶`,`客户总待回：${c?.emptyBottleCount||0} → ${(c?.emptyBottleCount||0)-n} 瓶`,deduct?'余酒按回瓶估算，实际以盘点为准；已盘点请返回选择只登记回瓶':'酒吧库存保持不变');
      action = () => bottleService.createReturn(cid, [{
        productId: pid,
        quantity: n
      }], deduct);
    }
    if (k === 'PURCHASE') {
      const n = Number(data.get('count'));
      validateQuantity(n);
      rows.push(getProduct(pid).name, `进货 ${n} 箱`);
      action = () => inventoryService.purchase(pid, n);
    }
    if (k === 'STOCKTAKE') {
      const n = Number(data.get('count')),
        isCustomer = data.get('scope') === 'CUSTOMER',
        loose = isCustomer ? Number(data.get('loose') || 0) : 0;
      rows = [isCustomer ? c?.name : '仓库', getProduct(pid).name, `实际 ${n} 箱${isCustomer?'＋'+loose+' 瓶':''}`,
        '只调整库存，不改变应收或待回空瓶'
      ];
      if (isCustomer && !cid) throw Error('请选择酒吧');
      action = () => inventoryService.stocktake(pid, n, isCustomer ? cid : undefined, loose);
    }
    if (k !== 'PURCHASE' && !(k === 'STOCKTAKE' && data.get('scope') === 'WAREHOUSE') && !cid) throw Error('请选择酒吧');
    confirm('确认' + typeTitle(k), rows, () => {
      action();
      const targetCustomer = cid && k !== 'PURCHASE' && !(k==='STOCKTAKE'&&data.get('scope')==='WAREHOUSE') ? cid : '';
      const afterCustomer=targetCustomer?customerService.get(targetCustomer):null;
      const afterStocks=targetCustomer?customerService.stocks(targetCustomer):[];
      const affected=k==='DELIVERY'?operationLines().map(i=>i.productId):pid?[pid]:[];
      const changes=[];
      if (k==='DELIVERY'||k==='PAYMENT') changes.push(['应收','¥'+moneyText(before.receivable),'¥'+moneyText(afterCustomer?.receivable||0)]);
      if (k==='DELIVERY'||k==='BOTTLE_RETURN') changes.push(['客户总待回空瓶',before.emptyBottles+' 瓶',(afterCustomer?.emptyBottleCount||0)+' 瓶']);
      if (k==='BOTTLE_RETURN') changes.push(['该商品待回空瓶',(c?.emptyBottlesByProduct?.[pid]||0)+' 瓶',(afterCustomer?.emptyBottlesByProduct?.[pid]||0)+' 瓶']);
      for (const productId of affected) {
        const p=before.products.find(p=>p.id===productId);
        if (k==='DELIVERY'||k==='PURCHASE'||(k==='STOCKTAKE'&&!targetCustomer)) changes.push(['仓库 · '+(p?.name||''),(p?.stock||0)+' 箱',getProduct(productId).stock+' 箱']);
        if (targetCustomer && (k==='DELIVERY'||k==='STOCKTAKE'||k==='BOTTLE_RETURN')) changes.push([k==='BOTTLE_RETURN'?(data.get('return-mode')==='ESTIMATE'?'酒吧库存（回瓶估算）':'酒吧库存（保持不变）'):'酒吧 · '+(p?.name||''),stockText(before.stocks.find(s=>s.id===productId)),stockText(afterStocks.find(s=>s.id===productId))]);
      }
      const savedRecord = recordService.list('ALL',targetCustomer||undefined)[0];
      const summary = { customerId: targetCustomer, kind: k, title: typeTitle(k), changes, recordId: savedRecord.id, estimated: k==='BOTTLE_RETURN'&&data.get('return-mode')==='ESTIMATE' };
      const flowId = route.flowId;
      operationDrafts.delete(draftKey());
      route = { page: 'result', id: savedRecord.id, kind: k, flowId, result: summary };
      completedFlows.set(flowId, { ...route });
      history.replaceState(route, '', routeHash(route));
      toast(typeTitle(k) + '已保存');
      render();
      window.scrollTo(0,0);
    });
  } catch (e) {
    const error = $('#form-error');
    if (error) {
      error.textContent = e.message;
      error.hidden = false;
    } else toast(e.message);
  }
}

function recordRows(list) {
  return list.map(r =>
    `<div class="record ${route.page==='record'?'':'clickable'}" ${route.page==='record'?'':`role="button" tabindex="0" data-record="${esc(r.id)}"`}><div class="row"><strong>${esc(r.customerName||'仓库')}</strong><span class="record-type ${r.type==='PAYMENT'?'paid':''}">${esc(r.title)}</span></div><p class="record-description">${esc(r.description)}</p><div class="row record-bottom"><small>${esc(r.timeText)}${r.receipts?.length?' · 收据 '+r.receipts.length+' 张':''}</small><div class="record-figures">${r.quantity!==0&&r.quantityText?`<span>${esc(r.quantityText)} ${esc(r.unitText)}</span>`:''}${r.amount?`<b class="${r.type==='PAYMENT'?'green':'red'}">¥${moneyText(r.amount)}</b>`:''}</div></div></div>`
    ).join('') || emptyState('暂无业务记录', '记下的送货、回瓶和收款会留在这里。');
}

function records() {
  return `${pageHead('记录','每一笔业务都有据可查')}<div class="filters">${[['ALL','全部'],['DELIVERY','送货'],['BOTTLE_RETURN','回瓶'],['PAYMENT','收款'],['INVENTORY','库存']].map(([v,t])=>`<button data-filter="${v}" class="${filter===v?'active':''}">${t}</button>`).join('')}</div><div class="card">${recordRows(recordService.list(filter))}</div>`;
}

function profile() {
  return `${pageHead('我的','常用资料与数据管理')}${window.cloudBackup?.panel()||''}<section class="card menu-card">${[['analysis','经营分析','周统计、月统计与业务趋势','', 'records'],['manage','商品管理','价格、箱规与库存提醒','PRODUCT','crate'],['manage','酒吧管理','联系资料与专属售价','CUSTOMER','customers']].map(([p,t,n,k,i])=>`<button class="menu-row" data-go="${p}" data-kind="${k}"><span class="menu-icon">${icon(i)}</span><span><strong>${t}</strong><small>${n}</small></span>${icon('chevron')}</button>`).join('')}</section><section class="card"><div class="section-heading"><div><h2>数据备份</h2><small>业务与收据一起保存</small></div><span class="badge">本机存储</span></div><p class="muted">换手机或清理浏览器前，先导出一份备份。</p><div class="controls"><button data-export>导出备份</button><button data-import>恢复备份</button></div></section><section class="card about-card"><h2>啤酒批发管家</h2><p class="muted">网页 App · V1.5.4 账套管理版</p><p class="muted">小程序、网页与原生 iOS 分别保存数据，暂不自动同步。支持添加到 iPhone 主屏幕；HTTPS 首次加载并缓存后可离线打开。</p></section><section class="card"><h2>账套与重置</h2><p class="muted">正式使用前，重置为空白账套，再录入期初库存和酒吧资料。重置会保留一份可撤销的本机副本。</p><div class="controls"><button class="danger-button" data-blank>重置为空白账套</button><button data-reset>恢复示例数据</button><button data-undo-reset>撤销最近一次重置</button></div></section>`;
}

function analysis() {
  const s = analysisService.summary(period, offset),
    model = chartModel(s.points, chartKind);
  return `${pageHead('经营分析','看本期变化，安排下一次送货')}<div class="filters segmented">${[['WEEK','周统计'],['MONTH','月统计'],['ALL','全部']].map(([v,t])=>`<button data-period="${v}" class="${v===period?'active':''}">${t}</button>`).join('')}</div><div class="period-navigation"><button data-shift="-1" ${period==='ALL'?'disabled':''}>‹ 上期</button><small>${esc(s.rangeLabel)}</small><button data-shift="1" ${offset>=0||period==='ALL'?'disabled':''}>下期 ›</button></div><div class="grid">${card('送货金额','¥'+s.salesText)}${card('实际收款','¥'+s.collectedText,'green')}${card('送货数量',s.quantity+' 箱')}${card('回收空瓶',s.returned+' 瓶')}</div><div class="card section"><h3>业务趋势</h3><div class="filters">${[['MONEY','金额'],['DELIVERY','送货'],['BOTTLE','回瓶']].map(([v,t])=>`<button data-chart="${v}" class="${v===chartKind?'active':''}">${t}</button>`).join('')}</div>${drawChart(model)}<p class="muted">${esc(s.chartNote)}</p></div><div class="card"><h3>协商与减免</h3><p>送货协商差额 ¥${s.negotiatedText}</p><p>收款减免 ¥${s.forgivenText}</p></div><div class="card"><h3>当前待处理（实时）</h3><p class="red">应收 ¥${s.receivableText}</p><p>待回 ${s.bottles} 瓶</p></div><div class="card"><h3>酒吧送货排行</h3>${s.customers.map(c=>`<div class="list-row"><div class="row wrap"><span>${esc(c.name)}</span><b>¥${c.amountText}</b></div><div class="rank-track"><div class="rank-fill" style="width:${c.width}%"></div></div></div>`).join('')||'<p class="muted">暂无送货</p>'}</div><div class="card"><h3>商品送货排行</h3>${s.products.map(p=>`<div class="row list-row wrap"><span>${esc(p.name)}</span><b>${p.quantity} 箱</b></div>`).join('')}</div><div class="card"><h3>每日明细</h3>${s.daily.map(d=>`<div class="list-row"><b>${d.day}</b><p>送货 ¥${d.salesText} · 实收 ¥${d.collectedText}</p></div>`).join('')||'<p class="muted">本期暂无业务</p>'}</div>`;
}

function drawChart(model) {
  const n = Math.max(1, model.points.length),
    width = n > 7 ? Math.max(360, n * 52) : Math.max(280, Math.min(600, window.innerWidth - 78)),
    unit = chartKind === 'MONEY' ? '元' : chartKind === 'DELIVERY' ? '箱' : '瓶',
    dual = chartKind === 'MONEY',
    color = chartKind === 'BOTTLE' ? '#cd852d' : '#b8232c',
    space = (width - 36) / n;
  return `<div class="legend"><span><i style="background:${color}"></i>${dual?'送货金额':unit==='箱'?'送货箱数':'回瓶瓶数'}</span>${dual?'<span><i style="background:#21835a"></i>实际收款</span>':''}</div><p class="muted">最高 ${model.maxText} ${unit}</p><div style="overflow-x:auto"><svg role="img" aria-label="${esc('业务趋势，单位'+unit)}" viewBox="0 0 ${width} 250" style="min-width:${n>7?width:0}px" class="chart"><line x1="25" y1="210" x2="${width-15}" y2="210" stroke="#dce1e8"/><line x1="25" y1="110" x2="${width-15}" y2="110" stroke="#edf0f3"/>${model.points.map((p,i)=>{const x=21+i*space;return `<g><title>${esc(p.label)}：${p.firstText} ${unit}${dual?'；实收 '+p.secondText+' 元':''}</title><rect x="${x}" y="${210-p.firstHeight*1.8}" width="11" height="${p.firstHeight*1.8}" fill="${color}" rx="3"/>${dual?`<rect x="${x+14}" y="${210-p.secondHeight*1.8}" width="11" height="${p.secondHeight*1.8}" fill="#21835a" rx="3"/>`:''}<text x="${x+12}" y="238" text-anchor="middle" fill="#727b87" font-size="12">${esc(p.label)}</text></g>`;}).join('')}</svg></div>${model.empty?'<p class="muted">本期暂无业务，图表为0</p>':''}`;
}

function manage() {
  const isProduct = route.kind === 'PRODUCT';
  if (!isProduct) return `<div class="row wrap"><h1>酒吧管理</h1><button class="primary" style="width:auto" data-edit="CUSTOMER">＋ 新增酒吧</button></div>${customerService.list().map(c=>`<div class="card clickable" data-edit="CUSTOMER" data-id="${esc(c.id)}"><h3>${esc(c.name)}</h3><p class="muted">${esc(c.contactName||'联系人待补充')}</p></div>`).join('')}`;
  const all = productService.list(true), removed = all.filter(p => p.deletedAt), list = all.filter(p => productView === 'DELETED' ? p.deletedAt : !p.deletedAt);
  return `${pageHead('商品管理','新增、编辑与删除商品', '<button class="primary" style="width:auto" data-edit="PRODUCT">＋ 新增商品</button>')}<div class="filters segmented"><button data-product-view="ACTIVE" class="${productView==='ACTIVE'?'active':''}">在用商品 ${all.length-removed.length}</button><button data-product-view="DELETED" class="${productView==='DELETED'?'active':''}">已删除 ${removed.length}</button></div>${list.map(p=>`<div class="card"><div class="row wrap"><h3>${esc(p.name)}</h3><strong class="red">¥${moneyText(p.price)} / 箱</strong></div><p class="muted">库存 ${p.stock} 箱 · ${p.bottlesPerCase} 瓶/箱 · 提醒值 ${p.lowStockThreshold} 箱</p><div class="controls">${p.deletedAt?`<button data-restore-product="${esc(p.id)}">恢复商品</button>`:`<button data-edit="PRODUCT" data-id="${esc(p.id)}">编辑 / 调整库存</button><button class="danger-button" data-delete-product="${esc(p.id)}">删除</button>`}</div></div>`).join('')||emptyState(productView==='DELETED'?'暂无已删除商品':'暂无商品','点击“新增商品”填写名称、售价和箱规。')}`;
}

function editor() {
  const isProduct = route.kind === 'PRODUCT',
    p = route.id ? (isProduct ? getProduct(route.id) : customerService.get(route.id)) : {};
  return `<h1>${route.id?'编辑':'新增'}${isProduct?'商品':'酒吧'}</h1>${workflowSteps(1)}<form id="editor-form"><div class="card">${input('name','名称 *',p.name)}${isProduct?input('price','默认售价（元/箱）',p.price??0,'money')+step('stock','仓库库存（箱）',p.stock??0)+input('threshold','低库存提醒值',p.lowStockThreshold??15,'number')+input('size','每箱瓶数',p.bottlesPerCase??24,'number'):input('contact','联系人',p.contactName)+input('phone','电话',p.phone,'tel')+input('address','地址',p.address)+input('remark','备注',p.remark)}</div>${!isProduct?`<div class="card"><h3>酒吧专属售价</h3><p class="muted">留空使用默认价；本次送货仍可调整。</p>${productService.list().map(product=>input('special-'+product.id,product.name+'（默认 ¥'+moneyText(product.price)+'）',p.productPrices?.[product.id]??'','money')).join('')}</div>`:''}<footer class="sticky-action workflow-footer"><p class="draft-hint">填写中 · 确认后才会保存</p><button type="submit" class="primary">下一步：核对资料</button></footer></form>${route.id?(isProduct?`<button class="danger-button section" data-delete-product="${esc(route.id)}">删除商品</button>`:`<button class="red section" data-delete="${esc(route.id)}">删除酒吧</button>`):''}`;
}

function saveEditor() {
  try {
    const data = new FormData($('#editor-form')),
      kind = route.kind,
      id = route.id;
    let action, rows;
    if (kind === 'PRODUCT') {
      const p = {
        id: id || undefined,
        name: String(data.get('name')),
        price: Number(data.get('price')),
        stock: Number(data.get('stock')),
        lowStockThreshold: Number(data.get('threshold')),
        bottlesPerCase: Number(data.get('size'))
      };
      rows = [p.name, `售价 ¥${moneyText(p.price)} · ${p.bottlesPerCase} 瓶/箱`,
        `仓库库存 ${p.stock} 箱，提醒值 ${p.lowStockThreshold}`
      ];
      action = () => productService.save(p);
    } else {
      const prices = {};
      for (const p of productService.list()) {
        const v = String(data.get('special-' + p.id));
        if (v.trim()) prices[p.id] = Number(v);
      }
      const c = {
        id: id || undefined,
        name: String(data.get('name')),
        contactName: String(data.get('contact')),
        phone: String(data.get('phone')),
        address: String(data.get('address')),
        remark: String(data.get('remark')),
        productPrices: prices
      };
      rows = [c.name, c.contactName, c.address, '保存客户资料及专属售价'];
      action = () => customerService.save(c);
    }
    confirm('保存资料', rows, () => {
      action();
      toast('保存成功');
      go('manage', '', kind);
    });
  } catch (e) {
    toast(e.message);
  }
}

function record() {
  const r = recordService.list().find(r => r.id === route.id);
  if (!r) throw Error('找不到流水');
  return `${pageHead('流水详情',r.timeText)}${r.customerId&&customerService.list().some(c=>c.id===r.customerId)?`<button class="record-customer-return" data-customer="${esc(r.customerId)}">返回${esc(r.customerName)}详情 ${icon('chevron')}</button>`:''}<div class="card">${recordRows([r])}</div><div class="card"><div class="section-heading"><div><h2>收据</h2><small>已保存 ${r.receipts?.length||0} / 6 张</small></div><span class="badge">本机保存</span></div><p class="muted">拍照或相册图片，每张最多5MB；数据备份会包含图片。</p><button class="primary" data-add-receipt ${r.receipts?.length>=6?'disabled':''}>＋ 添加收据</button><div id="receipt-list" class="receipts section"></div></div>`;
}
async function loadReceipts() {
  const id = route.id;
  try {
    const receipts = receiptService.list(id),
      loaded = await Promise.all(receipts.map(async r => ({
        ...r,
        data: await images.get(r.path)
      })));
    if (route.page !== 'record' || route.id !== id) return;
    $('#receipt-list').innerHTML = loaded.map(r =>
      `<div>${r.data?`<img alt="收据" src="${esc(r.data)}" data-preview="${esc(r.path)}">`:'<p class="red">图片不可用</p>'}<button class="red" data-remove-receipt="${esc(r.id)}">移除</button></div>`
      ).join('');
  } catch (e) {
    toast(e.message);
  }
}
async function makeBackup() {
  const db = storageService.read(),
    files = {};
  for (const r of db.records)
    for (const receipt of r.receipts || []) {
      const data = await images.get(receipt.path);
      if (!data) throw Error('有收据图片缺失，未生成不完整备份');
      files[receipt.path] = data;
    }
  return { format: 'beer-manager-web-v1', database: db, images: files };
}
async function exportBackup() {
  const blob = new Blob([JSON.stringify(await makeBackup())], {
      type: 'application/json'
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = '啤酒管家备份-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('备份已导出，请保存在文件中');
}

function validateBackup(data) {
  if (data.format !== 'beer-manager-web-v1') throw Error('请选择网页版备份；原生 iOS 格式不同');
  const d = data.database;
  if (d?.version !== 2 || !['products', 'customers', 'customerStocks', 'deliveries', 'payments', 'bottleReturns',
      'stockMovements', 'records'
    ].every(k => Array.isArray(d[k]))) throw Error('备份格式异常');
  const nonnegative = n => Number.isSafeInteger(n) && n >= 0,
    price = n => Number.isFinite(n) && n >= 0 && n <= 99999999;
  const pids = new Set(d.products.map(p => p.id)),
    cids = new Set(d.customers.map(c => c.id));
  if (pids.size !== d.products.length || cids.size !== d.customers.length) throw Error('备份存在重复编号');
  for (const p of d.products)
    if (!p.name || !nonnegative(p.stock) || !nonnegative(p.lowStockThreshold) || !nonnegative(p.bottlesPerCase) || !p
      .bottlesPerCase || !price(p.price)) throw Error('商品数据异常');
  for (const c of d.customers)
    if (!c.name || !price(c.receivable) || !nonnegative(c.emptyBottleCount) || Object.values(c.productPrices || {})
      .some(p => !price(p))) throw Error('客户数据异常');
  for (const s of d.customerStocks)
    if (!pids.has(s.productId) || !cids.has(s.customerId) || !nonnegative(s.quantity) || !nonnegative(s
        .looseBottleQuantity || 0)) throw Error('库存数据异常');
  for (const r of d.records) {
    if ((r.receipts || []).length > 6) throw Error('收据数量异常');
    for (const receipt of r.receipts || [])
      if (typeof data.images?.[receipt.path] !== 'string' || !/^data:image\/(png|jpeg|webp|gif|heic|heif);base64,/.test(
          data.images[receipt.path]) || data.images[receipt.path].length > 7 * 1024 * 1024) throw Error('收据数据缺失或格式异常');
  }
  return d;
}
async function restoreBackup(data) {
  const d = validateBackup(data),
    paths = [];
  try {
    for (const r of d.records)
      for (const receipt of r.receipts || []) {
        const old = receipt.path,
          path = 'receipt-' + crypto.randomUUID();
        await images.put(path, data.images[old]);
        paths.push(path);
        receipt.path = path;
      }
    wx.setStorageSync(STORAGE_KEY, d);
  } catch (e) {
    await Promise.all(paths.map(path => images.remove(path)));
    throw e;
  }
  toast('备份已恢复');
  go('home');
}
$('#receipt-file').addEventListener('change', async e => {
  const id = route.id,
    files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;
  const paths = [];
  try {
    for (const file of files) {
      if (!file.type.startsWith('image/')) throw Error('请选择图片');
      if (file.size > 5 * 1024 * 1024) throw Error('单张图片不能超过5MB');
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const path = 'temp-' + crypto.randomUUID();
      tempImages.set(path, data);
      paths.push({
        tempFilePath: path,
        size: file.size
      });
    }
    await receiptService.attach(id, paths);
    toast('收据已保存');
    render();
  } catch (e) {
    toast(e.message);
  } finally {
    paths.forEach(p => tempImages.delete(p.tempFilePath));
  }
});
$('#backup-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text()),
      d = validateBackup(data);
    confirm('恢复备份', [`商品 ${d.products.length} 款、酒吧 ${d.customers.length} 家、流水 ${d.records.length} 条`,
      '覆盖当前业务；请先导出备份。'
    ], () => restoreBackup(data));
  } catch (e) {
    toast(e.message);
  }
});
$('[data-photo-close]').onclick = () => $('#photo').close();
document.addEventListener('input', e => {
  if (e.target.id === 'search') {
    search = e.target.value;
    $('#customer-list').innerHTML = customerCards(search);
  }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'editor-form') {
    e.preventDefault();
    saveEditor();
  }
});
document.addEventListener('click', async e => {
  const button = e.target.closest('button,[data-customer],[data-record],[data-edit],[data-preview]');
  if (!button) return;
  const d = button.dataset;
  try {
    if ('cloud' in d) { await window.cloudBackup.handle(d.cloud, button); return; }
    if ('go' in d) go(d.go, '', d.kind || '');
    if ('back' in d) history.back();
    if ('operationExit' in d) go(route.id?'customer':'entry',route.id||'');
    if ('recordReturn' in d && route.returnTo?.page === 'result') {
      route = { ...route.returnTo };
      history.pushState(route, '', routeHash(route));
      render();
      window.scrollTo(0,0);
    }
    if ('customer' in d) go('customer', d.customer);
    if ('op' in d) go('operation', d.id || '', d.op);
    if ('record' in d) go('record', d.record);
    if ('edit' in d) go('editor', d.id || '', d.edit);
    if ('picker' in d) {
      pickerField=d.picker;
      if (pickerField==='return-kind'&&!$('#operation-customer').value) {toast('请先选择酒吧');return;}
      $('#picker-title').textContent=pickerField==='operation-customer'?'选择酒吧':'选择空瓶种类';
      $('#picker-search').value='';$('#picker-search').hidden=pickerField!=='operation-customer';
      renderPicker();$('#picker').showModal();
    }
    if ('pickValue' in d) {
      const field=$('#'+pickerField);field.value=d.pickValue;field.dispatchEvent(new Event('change',{bubbles:true}));$('#picker').close();
    }
    if ('expandProduct' in d) {
      const row=$('[data-product="'+d.expandProduct+'"]');
      row.classList.toggle('is-expanded');button.setAttribute('aria-expanded',String(row.classList.contains('is-expanded')));
    }
    if ('fillBack' in d) {
      setOperationStage('fill');
    }
    if ('step' in d) {
      const field = document.getElementById(d.step);
      field.value = String(Math.max(0, Math.min(999999, (Number(field.value) || 0) + Number(d.delta))));
      field.dispatchEvent(new Event('input', {
        bubbles: true
      }));
    }
    if ('case' in d) {
      const size = Number($('#case-size').value);
      if (!Number.isSafeInteger(size) || size <= 0) throw Error('每箱瓶数须为正整数');
      $('#count').value = String(Math.min(999999, Number($('#count').value) + size));
      $('#count').dispatchEvent(new Event('input', {
        bubbles: true
      }));
    }
    if ('filter' in d) {
      filter = d.filter;
      render();
    }
    if ('period' in d) {
      period = d.period;
      offset = 0;
      render();
    }
    if ('shift' in d) {
      offset = Math.min(0, offset + Number(d.shift));
      render();
    }
    if ('chart' in d) {
      chartKind = d.chart;
      render();
    }
    if ('classify' in d) {
      const cid = d.classify,
        pid = $('#class-product').value,
        n = Number($('#class-count').value);
      confirm('确认分类', [customerService.get(cid).name, `将 ${n} 瓶归入 ${getProduct(pid).name}`, '总待回不变，不扣库存'], () => {
        bottleService.classify(cid, pid, n);
        toast('分类成功');
        render();
      });
    }
    if ('productView' in d) { productView = d.productView; render(); }
    if ('deleteProduct' in d) {
      const id = d.deleteProduct, product = getProduct(id);
      confirm('删除商品', [product.name, '从在用列表与业务选项移除，历史单据保留，可恢复。', '仓库、在用酒吧库存和该商品待回空瓶须先处理为零。'], () => {
        productService.remove(id); toast('已删除商品'); go('manage', '', 'PRODUCT');
      });
    }
    if ('restoreProduct' in d) {
      const id = d.restoreProduct, product = productService.list(true).find(p => p.id === id);
      if (!product) throw Error('找不到已删除商品');
      confirm('恢复商品', [product.name, '恢复后可再次进货、送货，历史单据保留。'], () => {
        productService.restore(id); toast('已恢复商品'); productView = 'ACTIVE'; go('manage', '', 'PRODUCT');
      });
    }
    if ('delete' in d) {
      const id = d.delete;
      confirm('删除酒吧', [customerService.get(id).name, '须结清应收和空瓶；历史流水保留。'], () => {
        customerService.remove(id);
        toast('已删除');
        go('manage', '', 'CUSTOMER');
      });
    }
    if ('blank' in d) confirm('重置为空白账套', ['商品和默认售价保留，仓库库存归零。', '酒吧、欠款、空瓶和流水清空。建议先导出文件备份。', '会保留重置前的本机副本，可以撤销最近一次重置。'], async () => {
      await window.beerAccounts.blank(); toast('已重置为空白账套'); go('home');
    });
    if ('reset' in d) confirm('恢复示例数据', ['现有账目将替换为示例数据，请先导出文件备份。', '会保留替换前的本机副本，可以撤销最近一次重置。'], async () => {
      await window.beerAccounts.demo(); toast('已恢复示例数据'); go('home');
    });
    if ('undoReset' in d) await window.beerAccounts.undo();
    if ('export' in d) await exportBackup();
    if ('import' in d) $('#backup-file').click();
    if ('addReceipt' in d) $('#receipt-file').click();
    if ('preview' in d) wx.previewImage({
      current: d.preview
    });
    if ('removeReceipt' in d) {
      const id = route.id,
        rid = d.removeReceipt;
      confirm('移除收据', ['只移除图片，保留业务流水。'], () => {
        receiptService.remove(id, rid);
        toast('已移除');
        render();
      });
    }
  } catch (error) {
    toast(error.message);
  }
});

function getProduct(id) {
  const p = productService.list().find(p => p.id === id);
  if (!p) throw Error('请选择商品');
  return p;
}
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][tabindex]')) {
    e.preventDefault();
    e.target.click();
  }
});
resumeRoute();
history.replaceState(route, '', routeHash(route));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

window.beerApp = { makeBackup, validateBackup, restoreBackup, exportBackup, confirm, images, render, toast, go };
