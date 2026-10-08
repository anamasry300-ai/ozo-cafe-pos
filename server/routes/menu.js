import { Router } from 'express';
import os from 'node:os';
import QRCode from 'qrcode';
import { db, allSettings } from '../db.js';

const router = Router();
export const PORT = () => Number(process.env.PORT) || 3000;

export function lanAddresses() {
  const nets = os.networkInterfaces();
  const seen = new Set();
  return Object.values(nets).flat()
    .filter(i => i && !i.internal && i.family === 'IPv4')
    .filter(i => !/^(169\.254\.|127\.|0\.)/.test(i.address))
    .map(i => i.address)
    .filter(ip => { if (seen.has(ip)) return false; seen.add(ip); return true; });
}

router.get('/menu-url', (req, res) => {
  const port = PORT();
  const host = req.get('host') || '';
  const hostUrl = host && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$|\/)/.test(host)
    ? `${req.protocol}://${host}/menu` : null;
  const urls = [...new Set([
    ...lanAddresses().map(ip => `http://${ip}:${port}/menu`),
    hostUrl,
  ].filter(Boolean))];
  if (!urls.length) urls.push(`http://localhost:${port}/menu`);
  res.json({ local: `http://localhost:${port}/menu`, urls });
});

router.get('/menu', (req, res) => {
  const s = allSettings();
  const categories = db.prepare(`
    SELECT id, name FROM categories WHERE active = 1 ORDER BY sort_order, id
  `).all();
  const byCat = new Map();
  for (const c of categories) byCat.set(c.id, { id: c.id, name: c.name, products: [] });
  const products = db.prepare(`
    SELECT id, name, description, image, price, category_id
    FROM products WHERE active = 1 ORDER BY name COLLATE NOCASE
  `).all();
  for (const p of products) {
    const group = byCat.get(p.category_id);
    if (!group) continue;
    group.products.push({
      id: p.id,
      name: p.name,
      description: p.description,
      image: p.image,
      price: Math.round(p.price * 100) / 100,
    });
  }
  res.json({
    store: { name: s.store_name || 'أوزو OZO', phone: s.store_phone || '', address: s.store_address || '' },
    categories: [...byCat.values()].filter(c => c.products.length),
  });
});

router.get('/qr', async (req, res) => {
  const data = String(req.query.data || '').trim().slice(0, 600);
  if (!data) return res.status(400).json({ error: 'لا توجد بيانات لإنشاء الكود' });
  try {
    const svg = await QRCode.toString(data, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
    res.type('image/svg+xml').send(svg);
  } catch (e) {
    res.status(400).json({ error: 'تعذّر إنشاء الكود' });
  }
});

export default router;