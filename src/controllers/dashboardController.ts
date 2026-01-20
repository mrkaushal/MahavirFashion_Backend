import { Request, Response } from 'express';
import prisma from '../config/prisma';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    // 1. Parallel Queries
    const [
      totalOrders,
      activeCustomers,
      pendingOrders,
      recentOrdersRaw,
      thisMonthOrders,
      lastMonthOrders,
      graphOrdersRaw,
      // NEW: Fetch Real Activity Logs
      recentLogsRaw 
    ] = await prisma.$transaction([
      // ... (Keep existing count queries same) ...
      prisma.order.count(),
      prisma.user.count({ where: { role: 'BUYER', isActive: true } }),
      prisma.order.count({ where: { status: 'PENDING' } }),
      
      // Recent Orders
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { companyName: true, name: true } } }
      }),

      // This Month
      prisma.order.aggregate({
        where: { createdAt: { gte: startOfThisMonth } },
        _sum: { totalAmount: true },
        _count: { id: true }
      }),

      // Last Month
      prisma.order.aggregate({
        where: { createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } },
        _sum: { totalAmount: true },
        _count: { id: true }
      }),

      // ⚡ UPDATED: Analyze last 500 orders for Graph
      prisma.order.findMany({
        take: 500, 
        select: { items: true },
        orderBy: { createdAt: 'desc' }
      }),

      // ⚡ NEW: Recent Activity Logs (Limit 6 for dashboard card)
      prisma.loginActivity.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, companyName: true } } }
      })
    ]);

    // ... (Keep existing trend calculation logic) ...
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

    // --- Graph Data ---
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

    // Total Revenue
    const totalRevenueRaw = await prisma.order.aggregate({ _sum: { totalAmount: true }});
    const totalRevenue = Number(totalRevenueRaw._sum.totalAmount || 0);

    // Format Recent Orders
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

    // ⚡ FORMAT ACTIVITIES
    const activities = recentLogsRaw.map(log => ({
      id: log.id,
      user: log.user?.name || log.email,
      action: log.status === 'SUCCESS' ? `Logged in as ${log.role}` : 'Failed login attempt',
      time: log.createdAt,
      status: log.status // SUCCESS or FAILED
    }));

    res.json({
      stats: { totalRevenue, totalOrders, activeCustomers, pendingOrders, revenueTrend, ordersTrend },
      graphData,
      recentOrders,
      activities // Sending this to frontend
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
};