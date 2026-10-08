import { Router } from 'express';
import { db, round } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { ingredientStockDelta } from '../calc.js';

const router = Router();
router.use(requireAuth);

// ---------- Suppliers ----------
router.get('/suppliers', (req, res) => {
  res.json(db.prepare('SELECT * FROM suppliers ORDER BY name').all());
});

router.post('/suppliers', requireAdmin, (req, res) => {
  const { name, phone, notes } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم المورد مطلوب' });
  const info = db.prepare('INSERT INTO suppliers (name, phone, notes) VALUES (?, ?, ?)')
    .run(String(name).trim(), String(phone || ''), String(notes || ''));
  res.json(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/suppliers/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'المورد غير موجود' });
  const { name, phone, notes } = { ...row, ...(req.body || {}) };
  if (!String(name).trim()) return res.status(400).json({ error: 'اسم المورد مطلوب' });
  db.prepare('UPDATE suppliers SET name = ?, phone = ?, notes = ? WHERE id = ?')
    .run(String(name).trim(), String(phone || ''), String(notes || ''), row.id);
  res.json(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(row.id));
});

router.delete('/suppliers/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'المورد غير موجود' });
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// ---------- Ingredients (raw materials) ----------
function ingredientView(r) {
  return {
    ...r,
    active: !!r.active,
    supplier_name: r.supplier_name || null,
    value: round(r.quantity * r.purchase_price),
    low_stock: r.quantity <= r.min_stock,
    stock_cost: round(r.quantity * r.purchase_price),
  };
}

const INGREDIENT_SELECT = `
SELECT i.*, s.name AS supplier_name
FROM ingredients i
LEFT JOIN suppliers s ON s.id = i.supplier_id
`;

router.get('/ingredients', (req, res) => {
  const where = [];
  const params = [];
  if (req.query.q) { where.push('i.name LIKE ?'); params.push(`%${req.query.q}%`); }
  if (req.query.active_only === '1') where.push('i.active = 1');
  if (req.query.low_stock === '1') where.push('i.quantity <= i.min_stock');
  const sql = INGREDIENT_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY i.name';
  res.json(db.prepare(sql).all(...params).map(ingredientView));
});

router.post('/ingredients', requireAdmin, (req, res) => {
  const { name, unit, purchase_price, quantity, min_stock, supplier_id } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم المادة الخام مطلوب' });
  const price = Number(purchase_price);
  const qty = Number(quantity);
  const min = Number(min_stock);
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'سعر الشراء غير صحيح' });
  if (!Number.isFinite(qty) || qty < 0) return res.status(400).json({ error: 'الكمية غير صحيحة' });
  if (!Number.isFinite(min) || min < 0) return res.status(400).json({ error: 'الحد الأدنى غير صحيح' });

  const run = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO ingredients (name, unit, purchase_price, quantity, min_stock, supplier_id)
      VALUES (?, ?, ?, 0, ?, ?)
    `).run(String(name).trim(), String(unit || 'جم'), round(price), round(min), supplier_id ? Number(supplier_id) : null);
    if (round(qty) !== 0) {
      ingredientStockDelta(info.lastInsertRowid, qty, 'create', { notes: 'رصيد افتتاحي', refType: 'create' });
    }
    return info.lastInsertRowid;
  });
  const id = run();
  res.json(ingredientView(db.prepare(INGREDIENT_SELECT + ' WHERE i.id = ?').get(id)));
});

router.put('/ingredients/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'المادة غير موجودة' });
  const body = { ...row, ...(req.body || {}) };
  const price = Number(body.purchase_price);
  const min = Number(body.min_stock);
  if (!String(body.name || '').trim()) return res.status(400).json({ error: 'اسم المادة الخام مطلوب' });
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'سعر الشراء غير صحيح' });
  if (!Number.isFinite(min) || min < 0) return res.status(400).json({ error: 'الحد الأدنى غير صحيح' });
  db.prepare(`
    UPDATE ingredients SET name = ?, unit = ?, purchase_price = ?, min_stock = ?, supplier_id = ?, active = ?
    WHERE id = ?
  `).run(
    String(body.name).trim(),
    String(body.unit || 'جم'),
    round(price),
    round(min),
    body.supplier_id ? Number(body.supplier_id) : null,
    body.active === false ? 0 : body.active === true ? 1 : row.active,
    row.id
  );
  res.json(ingredientView(db.prepare(INGREDIENT_SELECT + ' WHERE i.id = ?').get(row.id)));
});

router.delete('/ingredients/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'المادة غير موجودة' });
  const inRecipe = db.prepare('SELECT COUNT(*) c FROM recipe_items WHERE ingredient_id = ?').get(row.id).c;
  const inPurchase = db.prepare('SELECT COUNT(*) c FROM purchase_items WHERE ingredient_id = ?').get(row.id).c;
  const moves = db.prepare(`SELECT COUNT(*) c FROM inventory_transactions WHERE ingredient_id = ? AND type != 'create'`).get(row.id).c;
  if (inRecipe || inPurchase || moves) {
    return res.status(400).json({ error: 'المادة مستخدمة في وصفات أو فواتير شراء أو حركات مخزون، يمكنك إيقافها بدل حذفها' });
  }
  const run = db.transaction(() => {
    db.prepare('DELETE FROM inventory_transactions WHERE ingredient_id = ? AND type = ?').run(row.id, 'create');
    db.prepare('DELETE FROM recipe_items WHERE ingredient_id = ?').run(row.id);
    db.prepare('DELETE FROM ingredients WHERE id = ?').run(row.id);
  });
  run();
  res.json({ ok: true });
});

// ---------- Inventory adjustments ----------
router.post('/inventory/adjust', requireAdmin, (req, res) => {
  const { ingredient_id, delta, notes } = req.body || {};
  const qty = Number(delta);
  if (!ingredient_id || !Number.isFinite(qty) || qty === 0) {
    return res.status(400).json({ error: 'حدد المادة والكمية (يمكن أن تكون سالبة للخصم)' });
  }
  try {
    const run = db.transaction(() => {
      ingredientStockDelta(Number(ingredient_id), qty, 'adjust', { notes: String(notes || 'تسوية مخزون'), refType: 'adjust', userId: req.user.id });
    });
    run();
    res.json(ingredientView(db.prepare(INGREDIENT_SELECT + ' WHERE i.id = ?').get(ingredient_id)));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- Inventory transactions ----------
router.get('/inventory/transactions', (req, res) => {
  const where = [];
  const params = [];
  if (req.query.ingredient_id) { where.push('t.ingredient_id = ?'); params.push(Number(req.query.ingredient_id)); }
  if (req.query.from) { where.push('date(t.created_at) >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('date(t.created_at) <= ?'); params.push(req.query.to); }
  const sql = `
    SELECT t.*, i.name AS ingredient_name, i.unit, u.username
    FROM inventory_transactions t
    JOIN ingredients i ON i.id = t.ingredient_id
    LEFT JOIN users u ON u.id = t.user_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.id DESC LIMIT 500
  `;
  res.json(db.prepare(sql).all(...params));
});

export default router;
