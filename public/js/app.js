import { api, getUser, getToken, setSession, clearSession, isAdmin } from './api.js';
import { esc } from './ui.js';
import { renderSetup } from './views/setup.js';
import { renderLogin } from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderPOS } from './views/pos.js';
import { renderProducts } from './views/products.js';
import { renderInventory } from './views/inventory.js';
import { renderPurchases } from './views/purchases.js';
import { renderExpenses } from './views/expenses.js';
import { renderInvoices } from './views/invoices.js';
import { renderReports } from './views/reports.js';
import { renderUsers } from './views/users.js';
import { renderSettings } from './views/settings.js';

const NAV = [
  { hash: '#/dashboard', label: 'الرئيسية', icon: '📊', roles: ['admin'], title: 'لوحة الرئيسية' },
  { hash: '#/pos', label: 'الكاشير', icon: '🧾', roles: ['admin', 'cashier'], title: 'شاشة البيع' },
  { hash: '#/products', label: 'المنتجات', icon: '🍽️', roles: ['admin', 'cashier'], title: 'إدارة المنتجات' },
  { hash: '#/inventory', label: 'المخزون', icon: '📦', roles: ['admin'], title: 'المخزون والمواد الخام' },
  { hash: '#/purchases', label: 'المشتريات', icon: '🛒', roles: ['admin'], title: 'المشتريات' },
  { hash: '#/expenses', label: 'المصروفات', icon: '💸', roles: ['admin'], title: 'المصروفات' },
  { hash: '#/invoices', label: 'الفواتير', icon: '📄', roles: ['admin', 'cashier'], title: 'الفواتير' },
  { hash: '#/reports', label: 'التقارير', icon: '📈', roles: ['admin'], title: 'التقارير' },
  { hash: '#/users', label: 'المستخدمون', icon: '👥', roles: ['admin'], title: 'المستخدمون والصلاحيات' },
  { hash: '#/settings', label: 'الإعدادات', icon: '⚙️', roles: ['admin'], title: 'الإعدادات والنسخ الاحتياطي' },
];

const VIEWS = {
  '#/dashboard': { fn: renderDashboard, roles: ['admin'] },
  '#/pos': { fn: renderPOS, roles: ['admin', 'cashier'] },
  '#/products': { fn: renderProducts, roles: ['admin', 'cashier'] },
  '#/inventory': { fn: renderInventory, roles: ['admin'] },
  '#/purchases': { fn: renderPurchases, roles: ['admin'] },
  '#/expenses': { fn: renderExpenses, roles: ['admin'] },
  '#/invoices': { fn: renderInvoices, roles: ['admin', 'cashier'] },
  '#/reports': { fn: renderReports, roles: ['admin'] },
  '#/users': { fn: renderUsers, roles: ['admin'] },
  '#/settings': { fn: renderSettings, roles: ['admin'] },
};

const appEl = document.getElementById('app');
let shellReady = false;
let cleanupCurrent = null;

function defaultHash() {
  return isAdmin() ? '#/dashboard' : '#/pos';
}

function renderShell() {
  appEl.innerHTML = `
    <div class="app">
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          <div class="brand-logo">☕</div>
          <span id="brand-name">أوزو OZO</span>
        </div>
        <nav class="nav" id="nav"></nav>
        <div class="sidebar-foot">
          <div id="sb-user" style="margin-bottom:8px"></div>
          <button class="btn btn-sm btn-block" id="logout-btn" type="button">🚪 تسجيل الخروج</button>
        </div>
      </aside>
      <div class="overlay" id="overlay"></div>
      <div class="main">
        <header class="topbar">
          <button class="btn btn-icon btn-ghost hamburger" id="hamburger" type="button" aria-label="القائمة">☰</button>
          <h1 id="page-title"></h1>
          <div class="spacer"></div>
          <div class="user-chip" id="user-chip"></div>
        </header>
        <main class="content" id="view"></main>
      </div>
    </div>`;

  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const closeDrawer = () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); };
  document.getElementById('hamburger').addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
  });
  overlay.addEventListener('click', closeDrawer);

  document.getElementById('logout-btn').addEventListener('click', async () => {
    try { await api('/logout', { method: 'POST' }); } catch (_) {}
    clearSession();
    location.hash = '#/login';
    render();
  });

  shellReady = true;
}

function renderNav() {
  const nav = document.getElementById('nav');
  const items = NAV.filter(n => n.roles.includes(getUser().role));
  nav.innerHTML = items.map(n => `
    <a class="nav-item" href="${n.hash}" data-hash="${n.hash}">
      <span class="ico">${n.icon}</span><span>${n.label}</span>
    </a>`).join('');
  document.getElementById('sb-user').innerHTML = `
    <div style="color:#fff;font-weight:700">${esc(getUser().full_name || getUser().username)}</div>
    <div style="font-size:12px;color:#94a3b8">${getUser().role === 'admin' ? 'مدير' : 'كاشير'}</div>`;
  document.getElementById('user-chip').innerHTML = `
    <div class="user-avatar">${esc((getUser().full_name || getUser().username || '?').charAt(0))}</div>
    <span>${esc(getUser().full_name || getUser().username)}</span>`;
}

function setActiveNav(hash) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.hash === hash);
  });
  const nav = NAV.find(n => n.hash === hash);
  document.getElementById('page-title').textContent = nav ? nav.title : '';
}

function render() {
  const hash = location.hash || '';

  if (!getToken() || !getUser()) {
    shellReady = false;
    if (cleanupCurrent) { cleanupCurrent = null; }
    const needsSetup = hash === '#/setup';
    if (needsSetup) renderSetup(appEl);
    else renderLogin(appEl);
    return;
  }

  if (hash === '#/login' || hash === '#/setup') {
    location.hash = defaultHash();
    return;
  }

  const key = VIEWS[hash] ? hash : defaultHash();
  if (location.hash !== key && VIEWS[hash] === undefined) {
    location.hash = key;
    return;
  }

  if (!shellReady) renderShell();
  renderNav();

  const view = VIEWS[key];
  if (!view.roles.includes(getUser().role)) {
    location.hash = defaultHash();
    return;
  }

  setActiveNav(key);
  const viewEl = document.getElementById('view');
  if (cleanupCurrent) { cleanupCurrent(); cleanupCurrent = null; }
  viewEl.scrollTop = 0;
  window.scrollTo(0, 0);
  const result = view.fn(viewEl);
  if (typeof result === 'function') cleanupCurrent = result;
}

window.addEventListener('hashchange', render);

(async function boot() {
  if (getToken()) {
    try {
      const { user } = await api('/me');
      setSession(getToken(), user);
    } catch (_) {
      clearSession();
    }
  }
  if (!getToken()) {
    let needsSetup = false;
    try { needsSetup = (await api('/setup/status')).needsSetup; } catch (_) {}
    location.hash = needsSetup ? '#/setup' : '#/login';
    if (!location.hash) return;
  }
  render();
})();
