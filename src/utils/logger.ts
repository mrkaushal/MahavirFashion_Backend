import prisma from '../config/prisma';

export const logActivity = async (email: string, status: 'SUCCESS' | 'FAILED', role?: string, userId?: number) => {
  try {
    await prisma.loginActivity.create({
      data: {
        email,
        status,
        role: role || 'GUEST',
        userId
      }
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
    // Don't crash the app if logging fails
  }
};