import { Router } from 'express';
import { db, round, allSettings } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { PAYMENT_METHODS } from './sales.js';

const router = Router();
router.use(requireAuth);

const today = () => new Date().toISOString().slice(0, 10);

function range(req) {
  const to = req.query.to || today();
  const from = req.query.from || '2000-01-01';
  return [from, to];
}

// ---------- Dashboard ----------
router.get('/dashboard', (req, res) => {
  const t = today();
  const monthStart = t.slice(0, 8) + '01';

  const d = db.prepare(`
    SELECT COUNT(*) invoices,
           COALESCE(SUM(subtotal),0) gross,
           COALESCE(SUM(discount),0) discounts,
           COALESCE(SUM(extra_fees),0) fees,
           COALESCE(SUM(total),0) net,
           COALESCE(SUM(cost_total),0) cogs
    FROM sales WHERE status='completed' AND date(created_at) = ?
  `).get(t);

  const expensesToday = db.prepare('SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE date = ?').get(t).total;
  const expensesMonth = db.prepare('SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE date >= ? AND date <= ?').get(monthStart, t).total;

  const topProducts = db.prepare(`
    SELECT si.name, SUM(si.quantity) qty, ROUND(SUM(si.line_total),2) revenue,
           ROUND(SUM(si.cost * si.quantity),2) cogs
    FROM sale_items si JOIN sales s ON s.id = si.sale_id
    WHERE s.status='completed' AND date(s.created_at) >= ? AND date(s.created_at) <= ?
    GROUP BY si.name ORDER BY qty DESC LIMIT 8
  `).all(monthStart, t);

  const daily = db.prepare(`
    SELECT date(created_at) d, COUNT(*) invoices, ROUND(SUM(total),2) total, ROUND(SUM(cost_total),2) cogs
    FROM sales WHERE status='completed' AND date(created_at) >= date(?, '-13 days') AND date(created_at) <= ?
    GROUP BY d ORDER BY d
  `).all(t, t);

  const weekly = db.prepare(`
    SELECT date(created_at, '-' || strftime('%w', created_at) || ' days') d,
           COUNT(*) invoices, ROUND(SUM(total),2) total, ROUND(SUM(cost_total),2) cogs
    FROM sales
    WHERE status='completed' AND date(created_at) >= date(?, '-77 days') AND date(created_at) <= ?
    GROUP BY d ORDER BY d
  `).all(t, t);

  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', created_at) d, COUNT(*) invoices, ROUND(SUM(total),2) total, ROUND(SUM(cost_total),2) cogs
    FROM sales
    WHERE status='completed' AND strftime('%Y-%m', created_at) >= strftime('%Y-%m', date(?, '-11 months')) AND date(created_at) <= ?
    GROUP BY d ORDER BY d
  `).all(t, t);

  const lowStock = db.prepare(`
    SELECT i.id, i.name, i.quantity, i.unit, i.min_stock, s.name supplier_name
    FROM ingredients i LEFT JOIN suppliers s ON s.id = i.supplier_id
    WHERE i.active = 1 AND i.quantity <= i.min_stock
    ORDER BY (i.quantity - i.min_stock) ASC LIMIT 30
  `).all();

  const recent = db.prepare(`
    SELECT s.id, s.invoice_no, s.created_at, s.total, s.payment_method, s.status, u.username
    FROM sales s LEFT JOIN users u ON u.id = s.user_id
    ORDER BY s.id DESC LIMIT 8
  `).all().map(r => ({ ...r, payment_label: PAYMENT_METHODS[r.payment_method] || r.payment_method }));

  const netProfit = round(d.net - d.cogs - expensesToday);

  res.json({
    date: t,
    today: {
      gross: round(d.gross),
      discounts: round(d.discounts),
      fees: round(d.fees),
      net_sales: round(d.net),
      invoices: d.invoices,
      expenses: round(expensesToday),
      cogs: round(d.cogs),
      net_profit: netProfit,
    },
    month: { expenses: round(expensesMonth) },
    top_products: topProducts,
    summary: { daily, weekly, monthly },
    low_stock: lowStock,
    recent_sales: recent,
    settings: allSettings(),
  });
});

// ---------- Reports ----------
router.get('/reports/:name', requireAdmin, (req, res) => {
  const [from, to] = range(req);
  const name = req.params.name;
  const P = [from, to];

  if (name === 'daily-sales' || name === 'weekly-sales' || name === 'monthly-sales') {
    let expr = `date(created_at)`;
    let label = 'اليوم';
    if (name === 'weekly-sales') {
      expr = `date(created_at, '-' || strftime('%w', created_at) || ' days')`;
      label = 'بداية الأسبوع';
    } else if (name === 'monthly-sales') {
      expr = `strftime('%Y-%m', created_at)`;
      label = 'الشهر';
    }
    const rows = db.prepare(`
      SELECT ${expr} AS period,
             COUNT(*) invoices,
             ROUND(SUM(subtotal),2) gross,
             ROUND(SUM(discount),2) discounts,
             ROUND(SUM(extra_fees),2) fees,
             ROUND(SUM(total),2) net,
             ROUND(SUM(cost_total),2) cogs,
             ROUND(SUM(total) - SUM(cost_total),2) gross_profit
      FROM sales
      WHERE status = 'completed' AND date(created_at) >= ? AND date(created_at) <= ?
      GROUP BY period ORDER BY period
    `).all(...P);
    const totals = rows.reduce((a, r) => ({
      invoices: a.invoices + r.invoices,
      gross: round(a.gross + r.gross),
      discounts: round(a.discounts + r.discounts),
      fees: round(a.fees + r.fees),
      net: round(a.net + r.net),
      cogs: round(a.cogs + r.cogs),
      gross_profit: round(a.gross_profit + r.gross_profit),
    }), { invoices: 0, gross: 0, discounts: 0, fees: 0, net: 0, cogs: 0, gross_profit: 0 });
    return res.json({ rows, totals });
  }

  if (name === 'by-product' || name === 'top-products') {
    const limit = name === 'top-products' ? 'LIMIT 20' : '';
    const rows = db.prepare(`
      SELECT si.name AS product_name,
             COUNT(DISTINCT s.id) invoices,
             SUM(si.quantity) quantity,
             ROUND(SUM(si.line_total),2) revenue,
             ROUND(SUM(si.cost * si.quantity),2) cogs,
             ROUND(SUM(si.line_total - si.cost * si.quantity),2) profit
      FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.status = 'completed' AND date(s.created_at) >= ? AND date(s.created_at) <= ?
      GROUP BY si.name
      ORDER BY quantity DESC ${limit}
    `).all(...P);
    const totals = rows.reduce((a, r) => ({
      quantity: a.quantity + r.quantity,
      revenue: round(a.revenue + r.revenue),
      cogs: round(a.cogs + r.cogs),
      profit: round(a.profit + r.profit),
    }), { quantity: 0, revenue: 0, cogs: 0, profit: 0 });
    return res.json({ rows, totals });
  }

  if (name === 'purchases') {
    const rows = db.prepare(`
      SELECT p.*, s.name AS supplier_name, u.username,
        (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS items_count
      FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.date >= ? AND p.date <= ?
      ORDER BY p.date DESC
    `).all(...P);
    const items = db.prepare(`
      SELECT pi.*, i.name AS ingredient_name, i.unit, p.invoice_no, p.date
      FROM purchase_items pi
      JOIN ingredients i ON i.id = pi.ingredient_id
      JOIN purchases p ON p.id = pi.purchase_id
      WHERE p.date >= ? AND p.date <= ?
      ORDER BY p.id DESC
    `).all(...P);
    return res.json({
      rows,
      items,
      totals: { count: rows.length, total: round(rows.reduce((a, r) => a + r.total, 0)) },
    });
  }

  if (name === 'expenses') {
    const rows = db.prepare(`
      SELECT e.*, u.username FROM expenses e LEFT JOIN users u ON u.id = e.user_id
      WHERE e.date >= ? AND e.date <= ? ORDER BY e.date DESC
    `).all(...P);
    const byType = db.prepare(`
      SELECT type, COUNT(*) count, ROUND(SUM(amount),2) amount
      FROM expenses WHERE date >= ? AND date <= ?
      GROUP BY type ORDER BY amount DESC
    `).all(...P);
    return res.json({ rows, by_type: byType, totals: { count: rows.length, total: round(rows.reduce((a, r) => a + r.amount, 0)) } });
  }

  if (name === 'inventory') {
    const rows = db.prepare(`
      SELECT i.*, s.name AS supplier_name,
        ROUND(i.quantity * i.purchase_price, 2) stock_value
      FROM ingredients i LEFT JOIN suppliers s ON s.id = i.supplier_id
      ORDER BY i.name
    `).all().map(r => ({ ...r, active: !!r.active, low_stock: r.quantity <= r.min_stock }));
    const movements = db.prepare(`
      SELECT t.*, i.name AS ingredient_name, i.unit, u.username
      FROM inventory_transactions t
      JOIN ingredients i ON i.id = t.ingredient_id
      LEFT JOIN users u ON u.id = t.user_id
      WHERE date(t.created_at) >= ? AND date(t.created_at) <= ?
      ORDER BY t.id DESC
    `).all(...P);
    return res.json({
      rows,
      movements,
      totals: {
        items: rows.length,
        stock_value: round(rows.reduce((a, r) => a + r.stock_value, 0)),
        low_count: rows.filter(r => r.low_stock).length,
        movements: movements.length,
      },
    });
  }

  if (name === 'product-costs') {
    const products = db.prepare(`
      SELECT p.*, c.name AS category_name,
        COALESCE((SELECT SUM(ri.quantity * i.purchase_price) FROM recipe_items ri
                  JOIN ingredients i ON i.id = ri.ingredient_id WHERE ri.product_id = p.id),0) AS recipe_cost,
        (SELECT COUNT(*) FROM recipe_items ri WHERE ri.product_id = p.id) AS recipe_count
      FROM products p LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY p.name
    `).all();
    const recipeStmt = db.prepare(`
      SELECT ri.quantity, i.name AS ingredient_name, i.unit, i.purchase_price,
             ROUND(ri.quantity * i.purchase_price, 2) AS line_cost
      FROM recipe_items ri JOIN ingredients i ON i.id = ri.ingredient_id
      WHERE ri.product_id = ? ORDER BY ri.id
    `);
    const rows = products.map(p => {
      const cost = round(p.recipe_count > 0 ? p.recipe_cost : p.manual_cost);
      const price = round(p.price);
      return {
        id: p.id, name: p.name, category_name: p.category_name, price, cost,
        margin: round(price - cost),
        margin_percent: price > 0 ? round(((price - cost) / price) * 100) : 0,
        has_recipe: p.recipe_count > 0,
        recipe: recipeStmt.all(p.id),
      };
    });
    return res.json({ rows, totals: { count: rows.length, avg_cost: rows.length ? round(rows.reduce((a, r) => a + r.cost, 0) / rows.length) : 0 } });
  }

  if (name === 'profits') {
    const s = db.prepare(`
      SELECT COUNT(*) invoices,
        ROUND(COALESCE(SUM(subtotal),0),2) gross,
        ROUND(COALESCE(SUM(discount),0),2) discounts,
        ROUND(COALESCE(SUM(extra_fees),0),2) fees,
        ROUND(COALESCE(SUM(total),0),2) net_sales,
        ROUND(COALESCE(SUM(cost_total),0),2) cogs
      FROM sales WHERE status='completed' AND date(created_at) >= ? AND date(created_at) <= ?
    `).get(...P);
    const e = db.prepare('SELECT ROUND(COALESCE(SUM(amount),0),2) total FROM expenses WHERE date >= ? AND date <= ?').get(...P);
    const daily = db.prepare(`
      SELECT date(created_at) period,
        ROUND(SUM(total),2) net_sales,
        ROUND(SUM(cost_total),2) cogs,
        ROUND(SUM(total) - SUM(cost_total),2) gross_profit
      FROM sales WHERE status='completed' AND date(created_at) >= ? AND date(created_at) <= ?
      GROUP BY period ORDER BY period
    `).all(...P);
    const dailyExp = db.prepare('SELECT date(date) period, ROUND(SUM(amount),2) amount FROM expenses WHERE date >= ? AND date <= ? GROUP BY period').all(...P);
    const expMap = Object.fromEntries(dailyExp.map(r => [r.period, r.amount]));
    const rows = daily.map(r => ({ ...r, expenses: expMap[r.period] || 0, net_profit: round(r.gross_profit - (expMap[r.period] || 0)) }));
    const netProfit = round(s.net_sales - s.cogs - e.total);
    return res.json({
      rows,
      totals: {
        invoices: s.invoices,
        gross: s.gross,
        discounts: s.discounts,
        fees: s.fees,
        net_sales: s.net_sales,
        cogs: s.cogs,
        expenses: e.total,
        net_profit: netProfit,
      },
    });
  }

  if (name === 'payment-methods') {
    const rows = db.prepare(`
      SELECT p.method, COUNT(*) count, ROUND(SUM(p.amount),2) amount
      FROM payments p JOIN sales s ON s.id = p.sale_id
      WHERE s.status = 'completed' AND date(s.created_at) >= ? AND date(s.created_at) <= ?
      GROUP BY p.method ORDER BY amount DESC
    `).all(...P).map(r => ({ ...r, label: PAYMENT_METHODS[r.method] || r.method }));
    const totals = { count: rows.reduce((a, r) => a + r.count, 0), amount: round(rows.reduce((a, r) => a + r.amount, 0)) };
    return res.json({ rows, totals });
  }

  if (name === 'invoices') {
    const rows = db.prepare(`
      SELECT s.*, u.username, u.full_name,
        (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS items_count
      FROM sales s LEFT JOIN users u ON u.id = s.user_id
      WHERE date(s.created_at) >= ? AND date(s.created_at) <= ?
      ORDER BY s.id DESC
    `).all(...P).map(r => ({ ...r, payment_label: PAYMENT_METHODS[r.payment_method] || r.payment_method }));
    const totals = {
      count: rows.length,
      net: round(rows.filter(r => r.status === 'completed').reduce((a, r) => a + r.total, 0)),
      cancelled: rows.filter(r => r.status !== 'completed').length,
    };
    return res.json({ rows, totals });
  }

  res.status(404).json({ error: 'التقرير غير موجود' });
});

export default router;
