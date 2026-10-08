import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireAdmin, hashPassword, verifyPassword } from '../auth.js';

const router = Router();
router.use(requireAuth);

function publicUser(u) {
  const { password_hash, ...rest } = u;
  return { ...rest, active: !!u.active };
}

router.get('/users', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM users ORDER BY id').all().map(publicUser));
});

function validate(body, { includePassword = false, currentId = null } = {}) {
  const username = String(body.username || '').trim();
  if (!username) return 'اسم المستخدم مطلوب';
  if (!['admin', 'cashier'].includes(body.role)) return 'الدور غير صحيح';
  const dup = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, currentId || -1);
  if (dup) return 'اسم المستخدم مستخدم بالفعل';
  if (includePassword && (!body.password || String(body.password).length < 4)) return 'كلمة المرور يجب ألا تقل عن 4 أحرف';
  return null;
}

router.post('/users', requireAdmin, (req, res) => {
  const { username, password, role, full_name } = req.body || {};
  const err = validate({ username, role, password }, { includePassword: true });
  if (err) return res.status(400).json({ error: err });
  const info = db.prepare('INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)')
    .run(String(username).trim(), hashPassword(password), role, String(full_name || '').trim());
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)));
});

router.put('/users/:id', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const body = { ...user, ...(req.body || {}) };
  const err = validate(body, { currentId: user.id });
  if (err) return res.status(400).json({ error: err });

  const becomesInactive = body.active === false || body.active === 0;
  const losesAdmin = body.role !== 'admin' && user.role === 'admin';
  if (user.id === req.user.id && (becomesInactive || losesAdmin)) {
    return res.status(400).json({ error: 'لا يمكنك إيقاف حسابك أو سحب صلاحيتك' });
  }
  if (losesAdmin || becomesInactive) {
    const admins = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND active = 1 AND id != ?").get(user.id).c;
    if (admins === 0) return res.status(400).json({ error: 'يجب أن يبقى مدير واحد نشط على الأقل' });
  }

  db.prepare('UPDATE users SET username = ?, role = ?, full_name = ?, active = ? WHERE id = ?')
    .run(String(body.username).trim(), body.role, String(body.full_name || ''), body.active === false || body.active === 0 ? 0 : 1, user.id);

  if (req.body && req.body.password) {
    if (String(req.body.password).length < 4) return res.status(400).json({ error: 'كلمة المرور يجب ألا تقل عن 4 أحرف' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(req.body.password), user.id);
  }
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)));
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'لا يمكنك حذف حسابك' });
  if (user.role === 'admin') {
    const admins = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND active = 1 AND id != ?").get(user.id).c;
    if (admins === 0) return res.status(400).json({ error: 'يجب أن يبقى مدير واحد نشط على الأقل' });
  }
  const sales = db.prepare('SELECT COUNT(*) c FROM sales WHERE user_id = ?').get(user.id).c;
  if (sales > 0) return res.status(400).json({ error: 'لدى هذا المستخدم فواتير مسجلة، يفضل إيقافه بدل حذفه' });
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  res.json({ ok: true });
});

router.post('/users/:id/password', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const { current_password, new_password } = req.body || {};
  if (!verifyPassword(current_password || '', user.password_hash)) {
    return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  }
  if (!new_password || String(new_password).length < 4) return res.status(400).json({ error: 'كلمة المرور الجديدة قصيرة' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(new_password), user.id);
  res.json({ ok: true });
});

export default router;
