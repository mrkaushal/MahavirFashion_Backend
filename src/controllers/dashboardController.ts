import { Request, Response } from 'express';
import NodeCache from 'node-cache'; // ⚡ Install this: npm install node-cache
import prisma from '../config/prisma';

// ⚡ PERFORMANCE: Cache dashboard data for 60 seconds
// This prevents recalculating the graph/trends on every single page refresh.
const dashboardCache = new NodeCache({ stdTTL: 60 });
const CACHE_KEY = 'dashboard_stats';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    // 1. ⚡ CHECK CACHE FIRST (Instant Return)
    if (dashboardCache.has(CACHE_KEY)) {
      // console.log("Serving Dashboard from Cache 🚀"); // Uncomment to test speed
      return res.json(dashboardCache.get(CACHE_KEY));
    }

    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    // 2. ⚡ PARALLEL DATABASE QUERIES (All in one go)
    const [
      totalOrders,
      activeCustomers,
      pendingOrders,
      totalRevenueRaw, // Moved inside transaction
      recentOrdersRaw,
      thisMonthOrders,
      lastMonthOrders,
      graphOrdersRaw,
      recentLogsRaw 
    ] = await prisma.$transaction([
      // 1. Basic Counts
      prisma.order.count(),
      prisma.user.count({ where: { role: 'BUYER', isActive: true } }),
      prisma.order.count({ where: { status: 'PENDING' } }),
      
      // 2. Total Revenue (Moved inside for speed)
      prisma.order.aggregate({ _sum: { totalAmount: true } }),

      // 3. Recent Orders Table
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { companyName: true, name: true } } }
      }),

      // 4. Trend Data (This Month)
      prisma.order.aggregate({
        where: { createdAt: { gte: startOfThisMonth } },
        _sum: { totalAmount: true },
        _count: { id: true }
      }),

      // 5. Trend Data (Last Month)
      prisma.order.aggregate({
        where: { createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } },
        _sum: { totalAmount: true },
        _count: { id: true }
      }),

      // 6. Graph Data (Heavy Query)
      prisma.order.findMany({
        take: 500, 
        select: { items: true },
        orderBy: { createdAt: 'desc' }
      }),

      // 7. Activity Logs
      prisma.loginActivity.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, companyName: true } } }
      })
    ]);

    // --- 3. CALCULATIONS (Fast Synchronous Logic) ---

    // Trends
    const calculateTrend = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? '+100%' : '0%';
      const percent = ((current - previous) / previous) * 100;
      return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
    };

    const thisMonthRev = Number(thisMonthOrders._sum.totalAmount || 0);
    const lastMonthRev = Number(lastMonthOrders._sum.totalAmount || 0);
    const revenueTrend = calculateTrend(thisMonthRev, lastMonthRev);

    const thisMonthCount = thisMonthOrders._count.id;
    const lastMonthCount = lastMonthOrders._count.id;
    const ordersTrend = calculateTrend(thisMonthCount, lastMonthCount);

    // Graph Logic (Category Map)
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
    const totalRevenue = Number(totalRevenueRaw._sum.totalAmount || 0);

    const recentOrders = recentOrdersRaw.map(order => ({
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

    // 4. ⚡ SAVE TO CACHE
    dashboardCache.set(CACHE_KEY, responseData);

    res.json(responseData);

  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
};