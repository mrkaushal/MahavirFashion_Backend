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
const path_1 = __importDefault(require("path"));
const settingsRoutes_1 = __importDefault(require("./routes/settingsRoutes"));
const cors_1 = __importDefault(require("cors"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// ==========================================
// 1. DEBUG LOGGER
// ==========================================
app.use((req, res, next) => {
    console.log(`[INCOMING] ${req.method} ${req.url}`);
    console.log(`   Origin: ${req.headers.origin}`);
    next();
});
// ==========================================
// 2. CORS CONFIGURATION
// ==========================================
app.use((0, cors_1.default)({
    origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'https://mahavir-fashion.vercel.app',
        'https://mahavir-fashion.vercel.app/'
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
// ⚡ FIX: Use Regex /.*/ instead of string '*' to prevent path-to-regexp crash
app.options(/.*/, (0, cors_1.default)());
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
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
app.use('/api/settings', settingsRoutes_1.default);
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
