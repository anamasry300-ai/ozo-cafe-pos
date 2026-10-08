import { Router } from 'express';
import { db, round } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { PRODUCT_SELECT, productView, listProducts, getRecipe, getProduct } from '../calc.js';

const router = Router();
router.use(requireAuth);

// ---------- Categories ----------
router.get('/categories', (req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all();
  res.json(rows.map(r => ({ ...r, active: !!r.active })));
});

router.post('/categories', requireAdmin, (req, res) => {
  const { name, sort_order } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم التصنيف مطلوب' });
  try {
    const info = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)')
      .run(String(name).trim(), Number(sort_order) || 0);
    res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: 'يوجد تصنيف بنفس الاسم' });
  }
});

router.put('/categories/:id', requireAdmin, (req, res) => {
  const { name, sort_order, active } = req.body || {};
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'التصنيف غير موجود' });
  try {
    db.prepare('UPDATE categories SET name = ?, sort_order = ?, active = ? WHERE id = ?')
      .run(String(name ?? row.name).trim(), Number(sort_order ?? row.sort_order) || 0, active === false ? 0 : active === true ? 1 : row.active, row.id);
    res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(row.id));
  } catch (e) {
    res.status(400).json({ error: 'يوجد تصنيف بنفس الاسم' });
  }
});

router.delete('/categories/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'التصنيف غير موجود' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// ---------- Products ----------
router.get('/products', (req, res) => {
  const rows = listProducts({
    categoryId: req.query.category_id ? Number(req.query.category_id) : null,
    activeOnly: req.query.active_only === '1' || req.query.active_only === 'true',
    q: req.query.q || '',
  });
  res.json(rows);
});

router.get('/products/:id', (req, res) => {
  const p = getProduct(req.params.id);
  if (!p) return res.status(404).json({ error: 'المنتج غير موجود' });
  res.json({ ...p, recipe: getRecipe(p.id) });
});

function validateProductBody(body) {
  const name = String(body.name || '').trim();
  if (!name) return 'اسم المنتج مطلوب';
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0) return 'السعر غير صحيح';
  if (body.image && String(body.image).length > 4 * 1024 * 1024) return 'حجم الصورة كبير جدًا';
  return null;
}

router.post('/products', requireAdmin, (req, res) => {
  const err = validateProductBody(req.body || {});
  if (err) return res.status(400).json({ error: err });
  const { name, category_id, price, manual_cost, description, image, active } = req.body;
  const info = db.prepare(`
    INSERT INTO products (name, category_id, price, manual_cost, description, image, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(name).trim(),
    category_id ? Number(category_id) : null,
    round(Number(price)),
    round(Number(manual_cost) || 0),
    String(description || ''),
    String(image || ''),
    active === false ? 0 : 1
  );
  res.json(getProduct(info.lastInsertRowid));
});

router.put('/products/:id', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'المنتج غير موجود' });
  const err = validateProductBody({ ...p, ...(req.body || {}) });
  if (err) return res.status(400).json({ error: err });
  const { name, category_id, price, manual_cost, description, image, active } = { ...p, ...req.body };
  db.prepare(`
    UPDATE products SET name = ?, category_id = ?, price = ?, manual_cost = ?, description = ?, image = ?, active = ?
    WHERE id = ?
  `).run(
    String(name).trim(),
    category_id ? Number(category_id) : null,
    round(Number(price)),
    round(Number(manual_cost) || 0),
    String(description || ''),
    String(image || ''),
    active === false ? 0 : active === true ? 1 : p.active,
    p.id
  );
  res.json(getProduct(p.id));
});

router.delete('/products/:id', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'المنتج غير موجود' });
  const used = db.prepare('SELECT COUNT(*) c FROM sale_items WHERE product_id = ?').get(p.id).c;
  if (used > 0) {
    return res.status(400).json({ error: 'المنتج مستخدم في فواتير سابقة، يمكنك إيقافه بدل حذفه' });
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(p.id);
  res.json({ ok: true });
});

router.patch('/products/:id/toggle', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'المنتج غير موجود' });
  db.prepare('UPDATE products SET active = ? WHERE id = ?').run(p.active ? 0 : 1, p.id);
  res.json({ ok: true, active: !p.active });
});

// ---------- Recipes ----------
router.get('/products/:id/recipe', (req, res) => {
  const p = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'المنتج غير موجود' });
  const items = getRecipe(p.id);
  res.json({ items, cost: round(items.reduce((s, r) => s + r.line_cost, 0)) });
});

router.put('/products/:id/recipe', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'المنتج غير موجود' });
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items) return res.status(400).json({ error: 'بيانات الوصفة غير صحيحة' });

  const exists = db.prepare('SELECT 1 FROM ingredients WHERE id = ?');
  const seen = new Set();
  for (const it of items) {
    const ingId = Number(it.ingredient_id);
    const qty = Number(it.quantity);
    if (!ingId || seen.has(ingId)) return res.status(400).json({ error: 'مكوّن غير صحيح أو مكرر' });
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'كمية المكوّن يجب أن تكون أكبر من صفر' });
    if (!exists.get(ingId)) return res.status(400).json({ error: 'أحد المكوّنات غير موجود' });
    seen.add(ingId);
  }

  const run = db.transaction(() => {
    db.prepare('DELETE FROM recipe_items WHERE product_id = ?').run(p.id);
    const ins = db.prepare('INSERT INTO recipe_items (product_id, ingredient_id, quantity) VALUES (?, ?, ?)');
    for (const it of items) ins.run(p.id, Number(it.ingredient_id), round(Number(it.quantity)));
  });
  run();

  const recipe = getRecipe(p.id);
  res.json({ items: recipe, cost: round(recipe.reduce((s, r) => s + r.line_cost, 0)) });
});

export default router;
