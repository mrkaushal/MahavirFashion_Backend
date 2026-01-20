import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import orderRoutes from './routes/orderRoutes';
import productRoutes from './routes/productRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import analysticsroutes from './routes/analyticsRoutes';
import path from 'path';
import settingsRoutes from './routes/settingsRoutes';
// import productRoutes from './routes/productRoutes'; 

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// 1. DEBUG LOGGER (Must be first)
// ==========================================
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[INCOMING] ${req.method} ${req.url}`);
  console.log(`   Origin: ${req.headers.origin}`);
  next();
});

// ==========================================
// 2. MANUAL CORS FIX
// ==========================================
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});
// ==========================================
// 3. BODY PARSER
// ==========================================
app.use(express.json());

// ==========================================
// 4. ROUTES
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/products', productRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analysticsroutes);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/settings', settingsRoutes);
// app.use('/api/products', productRoutes);

// ==========================================
// 5. GLOBAL ERROR HANDLER
// ==========================================
// Catches crashes inside controllers (like DB errors)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[BOOT] Server running on http://127.0.0.1:${PORT}`);
});