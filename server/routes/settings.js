import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db, allSettings, setSetting, BACKUPS_DIR, ROOT_DIR, DB_PATH } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();
router.use(requireAuth);

router.get('/settings', (req, res) => res.json(allSettings()));

router.put('/settings', requireAdmin, (req, res) => {
  const allowed = ['store_name', 'store_phone', 'store_address', 'invoice_footer'];
  const body = req.body || {};
  for (const key of allowed) {
    if (key in body) setSetting(key, String(body[key] ?? ''));
  }
  res.json(allSettings());
});

// ---------- Backup ----------
function safeName(name) {
  return path.basename(String(name || ''));
}

function listBackups() {
  return fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const st = fs.statSync(path.join(BACKUPS_DIR, f));
      return { name: f, size: st.size, created_at: st.mtime.toISOString().slice(0, 19).replace('T', ' ') };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

router.get('/backup/list', requireAdmin, (req, res) => res.json(listBackups()));

router.post('/backup/create', requireAdmin, async (req, res) => {
  try {
    const name = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
    const dest = path.join(BACKUPS_DIR, name);
    await db.backup(dest);
    res.json({ ok: true, name, list: listBackups() });
  } catch (e) {
    res.status(500).json({ error: 'تعذر إنشاء النسخة الاحتياطية: ' + e.message });
  }
});

router.get('/backup/download/:file', requireAdmin, (req, res) => {
  const name = safeName(req.params.file);
  const file = path.join(BACKUPS_DIR, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'الملف غير موجود' });
  res.download(file, name);
});

router.delete('/backup/:file', requireAdmin, (req, res) => {
  const name = safeName(req.params.file);
  const file = path.join(BACKUPS_DIR, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'الملف غير موجود' });
  fs.unlinkSync(file);
  res.json({ ok: true, list: listBackups() });
});

router.post('/backup/restore', requireAdmin, (req, res) => {
  const name = safeName(req.body?.file);
  const file = path.join(BACKUPS_DIR, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'الملف غير موجود' });
  try {
    db.pragma('foreign_keys = OFF');
    const mainTables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all().map(r => r.name);

    db.prepare('ATTACH DATABASE ? AS restore_src').run(file);
    const srcTables = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name)
    );

    const missing = mainTables.filter(t => !srcTables.has(t));
    if (missing.length) {
      db.exec('DETACH DATABASE restore_src');
      return res.status(400).json({ error: 'النسخة الاحتياطية لا تطابق بنية النظام الحالية' });
    }

    const restore = db.transaction(() => {
      for (const t of mainTables) db.prepare(`DELETE FROM main."${t}"`).run();
      for (const t of mainTables) {
        const cols = db.prepare(`PRAGMA main.table_info("${t}")`).all().map(c => c.name);
        const colList = cols.map(c => `"${c}"`).join(', ');
        db.prepare(`INSERT INTO main."${t}" (${colList}) SELECT ${colList} FROM restore_src."${t}"`).run();
      }
    });
    restore();
    db.exec('DETACH DATABASE restore_src');
    db.pragma('foreign_keys = ON');
    res.json({ ok: true, message: 'تمت الاستعادة بنجاح' });
  } catch (e) {
    try { db.exec('DETACH DATABASE restore_src'); } catch (_) {}
    db.pragma('foreign_keys = ON');
    res.status(400).json({ error: 'تعذر الاستعادة: ' + e.message });
  }
});

// ---------- Export ----------
const EXPORT_TABLES = [
  'users', 'settings', 'suppliers', 'categories', 'products', 'ingredients',
  'recipe_items', 'sales', 'sale_items', 'payments', 'purchases', 'purchase_items',
  'expenses', 'inventory_transactions',
];

router.get('/export', requireAdmin, (req, res) => {
  const data = { exported_at: new Date().toISOString(), db: path.basename(DB_PATH), tables: {} };
  for (const t of EXPORT_TABLES) {
    try { data.tables[t] = db.prepare(`SELECT * FROM "${t}"`).all(); } catch (_) { data.tables[t] = []; }
  }
  const name = `export-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.json(data);
});

export default router;
