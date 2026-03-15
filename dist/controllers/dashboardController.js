"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardStats = void 0;
const node_cache_1 = __importDefault(require("node-cache")); // ⚡ Install this: npm install node-cache
const prisma_1 = __importDefault(require("../config/prisma"));
// ⚡ PERFORMANCE: Cache dashboard data for 60 seconds
// This prevents recalculating the graph/trends on every single page refresh.
const dashboardCache = new node_cache_1.default({ stdTTL: 60 });
const CACHE_KEY = 'dashboard_stats';
const getDashboardStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (dashboardCache.has(CACHE_KEY)) {
            return res.json(dashboardCache.get(CACHE_KEY));
        }
        const now = new Date();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const [totalOrders, activeCustomers, pendingOrders, 
        // totalRevenueRaw, <--- REMOVED
        recentOrdersRaw, thisMonthOrders, lastMonthOrders, graphOrdersRaw, recentLogsRaw] = yield prisma_1.default.$transaction([
            prisma_1.default.order.count(),
            prisma_1.default.user.count({ where: { role: 'BUYER', isActive: true } }),
            prisma_1.default.order.count({ where: { status: 'PENDING' } }),
            // REMOVED REVENUE AGGREGATION QUERY
            // prisma.order.aggregate({ _sum: { totalAmount: true } }), 
            prisma_1.default.order.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { companyName: true, name: true } } }
            }),
            // Keep trends for Orders, but ignore revenue sums inside them if needed, 
            // or just keep them for "Orders Trend" calculation but don't display revenue.
            prisma_1.default.order.aggregate({
                where: { createdAt: { gte: startOfThisMonth } },
                _count: { id: true }
            }),
            prisma_1.default.order.aggregate({
                where: { createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } },
                _count: { id: true }
            }),
            prisma_1.default.order.findMany({
                take: 500,
                select: { items: true },
                orderBy: { createdAt: 'desc' }
            }),
            prisma_1.default.loginActivity.findMany({
                take: 6,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { name: true, companyName: true } } }
            })
        ]);
        // Trends Calculation (Orders Only)
        const calculateTrend = (current, previous) => {
            if (previous === 0)
                return current > 0 ? '+100%' : '0%';
            const percent = ((current - previous) / previous) * 100;
            return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
        };
        // Revenue Trend is now hardcoded to 0% since we removed it
        const revenueTrend = "0%";
        const thisMonthCount = thisMonthOrders._count.id;
        const lastMonthCount = lastMonthOrders._count.id;
        const ordersTrend = calculateTrend(thisMonthCount, lastMonthCount);
        // Graph Logic (Same as before)
        const categoryMap = {};
        graphOrdersRaw.forEach(order => {
            const items = order.items;
            if (Array.isArray(items)) {
                items.forEach(item => {
                    const cat = item.category || 'General';
                    categoryMap[cat] = (categoryMap[cat] || 0) + (item.qty || 1);
                });
            }
        });
        const graphData = Object.entries(categoryMap)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
        // Formatted Data
        const totalRevenue = 0; // <--- HARDCODED 0
        const recentOrders = recentOrdersRaw.map(order => ({
            // ... map logic same as before ...
            id: order.readableId,
            customer: order.user.companyName || order.user.name,
            product: Array.isArray(order.items) && order.items.length > 0
                ? `${order.items[0].name} ${order.items.length > 1 ? `+${order.items.length - 1}` : ''}`
                : 'No Items',
            total: Number(order.totalAmount),
            status: order.status,
            date: order.createdAt
        }));
        const activities = recentLogsRaw.map(log => {
            var _a;
            return ({
                // ... map logic same as before ...
                id: log.id,
                user: ((_a = log.user) === null || _a === void 0 ? void 0 : _a.name) || log.email,
                action: log.status === 'SUCCESS' ? `Logged in as ${log.role}` : 'Failed login attempt',
                time: log.createdAt,
                status: log.status
            });
        });
        const responseData = {
            stats: { totalRevenue, totalOrders, activeCustomers, pendingOrders, revenueTrend, ordersTrend },
            graphData,
            recentOrders,
            activities
        };
        dashboardCache.set(CACHE_KEY, responseData);
        res.json(responseData);
    }
    catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
});
exports.getDashboardStats = getDashboardStats;
