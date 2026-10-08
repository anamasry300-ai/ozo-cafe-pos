import crypto from 'node:crypto';
import { db } from './db.js';

const tokens = new Map(); // token -> userId

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(candidate, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  tokens.set(token, Number(userId));
  return token;
}

export function revokeToken(token) {
  tokens.delete(token);
}

export function getUserByToken(token) {
  if (!token) return null;
  const userId = tokens.get(token);
  if (!userId) return null;
  return db.prepare('SELECT id, username, role, full_name, active FROM users WHERE id = ?').get(userId) || null;
}

export function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || '');
  const user = getUserByToken(token);
  if (!user || !user.active) {
    return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  }
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'هذه العملية متاحة للمدير فقط' });
  }
  next();
}
