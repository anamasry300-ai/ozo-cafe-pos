import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.join(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const BACKUPS_DIR = path.join(ROOT_DIR, 'backups');
export const DB_PATH = process.env.POS_DB_PATH || path.join(DATA_DIR, 'cafe.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(BACKUPS_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','cashier')),
  full_name TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  price REAL NOT NULL DEFAULT 0,
  manual_cost REAL NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'جم',
  purchase_price REAL NOT NULL DEFAULT 0,
  quantity REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 0,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  last_purchase_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS recipe_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity REAL NOT NULL,
  UNIQUE (product_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  extra_fees REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  cost_total REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','cancelled','refunded')),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  quantity REAL NOT NULL,
  cost REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  amount REAL NOT NULL,
  paid_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL UNIQUE,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('purchase','sale','adjust','cancel','refund','create')),
  delta REAL NOT NULL,
  quantity_after REAL NOT NULL,
  ref_type TEXT,
  ref_id INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);
CREATE INDEX IF NOT EXISTS idx_invtx_ingredient ON inventory_transactions(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_recipe_product ON recipe_items(product_id);
`;

const SEED_PRODUCTS = [
  ['بطاطس عادي', 30],
  ['بطاطس موتزاريلا صوصات', 40],
  ['بطاطس مكس جبن تركي مدخن', 50],
  ['بطاطس مكس جبن بسطرمة', 60],
  ['بطاطس استربس', 65],
  ['بطاطس زنجر', 70],
  ['بطاطس شيش', 70],
  ['بطاطس سجق', 60],
  ['بطاطس كفتة', 65],
  ['بطاطس كبدة', 60],
  ['بطاطس هوت دوج', 55],
  ['بطاطس كوردن بلو', 60],
  ['بطاطس فاهيتا', 70],
];

const DEFAULT_SETTINGS = {
  store_name: 'أوزو OZO',
  store_phone: '',
  store_address: '',
  invoice_footer: 'شكرًا لزيارتكم',
  currency: 'EGP',
};

export function initDb() {
  db.exec(SCHEMA);

  const catCount = db.prepare('SELECT COUNT(*) c FROM categories').get().c;
  if (catCount === 0) {
    const insCat = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)');
    insCat.run('بطاطس', 1);
  }

  const prodCount = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  if (prodCount === 0) {
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get('بطاطس');
    const ins = db.prepare('INSERT INTO products (name, category_id, price) VALUES (?, ?, ?)');
    for (const [name, price] of SEED_PRODUCTS) ins.run(name, cat ? cat.id : null, price);
  }

  const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insSetting.run(k, v);
}

export function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value ?? ''));
}

export function allSettings() {
  const out = {};
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}

export function round(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
