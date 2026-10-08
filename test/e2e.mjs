import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-test-'));
process.env.POS_DB_PATH = path.join(TMP, 'test.db');
process.env.NODE_ENV = 'test';
process.env.PORT = '3999';

const { default: app } = await import('../server/index.js');
const server = app.listen(3999);
const BASE = 'http://localhost:3999/api';

let passed = 0, failed = 0;
const failures = [];

function ok(cond, msg) {
  if (cond) { passed++; }
  else { failed++; failures.push(msg); console.error('  ✗ ' + msg); }
}

async function req(method, url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

const eq = (a, b) => Math.abs(a - b) < 0.005;

console.log('1) إنشاء النظام والمستخدمين');
let r = await req('GET', '/setup/status');
ok(r.data?.needsSetup === true, 'needsSetup should be true initially');
r = await req('POST', '/setup', { username: 'admin', password: 'admin1234', full_name: 'المدير' });
ok(r.status === 200 && r.data.token, 'setup creates admin');
const admin = r.data.token;
r = await req('POST', '/setup', { username: 'x', password: '1234' });
ok(r.status === 400, 'setup blocked when users exist');
r = await req('POST', '/login', { username: 'admin', password: 'wrong' });
ok(r.status === 401, 'wrong password rejected');
r = await req('POST', '/login', { username: 'admin', password: 'admin1234' });
ok(r.status === 200 && r.data.token, 'admin login works');
r = await req('GET', '/products', null, 'badtoken');
ok(r.status === 401, 'invalid token rejected');

console.log('2) الأصناف الافتراضية');
r = await req('GET', '/products', null, admin);
ok(r.status === 200 && r.data.length === 13, `13 seeded products (got ${r.data?.length})`);
const expected = { 'بطاطس عادي': 30, 'بطاطس موتزاريلا صوصات': 40, 'بطاطس مكس جبن تركي مدخن': 50, 'بطاطس مكس جبن بسطرمة': 60, 'بطاطس استربس': 65, 'بطاطس زنجر': 70, 'بطاطس شيش': 70, 'بطاطس سجق': 60, 'بطاطس كفتة': 65, 'بطاطس كبدة': 60, 'بطاطس هوت دوج': 55, 'بطاطس كوردن بلو': 60, 'بطاطس فاهيتا': 70 };
for (const [name, price] of Object.entries(expected)) {
  const p = r.data.find(x => x.name === name);
  ok(p && eq(p.price, price), `product "${name}" price ${price}`);
}

console.log('3) المستخدمون والصلاحيات');
r = await req('POST', '/users', { username: 'cashier1', password: 'cash1234', role: 'cashier', full_name: 'كاشير' }, admin);
ok(r.status === 200, 'admin creates cashier');
r = await req('POST', '/login', { username: 'cashier1', password: 'cash1234' });
const cashier = r.data.token;
r = await req('GET', '/reports/profits', null, cashier);
ok(r.status === 403, 'cashier blocked from profit reports');
r = await req('POST', '/products', { name: 'x', price: 1 }, cashier);
ok(r.status === 403, 'cashier cannot create products');
r = await req('GET', '/expenses', null, cashier);
ok(r.status === 403, 'cashier blocked from expenses');
r = await req('POST', '/sales', { items: [{ product_id: 1, quantity: 1 }] }, cashier);
ok(r.status === 200, 'cashier can create sales');
const cashierSale = r.data;
r = await req('POST', `/sales/${cashierSale.id}/cancel`, {}, admin);
ok(r.status === 200, 'admin can cancel any sale');
r = await req('POST', `/sales/${cashierSale.id}/cancel`, {}, cashier);
ok(r.status === 403, 'cashier cannot cancel sales');
r = await req('GET', '/users', null, admin);
ok(r.data.length === 2, 'two users exist');
r = await req('DELETE', `/users/${r.data.find(u => u.username === 'admin').id}`, null, admin);
ok(r.status === 400, 'admin cannot delete self');

console.log('4) المواد الخام والموردين');
r = await req('POST', '/suppliers', { name: 'مورد البطاطس', phone: '0100' }, admin);
ok(r.status === 200, 'create supplier');
const supplierId = r.data.id;
const ingDefs = [
  { name: 'بطاطس', unit: 'جم', purchase_price: 0.04, quantity: 1000, min_stock: 500 },
  { name: 'استربس', unit: 'جم', purchase_price: 0.06, quantity: 800, min_stock: 300 },
  { name: 'صوص', unit: 'مل', purchase_price: 0.2, quantity: 500, min_stock: 200 },
  { name: 'عبوة', unit: 'قطعة', purchase_price: 2, quantity: 200, min_stock: 50 },
];
const ings = {};
for (const d of ingDefs) {
  r = await req('POST', '/ingredients', { ...d, supplier_id: supplierId }, admin);
  ok(r.status === 200 && eq(r.data.quantity, d.quantity), `ingredient ${d.name} created with opening qty`);
  ings[d.name] = r.data;
}
r = await req('GET', '/inventory/transactions', null, admin);
ok(r.data.length === 4, 'opening stock creates 4 inventory transactions');
r = await req('POST', '/ingredients', { name: '', purchase_price: 1 }, admin);
ok(r.status === 400, 'ingredient name required');

console.log('5) الوصفات والتكلفة');
const strips = (await req('GET', '/products?q=استربس', null, admin)).data[0];
r = await req('PUT', `/products/${strips.id}/recipe`, {
  items: [
    { ingredient_id: ings['بطاطس'].id, quantity: 100 },
    { ingredient_id: ings['استربس'].id, quantity: 80 },
    { ingredient_id: ings['صوص'].id, quantity: 30 },
    { ingredient_id: ings['عبوة'].id, quantity: 1 },
  ],
}, admin);
ok(r.status === 200, 'recipe saved');
const initialCost = 100 * 0.04 + 80 * 0.06 + 30 * 0.2 + 1 * 2; // 16.8
ok(eq(r.data.cost, initialCost), `recipe cost = ${initialCost} (got ${r.data.cost})`);
r = await req('GET', `/products/${strips.id}`, null, admin);
ok(eq(r.data.cost, initialCost), 'product cost computed from recipe');
ok(eq(r.data.margin, 65 - initialCost), 'product margin computed');
r = await req('PUT', `/products/${strips.id}/recipe`, { items: [{ ingredient_id: ings['بطاطس'].id, quantity: 0 }] }, admin);
ok(r.status === 400, 'recipe quantity must be > 0');

console.log('6) المشتريات وتحديث المخزون');
r = await req('POST', '/purchases', {
  supplier_id: supplierId, date: '2026-01-05', notes: 'شحنة',
  items: [
    { ingredient_id: ings['بطاطس'].id, quantity: 500, unit_price: 0.05 },
    { ingredient_id: ings['عبوة'].id, quantity: 100, unit_price: 2.5 },
  ],
}, admin);
ok(r.status === 200, 'purchase invoice created');
ok(eq(r.data.total, 500 * 0.05 + 100 * 2.5), 'purchase total computed');
r = await req('GET', `/ingredients`, null, admin);
const potato = r.data.find(i => i.id === ings['بطاطس'].id);
const box = r.data.find(i => i.id === ings['عبوة'].id);
ok(eq(potato.quantity, 1500), `purchase increased stock to 1500 (got ${potato.quantity})`);
ok(eq(potato.purchase_price, 0.05), 'purchase updated unit price');
ok(eq(box.quantity, 300), 'boxes stock = 300');
const expectedCost = 100 * 0.05 + 80 * 0.06 + 30 * 0.2 + 1 * 2.5; // 18.3 بعد تحديث أسعار الشراء

console.log('7) البيع وخصم المخزون');
const before = {};
for (const n of ['بطاطس', 'استربس', 'صوص', 'عبوة']) before[n] = (await req('GET', '/ingredients', null, admin)).data.find(i => i.id === ings[n].id).quantity;
r = await req('POST', '/sales', {
  items: [
    { product_id: strips.id, quantity: 2, note: 'بدون حار' },
    { product_id: 1, quantity: 1 },
  ],
  discount: 5, extra_fees: 0, payment_method: 'cash', notes: 'طلب طاولة 3',
}, admin);
ok(r.status === 200, 'sale created');
const sale = r.data;
ok(sale.invoice_no === 'INV-000002', `invoice number sequential (got ${sale.invoice_no})`);
ok(eq(sale.subtotal, 2 * 65 + 30), 'subtotal = 160');
ok(eq(sale.total, 155), 'total after discount = 155');
ok(eq(sale.cost_total, 2 * expectedCost), 'cost total from recipe (plain fries have no recipe = 0)');
const after = {};
for (const n of ['بطاطس', 'استربس', 'صوص', 'عبوة']) after[n] = (await req('GET', '/ingredients', null, admin)).data.find(i => i.id === ings[n].id).quantity;
ok(eq(after['بطاطس'], before['بطاطس'] - 200), `potato deducted by 200 (${before['بطاطس']} -> ${after['بطاطس']})`);
ok(eq(after['استربس'], before['استربس'] - 160), 'strips deducted by 160');
ok(eq(after['صوص'], before['صوص'] - 60), 'sauce deducted by 60');
ok(eq(after['عبوة'], before['عبوة'] - 2), 'boxes deducted by 2');
r = await req('GET', `/sales/${sale.id}`, null, admin);
ok(r.data.items.length === 2 && r.data.items[0].note === 'بدون حار', 'sale items stored with notes');

console.log('8) رفض البيع عند نقص المخزون + التراجع');
const potatoNow = (await req('GET', '/ingredients', null, admin)).data.find(i => i.id === ings['بطاطس'].id).quantity;
r = await req('POST', '/sales', { items: [{ product_id: strips.id, quantity: 9999 }] }, admin);
ok(r.status === 400, 'out of stock sale rejected');
const potatoAfterFail = (await req('GET', '/ingredients', null, admin)).data.find(i => i.id === ings['بطاطس'].id).quantity;
ok(eq(potatoAfterFail, potatoNow), 'stock unchanged after failed sale');
r = await req('GET', '/sales', null, admin);
ok(r.data.filter(s => s.status === 'completed').length === 1, 'only one completed sale exists');

console.log('9) الإلغاء والاسترجاع');
r = await req('POST', '/sales', { items: [{ product_id: strips.id, quantity: 1 }], payment_method: 'card' }, admin);
const sale2 = r.data;
const p2 = (await req('GET', '/ingredients', null, admin)).data.find(i => i.id === ings['بطاطس'].id).quantity;
ok(eq(p2, potatoAfterFail - 100), 'sale2 deducted potato');
r = await req('POST', `/sales/${sale2.id}/cancel`, {}, admin);
ok(r.status === 200 && r.data.status === 'cancelled', 'sale2 cancelled');
const p3 = (await req('GET', '/ingredients', null, admin)).data.find(i => i.id === ings['بطاطس'].id).quantity;
ok(eq(p3, potatoAfterFail), 'cancel restored stock exactly');
r = await req('POST', '/sales', { items: [{ product_id: strips.id, quantity: 1 }], payment_method: 'transfer' }, admin);
const sale3 = r.data;
r = await req('POST', `/sales/${sale3.id}/refund`, {}, admin);
ok(r.status === 200 && r.data.status === 'refunded', 'sale3 refunded');
const p4 = (await req('GET', '/ingredients', null, admin)).data.find(i => i.id === ings['بطاطس'].id).quantity;
ok(eq(p4, potatoAfterFail), 'refund restored stock');
r = await req('POST', `/sales/${sale3.id}/refund`, {}, admin);
ok(r.status === 400, 'cannot refund twice');

console.log('10) المصروفات');
r = await req('POST', '/expenses', { type: 'كهرباء', amount: 250, date: '2026-01-06', notes: 'فاتورة يناير' }, admin);
ok(r.status === 200, 'expense created');
r = await req('POST', '/expenses', { type: 'إيجار', amount: 3000, date: '2026-01-06' }, admin);
ok(r.status === 200, 'expense created 2');
r = await req('POST', '/expenses', { type: 'x', amount: -5, date: '2026-01-06' }, admin);
ok(r.status === 400, 'negative expense rejected');
r = await req('GET', '/expenses?from=2026-01-01&to=2026-01-31', null, admin);
ok(r.data.total === 3250, `expenses total 3250 (got ${r.data.total})`);

console.log('11) التقارير');
const from = '2000-01-01', to = '2100-01-01';
r = await req('GET', `/reports/daily-sales?from=${from}&to=${to}`, null, admin);
ok(r.status === 200 && r.data.totals.invoices === 1, 'daily-sales: 1 completed invoice in range');
ok(eq(r.data.totals.net, 155), 'daily-sales net = 155');
ok(eq(r.data.totals.discounts, 5), 'daily-sales discounts = 5');
r = await req('GET', `/reports/weekly-sales?from=${from}&to=${to}`, null, admin);
ok(r.status === 200, 'weekly-sales works');
r = await req('GET', `/reports/monthly-sales?from=${from}&to=${to}`, null, admin);
ok(r.status === 200 && r.data.totals.net > 0, 'monthly-sales works');
r = await req('GET', `/reports/by-product?from=${from}&to=${to}`, null, admin);
const byStrips = r.data.rows.find(x => x.product_name.includes('استربس'));
ok(byStrips && byStrips.quantity === 2, 'by-product shows 2 strips sold');
r = await req('GET', `/reports/top-products?from=${from}&to=${to}`, null, admin);
ok(r.data.rows.length > 0, 'top-products returns rows');
r = await req('GET', `/reports/purchases?from=${from}&to=${to}`, null, admin);
ok(eq(r.data.totals.total, 275), 'purchases report total = 275');
r = await req('GET', `/reports/expenses?from=${from}&to=${to}`, null, admin);
ok(eq(r.data.totals.total, 3250), 'expenses report total = 3250');
ok(r.data.by_type.length === 2, 'expenses grouped by type');
r = await req('GET', `/reports/inventory?from=${from}&to=${to}`, null, admin);
ok(r.data.totals.items === 4, 'inventory report lists 4 ingredients');
r = await req('GET', `/reports/product-costs?from=${from}&to=${to}`, null, admin);
const pc = r.data.rows.find(x => x.id === strips.id);
ok(pc && eq(pc.cost, expectedCost) && pc.recipe.length === 4, 'product-costs shows recipe and cost');
r = await req('GET', `/reports/profits?from=${from}&to=${to}`, null, admin);
const t = r.data.totals;
ok(eq(t.net_sales, 155), `profits: net_sales 155 (got ${t.net_sales})`);
ok(eq(t.cogs, 2 * expectedCost), 'profits: cogs correct');
ok(eq(t.expenses, 3250), 'profits: expenses included');
ok(eq(t.net_profit, 155 - 2 * expectedCost - 3250), `profits: net profit formula (got ${t.net_profit})`);
r = await req('GET', `/reports/payment-methods?from=${from}&to=${to}`, null, admin);
const cashRow = r.data.rows.find(x => x.method === 'cash');
ok(cashRow && eq(cashRow.amount, 155), 'payment methods: cash 155');
r = await req('GET', `/reports/invoices?from=${from}&to=${to}`, null, admin);
ok(r.data.rows.length === 4, `invoices report shows all 4 invoices (got ${r.data.rows.length})`);
r = await req('GET', '/reports/profits', null, admin);
ok(r.status === 200, 'reports without dates default to all time');
r = await req('GET', '/reports/nope', null, admin);
ok(r.status === 404, 'unknown report 404');

console.log('12) الداشبورد');
r = await req('GET', '/dashboard', null, admin);
ok(r.status === 200, 'dashboard loads');
ok(r.data.settings.store_name, 'dashboard includes settings');
ok(Array.isArray(r.data.low_stock), 'low stock list present');
ok(r.data.summary.daily.length >= 1, 'daily summary present');
const dashDate = r.data.date;
r = await req('POST', '/expenses', { type: 'صيانة', amount: 100, date: dashDate }, admin);
r = await req('GET', '/dashboard', null, admin);
const todayInfo = r.data.today;
ok(eq(todayInfo.expenses, 100), `today expenses = 100 (got ${todayInfo.expenses})`);
ok(todayInfo.invoices >= 1, 'today invoices counted');

console.log('13) المنتجات CRUD');
r = await req('POST', '/products', { name: 'منتج جديد', category_id: 1, price: 45, manual_cost: 20, description: 'وصف' }, admin);
ok(r.status === 200 && eq(r.data.cost, 20) && eq(r.data.margin, 25), 'product created with manual cost');
const newId = r.data.id;
r = await req('PUT', `/products/${newId}`, { price: 55 }, admin);
ok(eq(r.data.price, 55), 'price updated');
r = await req('PATCH', `/products/${newId}/toggle`, {}, admin);
ok(r.data.active === false, 'product deactivated');
r = await req('GET', '/pos/products', null, cashier);
ok(!r.data.find(p => p.id === newId), 'inactive product hidden from POS');
r = await req('PATCH', `/products/${newId}/toggle`, {}, admin);
r = await req('DELETE', `/products/${newId}`, null, admin);
ok(r.status === 200, 'product deleted');
r = await req('DELETE', `/products/${strips.id}`, null, admin);
ok(r.status === 400, 'product used in invoices cannot be deleted');

console.log('14) تعديل السعر ينعكس على المبيعات');
r = await req('PUT', `/products/1`, { price: 35 }, admin);
ok(eq(r.data.price, 35), 'price change saved');
r = await req('GET', '/products', null, admin);
ok(eq(r.data.find(p => p.id === 1).price, 35), 'price visible in list');
r = await req('PUT', `/products/1`, { price: 30 }, admin);

console.log('15) النسخ الاحتياطي والاستعادة');
r = await req('POST', '/backup/create', {}, admin);
ok(r.status === 200 && r.data.name, 'backup created');
const backupName = r.data.name;
r = await req('POST', '/expenses', { type: 'أخرى', amount: 999, date: '2026-02-01' }, admin);
ok(r.status === 200, 'expense after backup');
r = await req('POST', '/backup/restore', { file: backupName }, admin);
ok(r.status === 200, 'restore succeeded');
r = await req('GET', '/expenses?from=2026-02-01&to=2026-02-01', null, admin);
ok(r.data.rows.length === 0, 'post-backup expense gone after restore');
r = await req('GET', '/products', null, admin);
ok(r.data.length === 13 || r.data.length === 14, 'products intact after restore');
r = await req('POST', '/login', { username: 'admin', password: 'admin1234' });
ok(r.status === 200, 'login still works after restore');
const admin2 = r.data.token;
r = await req('GET', '/backup/list', null, admin2);
ok(r.data.some(b => b.name === backupName), 'backup listed');
r = await req('POST', '/backup/restore', { file: '../../evil.db' }, admin2);
ok(r.status === 404, 'path traversal blocked');

console.log('16) التصدير والإعدادات');
r = await req('GET', '/export', null, admin2);
ok(r.status === 200 && r.data.tables.products.length >= 13, 'export contains data');
r = await req('PUT', '/settings', { store_name: 'كافيه الأصيل', store_phone: '0123' }, admin2);
ok(r.data.store_name === 'كافيه الأصيل', 'settings updated');
r = await req('PUT', '/settings', { store_name: 'x' }, cashier);
ok(r.status === 403, 'cashier cannot change settings');
r = await req('GET', '/settings', null, cashier);
ok(r.status === 200 && r.data.store_name === 'كافيه الأصيل', 'cashier can read settings for receipt');

console.log('17) البحث');
r = await req('GET', '/products?q=زنجر', null, admin2);
ok(r.data.length === 1 && r.data[0].name === 'بطاطس زنجر', 'product search');
r = await req('GET', `/sales?q=${sale.invoice_no}`, null, admin2);
ok(r.data.length >= 1, 'invoice search by number');
r = await req('GET', '/sales?q=استربس', null, admin2);
ok(r.data.length >= 1, 'invoice search by product name');

console.log('\n18) المنيو والـ QR');
r = await req('GET', '/menu');
ok(r.status === 200 && r.data.store.name === 'كافيه الأصيل', `menu store name (${r.data?.store?.name})`);
ok(Array.isArray(r.data?.categories) && r.data.categories.length >= 1, 'menu has categories');
const menuProducts = r.data?.categories?.flatMap(c => c.products) || [];
ok(menuProducts.length === 13, `menu lists all active products (${menuProducts.length})`);
ok(menuProducts.every(p => p.price > 0 && typeof p.name === 'string'), 'menu products have name & price');
ok(menuProducts.every(p => !('id' in p && p.id === undefined)), 'menu products well-formed');
const qrRes = await fetch(BASE + '/qr?data=' + encodeURIComponent('http://192.168.1.5:3000/menu'));
ok(qrRes.status === 200 && (qrRes.headers.get('content-type') || '').includes('image/svg+xml'), 'qr returns SVG');
const qrText = await qrRes.text();
ok(qrText.trim().startsWith('<svg'), 'qr svg content');
r = await req('GET', '/qr');
ok(r.status === 400, 'qr without data rejected');
const menuPage = await fetch('http://localhost:3999/menu');
ok(menuPage.status === 200 && (await menuPage.text()).includes('المنيو'), '/menu page served');
const menuUrlRes = await req('GET', '/menu-url');
ok(Array.isArray(menuUrlRes.data?.urls) && menuUrlRes.data.urls.length >= 1, 'menu-url list provided');

console.log('\n========================================');
console.log(`نجح: ${passed} | فشل: ${failed}`);
if (failed) {
  console.log('الأخطاء:');
  failures.forEach(f => console.log(' - ' + f));
}
server.close();
process.exit(failed ? 1 : 0);
