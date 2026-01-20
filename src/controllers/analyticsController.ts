import { Request, Response } from 'express';
import prisma from '../config/prisma';

export const getAnalytics = async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      ordersToday,
      revenueRaw,
      logsRaw
    ] = await prisma.$transaction([
      // 1. Total Users
      prisma.user.count(),
      
      // 2. Orders Today
      prisma.order.count({
        where: { createdAt: { gte: today } }
      }),

      // 3. Revenue (This Month)
      prisma.order.aggregate({
        _sum: { totalAmount: true }
      }),

      // 4. Recent Logs (Last 20)
      prisma.loginActivity.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { companyName: true, name: true } } }
      })
    ]);

    // Format Data
    const revenue = revenueRaw._sum.totalAmount ? Number(revenueRaw._sum.totalAmount) : 0;
    
    const logs = logsRaw.map(log => ({
      id: log.id,
      // If linked to user, show Company/Name, else show Email
      user: log.user?.companyName || log.user?.name || log.email, 
      role: log.role,
      status: log.status === 'SUCCESS' ? 'Success' : 'Failed',
      time: log.createdAt // Frontend handles "2 mins ago"
    }));

    res.json({
      stats: { totalUsers, ordersToday, revenue },
      logs
    });

  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
};