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
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// 1. DEBUG LOGGER (Must be at the very top)
// ==========================================
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[INCOMING] ${req.method} ${req.url}`);
  console.log(`   Origin: ${req.headers.origin}`);
  next();
});

// ==========================================
// 2. ROBUST CORS CONFIGURATION
// ==========================================
// Define options once to ensure consistency
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'https://mahavir-fashion.vercel.app', // Ensure exact match
    'https://mahavir-fashion.vercel.app/' 
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // Required for cookies/tokens
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

// Apply to all routes
app.use(cors(corsOptions));

// ⚡ Handle Preflight (OPTIONS) with the SAME config
// passing 'corsOptions' here is the Key Fix!
app.options(/.*/, cors(corsOptions));

// ==========================================
// 3. BODY PARSER
// ==========================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ==========================================
// 4. ROUTES
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/products', productRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analysticsroutes);

app.use('/api/settings', settingsRoutes);
app.use('/api/categories', require('./routes/categoryRoutes').default); // Importing category routes
// ==========================================
// 5. GLOBAL ERROR HANDLER
// ==========================================
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[BOOT] Server running on http://127.0.0.1:${PORT}`);
});