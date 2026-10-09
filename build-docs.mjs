import fs from 'node:fs';
import Database from 'better-sqlite3';

fs.mkdirSync('docs/js', { recursive: true });
fs.copyFileSync('public/menu.html', 'docs/index.html');
fs.copyFileSync('public/menu.css', 'docs/menu.css');
fs.copyFileSync('public/logo.jpeg', 'docs/logo.jpeg');
if (fs.existsSync('public/js/ui.js')) fs.copyFileSync('public/js/ui.js', 'docs/js/ui.js');

fs.rmSync('docs/images', { recursive: true, force: true });
if (fs.existsSync('public/images')) {
  fs.mkdirSync('docs/images', { recursive: true });
  for (const f of fs.readdirSync('public/images')) {
    const src = 'public/images/' + f;
    if (fs.statSync(src).isFile()) fs.copyFileSync(src, 'docs/images/' + f);
  }
}

let js = fs.readFileSync('public/menu.js', 'utf8')
  .replace("fetch('/api/menu')", "fetch('menu.json')")
  .replace("qrImg.src = '/api/qr?data=' + encodeURIComponent(location.href);", "qrImg.src = 'qr.svg';");
fs.writeFileSync('docs/menu.js', js);

const db = new Database('data/cafe.db', { readonly: true });
const rows = db.prepare(`SELECT c.id cid,c.name cname,c.sort_order,p.id pid,p.name pname,p.price,p.image,p.description FROM categories c JOIN products p ON p.category_id=c.id WHERE p.active=1 AND c.active=1 ORDER BY c.sort_order,c.name,p.id`).all();
const s = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value]));
const cats = {};
for (const r of rows) {
  if (!cats[r.cid]) cats[r.cid] = { id: r.cid, name: r.cname, products: [] };
  cats[r.cid].products.push({ id: r.pid, name: r.pname, price: Number(r.price), image: r.image || '', description: r.description || '' });
}
fs.writeFileSync('docs/menu.json', JSON.stringify({
  store: { name: s.store_name || 'أوزو OZO', phone: s.store_phone || '', address: s.store_address || '' },
  categories: Object.values(cats),
}, null, 2));
db.close();
console.log('docs built from data/cafe.db');
