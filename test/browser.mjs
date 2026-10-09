import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-browser-'));

const errors = [];
let ok = 0, bad = 0;
const chk = (c, m) => { if (c) ok++; else { bad++; console.log('  X ' + m); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

console.log('تشغيل خادم اختبار خاص...');
const server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORT), POS_DB_PATH: path.join(TMP, 'browser.db') },
  stdio: 'ignore',
});
for (let i = 0; i < 40; i++) {
  try { await fetch(BASE + '/api/setup/status'); break; } catch (_) { await wait(250); }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--window-size=1366,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });

page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('requestfailed', r => {
  const u = r.url();
  if (u.includes('fonts.googleapis') || u.includes('fonts.gstatic')) return;
  errors.push('REQFAIL: ' + u);
});

const txt = sel => page.$eval(sel, el => el.textContent).catch(() => null);
const count = sel => page.$$eval(sel, els => els.length).catch(() => 0);
const closeModals = () => page.evaluate(() => {
  document.querySelectorAll('.modal-overlay').forEach(e => e.remove());
  document.getElementById('modal-root').innerHTML = '';
});
const go = async hash => {
  await page.evaluate(h => { location.hash = h; }, hash);
  await wait(1100);
  await closeModals();
};
const click = async sel => {
  await page.waitForSelector(sel, { timeout: 8000 });
  await page.click(sel);
  await wait(450);
};
const jget = async url => page.evaluate(async u => {
  const t = localStorage.getItem('pos_token');
  const r = await fetch(u, { headers: { Authorization: 'Bearer ' + t } });
  return r.ok ? r.json() : Promise.reject(new Error(u + ' -> ' + r.status));
}, url);
const jsend = async (url, method, body) => page.evaluate(async (u, m, b) => {
  const t = localStorage.getItem('pos_token');
  const r = await fetch(u, {
    method: m,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
    body: b ? JSON.stringify(b) : undefined,
  });
  return r.ok ? r.json() : Promise.reject(new Error(u + ' -> ' + r.status + ' ' + await r.text()));
}, url, method, body);

let stage = 'init';

try {
  console.log('1) إنشاء أول مستخدم (Setup)');
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await wait(700);
  chk(await page.$('#setup-form'), 'setup form shown on first run');
  chk((await page.evaluate(() => location.hash)) === '#/setup', 'on #/setup');
  await page.type('input[name=username]', 'admin');
  await page.type('input[name=full_name]', 'مدير النظام');
  await page.type('input[name=password]', 'admin1234');
  await page.type('input[name=confirm]', 'admin1234');
  await page.click('#setup-form button[type=submit]');
  await page.waitForSelector('.sidebar', { timeout: 8000 });
  await wait(1300);
  chk((await page.evaluate(() => location.hash)) === '#/dashboard', 'admin lands on dashboard after setup');

  stage = 'logout-login';
  console.log('2) تسجيل الخروج والدخول');
  await click('#logout-btn');
  await wait(900);
  chk(await page.$('#login-form'), 'login form after logout');
  await page.type('input[name=username]', 'admin');
  await page.type('input[name=password]', 'admin1234');
  await page.click('#login-form button[type=submit]');
  await page.waitForSelector('.sidebar', { timeout: 8000 });
  await wait(1100);
  chk((await page.evaluate(() => location.hash)) === '#/dashboard', 'login returns to dashboard');

  stage = 'pos';
  console.log('3) شاشة الكاشير');
  await go('#/pos');
  chk(await count('.p-tile') === 13, `13 product tiles in POS (${await count('.p-tile')})`);
  await page.click('.p-tile');
  await page.click('.p-tile');
  await wait(300);
  const sub = await txt('#sum-sub');
  chk(sub && sub.includes('60'), `subtotal after 2 clicks = ${sub}`);
  await page.type('#in-note', 'طلب اختبار المتصفح');
  await page.click('#btn-checkout');
  await page.waitForSelector('.modal', { timeout: 8000 });
  await wait(500);
  const modalTitle = await txt('.modal-head h3');
  chk(modalTitle && modalTitle.includes('INV-'), `receipt modal: ${modalTitle}`);
  chk((await txt('.modal-body') || '').includes('بطاطس عادي'), 'receipt contains item');
  await page.click('#r-close');
  await wait(400);
  const invAfter = await txt('#inv-no');
  chk(invAfter && invAfter.startsWith('INV-'), `next invoice preview ${invAfter}`);
  const chipCount = await count('.chip');
  chk(chipCount >= 2, `category chips (${chipCount})`);

  stage = 'dashboard';
  console.log('4) لوحة الرئيسية');
  await go('#/dashboard');
  chk(await count('#stats .stat') >= 6, `dashboard stats rendered (${await count('#stats .stat')})`);
  chk(await txt('#top-products') !== null, 'top products box');
  chk(await txt('#low-stock') !== null, 'low stock box');
  await page.click('.tab[data-k="weekly"]');
  await wait(700);
  chk(await count('#chart .bar-col') >= 1, `weekly chart bars (${await count('#chart .bar-col')})`);
  await page.click('.tab[data-k="monthly"]');
  await wait(700);
  chk(await count('#chart .bar-col') >= 1, `monthly chart bars (${await count('#chart .bar-col')})`);

  stage = 'inventory';
  console.log('5) المخزون');
  await go('#/inventory');
  chk(await count('#box .empty') >= 1 || await count('table.data tbody tr') >= 1, 'inventory tab renders');
  await click('#btn-new-ing');
  chk(await page.$('#i-name'), 'ingredient modal opens');
  await page.type('#i-name', 'بطاطس مجمدة');
  await page.select('#i-unit', 'كجم');
  await page.type('#i-price', '25');
  await page.type('#i-qty', '50');
  await page.type('#i-min', '5');
  await page.click('#i-save');
  await wait(1400);
  chk(await page.$('.modal-overlay') === null, 'ingredient modal closed after save');
  chk(await count('table.data tbody tr') >= 1, `ingredient row added (${await count('table.data tbody tr')})`);
  await page.click('.tab[data-t=moves]');
  await wait(800);
  chk(await count('#moves-table') >= 1, 'movements tab renders');
  await page.click('.tab[data-t=suppliers]');
  await wait(600);
  chk(await count('table.data') >= 1, 'suppliers table');

  stage = 'products';
  console.log('6) المنتجات والوصفات');
  await go('#/products');
  chk(await count('table.data tbody tr') >= 13, `products table rows (${await count('table.data tbody tr')})`);
  await click('#btn-new');
  chk(await page.$('#p-name'), 'new product modal opens');
  await page.click('#p-cancel');
  await wait(300);

  const seeds = await jget('/api/ingredients');
  const prodList = await jget('/api/products');
  const strips = prodList.find(p => p.name.includes('استربس'));
  const ing = seeds.find(i => i.name === 'بطاطس مجمدة');
  chk(!!strips && !!ing, 'found strips product and ingredient');
  if (strips && ing) {
    await jsend(`/api/products/${strips.id}/recipe`, 'PUT', { items: [{ ingredient_id: ing.id, quantity: 5 }] });
  }
  const edited = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('table.data tbody tr')];
    const row = rows.find(r => r.textContent.includes('استربس'));
    const btn = row && row.querySelector('[data-edit]');
    if (btn) { btn.click(); return true; }
    return false;
  });
  await wait(1000);
  chk(edited, 'found strips row');
  chk(await count('[data-row]') >= 1, `existing recipe loaded in modal (${await count('[data-row]')})`);
  await page.click('#p-cancel');
  await wait(300);

  stage = 'purchases';
  console.log('7) المشتريات');
  await go('#/purchases');
  await click('#btn-new');
  chk(await page.$('#n-items'), 'purchase modal opens');
  await page.click('#n-cancel');
  await wait(300);

  stage = 'expenses';
  console.log('8) المصروفات');
  await go('#/expenses');
  await click('#btn-new');
  chk(await page.$('#x-type'), 'expense modal opens');
  await page.click('#x-cancel');
  await wait(300);

  stage = 'invoices';
  console.log('9) الفواتير');
  await go('#/invoices');
  chk(await count('table.data tbody tr') >= 1, `invoices table (${await count('table.data tbody tr')})`);
  await click('table.data tbody tr [data-view]');
  chk(await page.$('.receipt'), 'invoice receipt modal');
  chk(await page.$('#v-cancel'), 'cancel button for admin');
  await page.click('#v-close');
  await wait(300);

  stage = 'reports';
  console.log('10) التقارير');
  await go('#/reports');
  await wait(900);
  chk((await page.$eval('#report-out', e => e.innerHTML.length)) > 200, 'default report rendered');
  for (const [rep, expect] of [
    ['profits', 'صافي الربح'],
    ['inventory', 'قيمة المخزون'],
    ['payment-methods', 'نقدي'],
    ['top-products', 'الصنف'],
    ['invoices', 'رقم الفاتورة'],
    ['product-costs', 'المكونات'],
    ['daily-sales', 'التكلفة'],
    ['purchases', 'المورد'],
    ['expenses', 'المصروفات'],
    ['by-product', 'الإيراد'],
    ['weekly-sales', 'الخصومات'],
    ['monthly-sales', 'عدد الفواتير'],
  ]) {
    await page.select('#r-select', rep);
    await wait(750);
    const body = (await txt('#report-out')) || '';
    chk(body.includes(expect), `report ${rep} renders (expected "${expect}")`);
  }

  stage = 'users';
  console.log('11) المستخدمون والإعدادات');
  await go('#/users');
  chk(await count('table.data tbody tr') >= 1, `users table (${await count('table.data tbody tr')})`);
  await click('#btn-new');
  chk(await page.$('#u-name'), 'new user modal');
  await page.click('#u-cancel');
  await wait(300);

  stage = 'settings';
  await go('#/settings');
  chk(await page.$('#store-form'), 'settings form');
  await click('#btn-backup');
  await wait(1600);
  chk(await count('#backup-list .list-row') >= 1, 'backup created and listed');
  await page.waitForSelector('#menu-url', { timeout: 8000 });
  await wait(700);
  const menuUrlVal = await page.$eval('#menu-url', el => el.value);
  chk(menuUrlVal && menuUrlVal.includes('/menu'), `menu url prefilled (${menuUrlVal})`);
  chk(await page.$('#menu-qr') && (await page.$eval('#menu-qr', el => el.getAttribute('src') || '').then(s => s.startsWith('/api/qr'))), 'qr preview code present');

  stage = 'cashier';
  console.log('12) صلاحيات الكاشير');
  await jsend('/api/users', 'POST', { username: 'cashier1', password: 'cash1234', role: 'cashier', full_name: 'كاشير' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  await wait(900);
  await page.type('input[name=username]', 'cashier1');
  await page.type('input[name=password]', 'cash1234');
  await page.click('#login-form button[type=submit]');
  await page.waitForSelector('.pos', { timeout: 8000 });
  await wait(1000);
  chk((await page.evaluate(() => location.hash)) === '#/pos', 'cashier lands on POS');
  const navHashes = await page.$$eval('.nav-item', els => els.map(e => e.dataset.hash));
  chk(!navHashes.includes('#/reports'), 'cashier cannot see reports menu');
  chk(!navHashes.includes('#/settings'), 'cashier cannot see settings menu');
  chk(!navHashes.includes('#/expenses'), 'cashier cannot see expenses menu');
  chk(!navHashes.includes('#/inventory'), 'cashier cannot see inventory menu');
  await go('#/reports');
  chk((await page.evaluate(() => location.hash)) === '#/pos', 'cashier redirected away from reports');
  await go('#/pos');
  chk(await count('.p-tile') === 13, `cashier sees products in POS (${await count('.p-tile')})`);
  await go('#/invoices');
  chk(await count('table.data tbody tr') >= 1, 'cashier can view invoices');

  stage = 'mobile';
  console.log('13) شاشة الموبايل (390px)');
  const mob = await browser.newPage();
  await mob.setViewport({ width: 390, height: 844 });
  await mob.goto(BASE, { waitUntil: 'networkidle2' });
  await mob.evaluate(() => localStorage.clear());
  await mob.reload({ waitUntil: 'networkidle2' });
  await mob.waitForSelector('#login-form', { timeout: 10000 });
  await wait(300);
  chk((await mob.evaluate(() => location.hash)) === '#/login', 'login form on fresh mobile page');
  await mob.type('input[name=username]', 'admin');
  await mob.type('input[name=password]', 'admin1234');
  await mob.click('#login-form button[type=submit]');
  await mob.waitForSelector('.sidebar', { timeout: 8000 });
  await wait(1000);
  await mob.evaluate(() => { location.hash = '#/pos'; });
  await mob.waitForSelector('.pos', { timeout: 8000 });
  await wait(1000);
  chk((await mob.evaluate(() => document.getElementById('mobile-bar') && getComputedStyle(document.getElementById('mobile-bar')).display)) !== 'none', 'mobile order bar visible');
  await mob.click('.p-tile');
  await wait(400);
  const cartAfterTile = await mob.$eval('#mb-count', el => el.textContent).catch(() => '');
  chk(cartAfterTile && cartAfterTile.includes('(1'), `tile click adds item on mobile (${cartAfterTile})`);
  await mob.click('#mobile-bar');
  await wait(600);
  const sheetOpen = await mob.$eval('#pos-order', el => el.classList.contains('open')).catch(() => false);
  chk(sheetOpen, 'order sheet opens on mobile');
  chk(await mob.$eval('.main', el => getComputedStyle(el).marginRight) === '0px', 'sidebar off-canvas on mobile');
  await mob.close();

  stage = 'menu';
  console.log('14) صفحة المنيو للعملاء');
  const menuPage = await browser.newPage();
  await menuPage.setViewport({ width: 414, height: 896 });
  await menuPage.goto(BASE + '/menu', { waitUntil: 'networkidle2' });
  await menuPage.waitForSelector('.m-grid', { timeout: 8000 });
  await wait(400);
  chk((await menuPage.$eval('#m-store', el => el.textContent || '').catch(() => '')) !== '', 'menu shows store name');
  chk(await menuPage.$$eval('.m-item', els => els.length) === 13, `menu cards for all products (${await menuPage.$$eval('.m-item', els => els.length)})`);
  chk(await menuPage.$$eval('.m-chip', els => els.length) >= 2, 'category chips rendered');
  await menuPage.type('#m-search', 'استربس');
  await wait(500);
  chk(await menuPage.$$eval('.m-item', els => els.length) === 1, 'search filters menu items');
  await menuPage.click('.m-chip[data-cat]:not([data-cat=""])');
  await wait(600);
  chk(await menuPage.$$eval('.m-sec', els => els.length) >= 1, 'category filter groups items');
  chk((await menuPage.$$('.m-foot')).length === 0 || (await menuPage.$eval('.m-foot', el => getComputedStyle(el).display)) === 'none', 'footer hidden when no phone/address');

  await menuPage.goto(BASE + '/menu', { waitUntil: 'networkidle2' });
  await menuPage.waitForSelector('.m-grid', { timeout: 8000 });
  chk(await menuPage.$eval('#wa-btn', el => el.disabled) === true, 'whatsapp button starts disabled');
  await menuPage.evaluate(() => document.querySelector('.m-add')?.click());
  await wait(300);
  chk(await menuPage.$eval('#wa-btn', el => !el.disabled), 'whatsapp button enables after add');
  chk((await menuPage.$eval('#wa-cart', el => el.textContent || '')).includes('الإجمالي'), 'cart total shown');
  await menuPage.evaluate(() => document.querySelector('.m-add')?.click());
  await wait(300);
  const cartTxt = await menuPage.$eval('#wa-cart', el => el.textContent || '');
  chk(cartTxt.includes('2 ×'), 'second add increments quantity');
  const waHref = await menuPage.evaluate(() => {
    const b = document.querySelector('#wa-btn');
    b.click();
    return b.onclick ? String(b.onclick) : '';
  });
  chk(waHref.includes('wa.me/'), 'whatsapp button opens wa.me link');
  chk(await menuPage.$eval('.m-logo', el => el.tagName === 'IMG' && /logo\.jpeg/.test(el.src)), 'menu shows logo image');
  const qrOk = await menuPage.$eval('#m-qr', el => el.complete && el.naturalWidth > 0 && /\/api\/qr/.test(el.src)).catch(() => false);
  chk(qrOk, 'menu shows share QR code');
  await menuPage.close();
} catch (e) {
  bad++;
  console.log(`  X خطأ في مرحلة [${stage}]: ${e.message}`);
}

const realErrors = [...new Set(errors.filter(e => !/fonts\.(googleapis|gstatic)/.test(e)))];
console.log('\n========================================');
console.log(`نجح: ${ok} | فشل: ${bad}`);
if (realErrors.length) {
  console.log('أخطاء المتصفح:');
  realErrors.forEach(e => console.log(' - ' + e));
  bad += realErrors.length;
} else {
  console.log('لا توجد أخطاء في المتصفح');
}
await browser.close();
server.kill();
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
process.exit(bad ? 1 : 0);
