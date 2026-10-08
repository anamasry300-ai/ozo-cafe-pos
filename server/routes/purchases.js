import { Router } from 'express';
import { db, round } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { ingredientStockDelta } from '../calc.js';

const router = Router();
router.use(requireAuth);

function nextInvoiceNo() {
  const max = db.prepare('SELECT COALESCE(MAX(id), 0) m FROM purchases').get().m;
  return 'PUR-' + String(max + 1).padStart(5, '0');
}

router.get('/purchases', requireAdmin, (req, res) => {
  const where = [];
  const params = [];
  if (req.query.from) { where.push('p.date >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('p.date <= ?'); params.push(req.query.to); }
  if (req.query.q) {
    where.push('(p.invoice_no LIKE ? OR s.name LIKE ? OR p.notes LIKE ?)');
    params.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`);
  }
  const sql = `
    SELECT p.*, s.name AS supplier_name, u.username,
      (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS items_count
    FROM purchases p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    LEFT JOIN users u ON u.id = p.user_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.id DESC LIMIT 500
  `;
  const rows = db.prepare(sql).all(...params);
  const total = rows.reduce((sum, r) => sum + r.total, 0);
  res.json({ rows, total: round(total) });
});

router.get('/purchases/:id', requireAdmin, (req, res) => {
  const p = db.prepare(`
    SELECT p.*, s.name AS supplier_name, u.username
    FROM purchases p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'فاتورة الشراء غير موجودة' });
  const items = db.prepare(`
    SELECT pi.*, i.name AS ingredient_name, i.unit
    FROM purchase_items pi
    JOIN ingredients i ON i.id = pi.ingredient_id
    WHERE pi.purchase_id = ?
  `).all(p.id);
  res.json({ ...p, items });
});

router.post('/purchases', requireAdmin, (req, res) => {
  const { supplier_id, date, notes, items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'أضف مكوّن واحدًا على الأقل' });
  if (!date) return res.status(400).json({ error: 'التاريخ مطلوب' });

  const clean = [];
  for (const it of items) {
    const ingId = Number(it.ingredient_id);
    const qty = Number(it.quantity);
    const price = Number(it.unit_price);
    if (!ingId) return res.status(400).json({ error: 'اختر المادة الخام' });
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'الكمية يجب أن تكون أكبر من صفر' });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'سعر الشراء غير صحيح' });
    if (!db.prepare('SELECT id FROM ingredients WHERE id = ?').get(ingId)) return res.status(400).json({ error: 'إحدى المواد الخام غير موجودة' });
    clean.push({ ingId, qty: round(qty), price: round(price), lineTotal: round(qty * price) });
  }

  try {
    const run = db.transaction(() => {
      const total = round(clean.reduce((s, r) => s + r.lineTotal, 0));
      const info = db.prepare(`
        INSERT INTO purchases (invoice_no, supplier_id, date, total, notes, user_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(nextInvoiceNo(), supplier_id ? Number(supplier_id) : null, date, total, String(notes || ''), req.user.id);
      const purchaseId = info.lastInsertRowid;

      const insItem = db.prepare(`
        INSERT INTO purchase_items (purchase_id, ingredient_id, quantity, unit_price, line_total)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const r of clean) {
        insItem.run(purchaseId, r.ingId, r.qty, r.price, r.lineTotal);
        ingredientStockDelta(r.ingId, r.qty, 'purchase', {
          refType: 'purchase', refId: purchaseId, notes: `فاتورة شراء ${'PUR-' + String(purchaseId).padStart(5, '0')}`, userId: req.user.id,
        });
        db.prepare('UPDATE ingredients SET purchase_price = ?, last_purchase_at = ? WHERE id = ?')
          .run(r.price, date, r.ingId);
      }
      return purchaseId;
    });
    const id = run();
    res.json(db.prepare('SELECT * FROM purchases WHERE id = ?').get(id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/purchases/:id', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM purchases WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'فاتورة الشراء غير موجودة' });
  const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(p.id);
  try {
    const run = db.transaction(() => {
      for (const it of items) {
        ingredientStockDelta(it.ingredient_id, -it.quantity, 'adjust', {
          refType: 'purchase_delete', refId: p.id, notes: `إلغاء فاتورة شراء ${p.invoice_no}`, userId: req.user.id,
        });
      }
      db.prepare('DELETE FROM purchases WHERE id = ?').run(p.id);
    });
    run();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
