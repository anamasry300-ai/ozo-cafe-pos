import { Router } from 'express';
import { db, round } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { listProducts, getProduct, ingredientStockDelta, PRODUCT_SELECT, productCost } from '../calc.js';

const router = Router();
router.use(requireAuth);

export const PAYMENT_METHODS = {
  cash: 'نقدي',
  card: 'بطاقة',
  transfer: 'تحويل',
  other: 'أخرى',
};

// ---------- POS catalog ----------
router.get('/pos/products', (req, res) => {
  res.json(listProducts({
    categoryId: req.query.category_id ? Number(req.query.category_id) : null,
    activeOnly: true,
    q: req.query.q || '',
  }));
});

router.get('/sales/next-invoice', (req, res) => {
  const max = db.prepare('SELECT COALESCE(MAX(id), 0) m FROM sales').get().m;
  res.json({ invoice_no: 'INV-' + String(max + 1).padStart(6, '0') });
});

// ---------- Create sale ----------
router.post('/sales', (req, res) => {
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return res.status(400).json({ error: 'الطلب فارغ، أضف أصنافًا أولًا' });

  const discount = round(Number(body.discount) || 0);
  const extraFees = round(Number(body.extra_fees) || 0);
  if (discount < 0) return res.status(400).json({ error: 'الخصم لا يمكن أن يكون سالبًا' });
  if (extraFees < 0) return res.status(400).json({ error: 'الرسوم لا يمكن أن تكون سالبة' });
  const method = body.payment_method || 'cash';
  if (!PAYMENT_METHODS[method]) return res.status(400).json({ error: 'طريقة الدفع غير صحيحة' });

  const clean = [];
  for (const it of items) {
    const qty = Number(it.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'كمية غير صحيحة' });
    const row = db.prepare(PRODUCT_SELECT + ' WHERE p.id = ?').get(Number(it.product_id));
    if (!row) return res.status(400).json({ error: 'إحدى الأصناف غير موجودة' });
    if (!row.active) return res.status(400).json({ error: `الصنف "${row.name}" موقوف` });
    const cost = productCost(row);
    clean.push({
      product_id: row.id,
      name: row.name,
      price: round(row.price),
      quantity: round(qty),
      cost,
      line_total: round(row.price * qty),
      note: String(it.note || ''),
    });
  }

  const subtotal = round(clean.reduce((s, r) => s + r.line_total, 0));
  if (discount > subtotal) return res.status(400).json({ error: 'الخصم أكبر من الإجمالي' });
  const total = round(subtotal - discount + extraFees);
  const costTotal = round(clean.reduce((s, r) => s + r.cost * r.quantity, 0));

  try {
    const run = db.transaction(() => {
      const max = db.prepare('SELECT COALESCE(MAX(id), 0) m FROM sales').get().m;
      const invoiceNo = 'INV-' + String(max + 1).padStart(6, '0');

      const saleInfo = db.prepare(`
        INSERT INTO sales (invoice_no, user_id, subtotal, discount, extra_fees, total, cost_total, payment_method, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(invoiceNo, req.user.id, subtotal, discount, extraFees, total, costTotal, method, String(body.notes || ''));
      const saleId = saleInfo.lastInsertRowid;

      const insItem = db.prepare(`
        INSERT INTO sale_items (sale_id, product_id, name, price, quantity, cost, line_total, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const r of clean) {
        insItem.run(saleId, r.product_id, r.name, r.price, r.quantity, r.cost, r.line_total, r.note);
      }

      db.prepare('INSERT INTO payments (sale_id, method, amount) VALUES (?, ?, ?)').run(saleId, method, total);

      for (const r of clean) {
        const recipe = db.prepare(`
          SELECT ingredient_id, quantity FROM recipe_items WHERE product_id = ?
        `).all(r.product_id);
        for (const ri of recipe) {
          ingredientStockDelta(ri.ingredient_id, -round(ri.quantity * r.quantity), 'sale', {
            refType: 'sale', refId: saleId, notes: `بيع ${r.name} ×${r.quantity} (${invoiceNo})`, userId: req.user.id,
          });
        }
      }
      return saleId;
    });
    const saleId = run();
    res.json(getSale(saleId));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- Read sales ----------
function getSale(id) {
  const sale = db.prepare(`
    SELECT s.*, u.username, u.full_name
    FROM sales s LEFT JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).get(id);
  if (!sale) return null;
  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id').all(id);
  return { ...sale, items, payment_label: PAYMENT_METHODS[sale.payment_method] || sale.payment_method };
}

router.get('/sales', (req, res) => {
  const where = [];
  const params = [];
  if (req.query.from) { where.push('date(s.created_at) >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('date(s.created_at) <= ?'); params.push(req.query.to); }
  if (req.query.status) { where.push('s.status = ?'); params.push(req.query.status); }
  if (req.query.method) { where.push('s.payment_method = ?'); params.push(req.query.method); }
  if (req.query.q) {
    where.push('(s.invoice_no LIKE ? OR s.notes LIKE ? OR u.username LIKE ? OR EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.name LIKE ?))');
    const like = `%${req.query.q}%`;
    params.push(like, like, like, like);
  }
  const sql = `
    SELECT s.*, u.username, u.full_name,
      (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS items_count
    FROM sales s LEFT JOIN users u ON u.id = s.user_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY s.id DESC LIMIT 300
  `;
  const rows = db.prepare(sql).all(...params).map(r => ({
    ...r, payment_label: PAYMENT_METHODS[r.payment_method] || r.payment_method,
  }));
  res.json(rows);
});

router.get('/sales/:id', (req, res) => {
  const sale = getSale(req.params.id);
  if (!sale) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  res.json(sale);
});

// ---------- Cancel / refund ----------
function reverseSaleStock(saleId, type, userId) {
  const txs = db.prepare(`
    SELECT * FROM inventory_transactions WHERE ref_type = 'sale' AND ref_id = ?
  `).all(saleId);
  for (const t of txs) {
    ingredientStockDelta(t.ingredient_id, -t.delta, type, {
      refType: type === 'cancel' ? 'sale_cancel' : 'sale_refund',
      refId: saleId,
      notes: `إلغاء/استرجاع الفاتورة رقم ${saleId}`,
      userId,
    });
  }
}

router.post('/sales/:id/cancel', requireAdmin, (req, res) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!sale) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  if (sale.status !== 'completed') return res.status(400).json({ error: 'الفاتورة ليست مكتملة' });
  try {
    const run = db.transaction(() => {
      reverseSaleStock(sale.id, 'cancel', req.user.id);
      db.prepare("UPDATE sales SET status = 'cancelled' WHERE id = ?").run(sale.id);
      db.prepare("DELETE FROM payments WHERE sale_id = ?").run(sale.id);
    });
    run();
    res.json(getSale(sale.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/sales/:id/refund', requireAdmin, (req, res) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!sale) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  if (sale.status !== 'completed') return res.status(400).json({ error: 'الفاتورة ليست مكتملة' });
  try {
    const run = db.transaction(() => {
      reverseSaleStock(sale.id, 'refund', req.user.id);
      db.prepare("UPDATE sales SET status = 'refunded' WHERE id = ?").run(sale.id);
      db.prepare("DELETE FROM payments WHERE sale_id = ?").run(sale.id);
    });
    run();
    res.json(getSale(sale.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
