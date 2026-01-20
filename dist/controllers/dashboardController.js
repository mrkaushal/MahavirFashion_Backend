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
const prisma_1 = __importDefault(require("../config/prisma"));
const getDashboardStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const now = new Date();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        // 1. Parallel Queries
        const [totalOrders, activeCustomers, pendingOrders, recentOrdersRaw, thisMonthOrders, lastMonthOrders, graphOrdersRaw, 
        // NEW: Fetch Real Activity Logs
        recentLogsRaw] = yield prisma_1.default.$transaction([
            // ... (Keep existing count queries same) ...
            prisma_1.default.order.count(),
            prisma_1.default.user.count({ where: { role: 'BUYER', isActive: true } }),
            prisma_1.default.order.count({ where: { status: 'PENDING' } }),
            // Recent Orders
            prisma_1.default.order.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { companyName: true, name: true } } }
            }),
            // This Month
            prisma_1.default.order.aggregate({
                where: { createdAt: { gte: startOfThisMonth } },
                _sum: { totalAmount: true },
                _count: { id: true }
            }),
            // Last Month
            prisma_1.default.order.aggregate({
                where: { createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } },
                _sum: { totalAmount: true },
                _count: { id: true }
            }),
            // ⚡ UPDATED: Analyze last 500 orders for Graph
            prisma_1.default.order.findMany({
                take: 500,
                select: { items: true },
                orderBy: { createdAt: 'desc' }
            }),
            // ⚡ NEW: Recent Activity Logs (Limit 6 for dashboard card)
            prisma_1.default.loginActivity.findMany({
                take: 6,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { name: true, companyName: true } } }
            })
        ]);
        // ... (Keep existing trend calculation logic) ...
        const calculateTrend = (current, previous) => {
            if (previous === 0)
                return current > 0 ? '+100%' : '0%';
            const percent = ((current - previous) / previous) * 100;
            return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
        };
        const thisMonthRev = Number(thisMonthOrders._sum.totalAmount || 0);
        const lastMonthRev = Number(lastMonthOrders._sum.totalAmount || 0);
        const revenueTrend = calculateTrend(thisMonthRev, lastMonthRev);
        const thisMonthCount = thisMonthOrders._count.id;
        const lastMonthCount = lastMonthOrders._count.id;
        const ordersTrend = calculateTrend(thisMonthCount, lastMonthCount);
        // --- Graph Data ---
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
        // Total Revenue
        const totalRevenueRaw = yield prisma_1.default.order.aggregate({ _sum: { totalAmount: true } });
        const totalRevenue = Number(totalRevenueRaw._sum.totalAmount || 0);
        // Format Recent Orders
        const recentOrders = recentOrdersRaw.map(order => ({
            id: order.readableId,
            customer: order.user.companyName || order.user.name,
            product: Array.isArray(order.items) && order.items.length > 0
                ? `${order.items[0].name} ${order.items.length > 1 ? `+${order.items.length - 1}` : ''}`
                : 'No Items',
            total: Number(order.totalAmount),
            status: order.status,
            date: order.createdAt
        }));
        // ⚡ FORMAT ACTIVITIES
        const activities = recentLogsRaw.map(log => {
            var _a;
            return ({
                id: log.id,
                user: ((_a = log.user) === null || _a === void 0 ? void 0 : _a.name) || log.email,
                action: log.status === 'SUCCESS' ? `Logged in as ${log.role}` : 'Failed login attempt',
                time: log.createdAt,
                status: log.status // SUCCESS or FAILED
            });
        });
        res.json({
            stats: { totalRevenue, totalOrders, activeCustomers, pendingOrders, revenueTrend, ordersTrend },
            graphData,
            recentOrders,
            activities // Sending this to frontend
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
});
exports.getDashboardStats = getDashboardStats;
