import { Router } from 'express';
import { db, round } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();
router.use(requireAuth);

export const EXPENSE_TYPES = ['كهرباء', 'مياه', 'إيجار', 'رواتب', 'صيانة', 'مواد تنظيف', 'أخرى'];

router.get('/expense-types', requireAdmin, (req, res) => res.json(EXPENSE_TYPES));

router.get('/expenses', requireAdmin, (req, res) => {
  const where = [];
  const params = [];
  if (req.query.from) { where.push('e.date >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('e.date <= ?'); params.push(req.query.to); }
  if (req.query.q) {
    where.push('(e.type LIKE ? OR e.notes LIKE ?)');
    params.push(`%${req.query.q}%`, `%${req.query.q}%`);
  }
  const sql = `
    SELECT e.*, u.username
    FROM expenses e
    LEFT JOIN users u ON u.id = e.user_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY e.date DESC, e.id DESC LIMIT 500
  `;
  const rows = db.prepare(sql).all(...params);
  res.json({ rows, total: round(rows.reduce((s, r) => s + r.amount, 0)) });
});

router.post('/expenses', requireAdmin, (req, res) => {
  const { type, amount, date, notes } = req.body || {};
  const amt = Number(amount);
  if (!type || !String(type).trim()) return res.status(400).json({ error: 'نوع المصروف مطلوب' });
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' });
  if (!date) return res.status(400).json({ error: 'التاريخ مطلوب' });
  const info = db.prepare('INSERT INTO expenses (type, amount, date, notes, user_id) VALUES (?, ?, ?, ?, ?)')
    .run(String(type).trim(), round(amt), date, String(notes || ''), req.user.id);
  res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/expenses/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'المصروف غير موجود' });
  const body = { ...row, ...(req.body || {}) };
  const amt = Number(body.amount);
  if (!String(body.type || '').trim()) return res.status(400).json({ error: 'نوع المصروف مطلوب' });
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' });
  if (!body.date) return res.status(400).json({ error: 'التاريخ مطلوب' });
  db.prepare('UPDATE expenses SET type = ?, amount = ?, date = ?, notes = ? WHERE id = ?')
    .run(String(body.type).trim(), round(amt), body.date, String(body.notes || ''), row.id);
  res.json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(row.id));
});

router.delete('/expenses/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'المصروف غير موجود' });
  db.prepare('DELETE FROM expenses WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

export default router;
