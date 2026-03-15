"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const orderRoutes_1 = __importDefault(require("./routes/orderRoutes"));
const productRoutes_1 = __importDefault(require("./routes/productRoutes"));
const dashboardRoutes_1 = __importDefault(require("./routes/dashboardRoutes"));
const analyticsRoutes_1 = __importDefault(require("./routes/analyticsRoutes"));
const settingsRoutes_1 = __importDefault(require("./routes/settingsRoutes"));
const cors_1 = __importDefault(require("cors"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// ==========================================
// 1. DEBUG LOGGER (Must be at the very top)
// ==========================================
app.use((req, res, next) => {
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
app.use((0, cors_1.default)(corsOptions));
// ⚡ Handle Preflight (OPTIONS) with the SAME config
// passing 'corsOptions' here is the Key Fix!
app.options(/.*/, (0, cors_1.default)(corsOptions));
// ==========================================
// 3. BODY PARSER
// ==========================================
app.use(express_1.default.json());
// ==========================================
// 4. ROUTES
// ==========================================
app.use('/api/auth', authRoutes_1.default);
app.use('/api/users', userRoutes_1.default);
app.use('/api/orders', orderRoutes_1.default);
app.use('/api/products', productRoutes_1.default);
app.use('/api/dashboard', dashboardRoutes_1.default);
app.use('/api/analytics', analyticsRoutes_1.default);
app.use('/api/settings', settingsRoutes_1.default);
app.use('/api/categories', require('./routes/categoryRoutes').default); // Importing category routes
// ==========================================
// 5. GLOBAL ERROR HANDLER
// ==========================================
app.use((err, req, res, next) => {
    console.error('[SERVER ERROR]', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
});
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[BOOT] Server running on http://127.0.0.1:${PORT}`);
});
