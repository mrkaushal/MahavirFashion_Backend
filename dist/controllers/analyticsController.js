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
exports.getAnalytics = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const getAnalytics = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [totalUsers, ordersToday, revenueRaw, logsRaw] = yield prisma_1.default.$transaction([
            // 1. Total Users
            prisma_1.default.user.count(),
            // 2. Orders Today
            prisma_1.default.order.count({
                where: { createdAt: { gte: today } }
            }),
            // 3. Revenue (This Month)
            prisma_1.default.order.aggregate({
                _sum: { totalAmount: true }
            }),
            // 4. Recent Logs (Last 20)
            prisma_1.default.loginActivity.findMany({
                take: 20,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { companyName: true, name: true } } }
            })
        ]);
        // Format Data
        const revenue = revenueRaw._sum.totalAmount ? Number(revenueRaw._sum.totalAmount) : 0;
        const logs = logsRaw.map(log => {
            var _a, _b;
            return ({
                id: log.id,
                // If linked to user, show Company/Name, else show Email
                user: ((_a = log.user) === null || _a === void 0 ? void 0 : _a.companyName) || ((_b = log.user) === null || _b === void 0 ? void 0 : _b.name) || log.email,
                role: log.role,
                status: log.status === 'SUCCESS' ? 'Success' : 'Failed',
                time: log.createdAt // Frontend handles "2 mins ago"
            });
        });
        res.json({
            stats: { totalUsers, ordersToday, revenue },
            logs
        });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch analytics" });
    }
});
exports.getAnalytics = getAnalytics;
