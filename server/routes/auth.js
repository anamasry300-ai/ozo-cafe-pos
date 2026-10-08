import { Router } from 'express';
import { db } from '../db.js';
import { hashPassword, verifyPassword, createToken, revokeToken, requireAuth } from '../auth.js';

const router = Router();

router.get('/setup/status', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  res.json({ needsSetup: count === 0 });
});

router.post('/setup', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (count > 0) return res.status(400).json({ error: 'تم إنشاء المستخدمين بالفعل' });
  const { username, password, full_name } = req.body || {};
  if (!username || !String(username).trim()) return res.status(400).json({ error: 'اسم المستخدم مطلوب' });
  if (!password || String(password).length < 4) return res.status(400).json({ error: 'كلمة المرور يجب ألا تقل عن 4 أحرف' });
  const info = db.prepare('INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)')
    .run(String(username).trim(), hashPassword(password), 'admin', String(full_name || '').trim());
  const token = createToken(info.lastInsertRowid);
  const user = db.prepare('SELECT id, username, role, full_name FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ token, user });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
  if (!user || !verifyPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
  if (!user.active) return res.status(403).json({ error: 'هذا المستخدم موقوف' });
  const token = createToken(user.id);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name } });
});

router.post('/logout', (req, res) => {
  const header = req.headers['authorization'] || '';
  if (header.startsWith('Bearer ')) revokeToken(header.slice(7));
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

export default router;
