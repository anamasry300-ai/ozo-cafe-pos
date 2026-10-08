import express from 'express';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { initDb } from './db.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import inventoryRoutes from './routes/inventory.js';
import purchaseRoutes from './routes/purchases.js';
import expenseRoutes from './routes/expenses.js';
import salesRoutes from './routes/sales.js';
import dashboardRoutes from './routes/dashboard.js';
import userRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import menuRoutes from './routes/menu.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 3000;

initDb();

const app = express();
app.use(express.json({ limit: '8mb' }));

app.use('/api', authRoutes);
app.use('/api', menuRoutes);
app.use('/api', catalogRoutes);
app.use('/api', inventoryRoutes);
app.use('/api', purchaseRoutes);
app.use('/api', expenseRoutes);
app.use('/api', salesRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', userRoutes);
app.use('/api', settingsRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'المسار غير موجود' }));

app.use(express.static(PUBLIC_DIR));
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/menu', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'menu.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'خطأ غير متوقع في الخادم' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    const nets = os.networkInterfaces();
    const lan = Object.values(nets).flat().filter(i => i && !i.internal && i.family === 'IPv4').map(i => i.address);
    console.log('==============================================');
    console.log('  نظام أوزو OZO يعمل بنجاح');
    console.log(`  على هذا الجهاز:         http://localhost:${PORT}`);
    if (lan.length) {
      console.log('  من شبكة Wi-Fi (موبايل):');
      for (const ip of lan) console.log(`    http://${ip}:${PORT}`);
    }
    console.log('==============================================');
  });
}

export default app;
