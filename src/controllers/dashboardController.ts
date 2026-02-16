import { Request, Response } from 'express';
import NodeCache from 'node-cache'; // ⚡ Install this: npm install node-cache
import prisma from '../config/prisma';

// ⚡ PERFORMANCE: Cache dashboard data for 60 seconds
// This prevents recalculating the graph/trends on every single page refresh.
const dashboardCache = new NodeCache({ stdTTL: 60 });
const CACHE_KEY = 'dashboard_stats';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    if (dashboardCache.has(CACHE_KEY)) {
      return res.json(dashboardCache.get(CACHE_KEY));
    }

    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    const [
      totalOrders,
      activeCustomers,
      pendingOrders,
      // totalRevenueRaw, <--- REMOVED
      recentOrdersRaw,
      thisMonthOrders,
      lastMonthOrders,
      graphOrdersRaw,
      recentLogsRaw 
    ] = await prisma.$transaction([
      prisma.order.count(),
      prisma.user.count({ where: { role: 'BUYER', isActive: true } }),
      prisma.order.count({ where: { status: 'PENDING' } }),
      
      // REMOVED REVENUE AGGREGATION QUERY
      // prisma.order.aggregate({ _sum: { totalAmount: true } }), 

      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { companyName: true, name: true } } }
      }),

      // Keep trends for Orders, but ignore revenue sums inside them if needed, 
      // or just keep them for "Orders Trend" calculation but don't display revenue.
      prisma.order.aggregate({
        where: { createdAt: { gte: startOfThisMonth } },
        _count: { id: true } 
      }),

      prisma.order.aggregate({
        where: { createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } },
        _count: { id: true }
      }),

      prisma.order.findMany({
        take: 500, 
        select: { items: true },
        orderBy: { createdAt: 'desc' }
      }),

      prisma.loginActivity.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, companyName: true } } }
      })
    ]);

    // Trends Calculation (Orders Only)
    const calculateTrend = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? '+100%' : '0%';
      const percent = ((current - previous) / previous) * 100;
      return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
    };

    // Revenue Trend is now hardcoded to 0% since we removed it
    const revenueTrend = "0%"; 

    const thisMonthCount = thisMonthOrders._count.id;
    const lastMonthCount = lastMonthOrders._count.id;
    const ordersTrend = calculateTrend(thisMonthCount, lastMonthCount);

    // Graph Logic (Same as before)
    const categoryMap: Record<string, number> = {};
    graphOrdersRaw.forEach(order => {
      const items = order.items as any[];
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
        ? `${(order.items[0] as any).name} ${order.items.length > 1 ? `+${order.items.length-1}` : ''}`
        : 'No Items',
      total: Number(order.totalAmount),
      status: order.status,
      date: order.createdAt
    }));

    const activities = recentLogsRaw.map(log => ({
       // ... map logic same as before ...
      id: log.id,
      user: log.user?.name || log.email,
      action: log.status === 'SUCCESS' ? `Logged in as ${log.role}` : 'Failed login attempt',
      time: log.createdAt,
      status: log.status
    }));

    const responseData = {
      stats: { totalRevenue, totalOrders, activeCustomers, pendingOrders, revenueTrend, ordersTrend },
      graphData,
      recentOrders,
      activities
    };

    dashboardCache.set(CACHE_KEY, responseData);
    res.json(responseData);

  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
};