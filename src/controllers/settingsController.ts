import { Request, Response } from 'express';
import prisma from '../config/prisma';

// 1. Get Settings (Auto-create if missing)
export const getSettings = async (req: Request, res: Response) => {
  try {
    let settings = await prisma.globalSettings.findUnique({ where: { id: 1 } });
    
    if (!settings) {
      settings = await prisma.globalSettings.create({
        data: { id: 1, areOrdersEnabled: true }
      });
    }
    
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch settings" });
  }
};

// 2. Update Toggle
export const updateSettings = async (req: Request, res: Response) => {
  try {
    const { areOrdersEnabled } = req.body;
    
    const settings = await prisma.globalSettings.upsert({
      where: { id: 1 },
      update: { areOrdersEnabled },
      create: { id: 1, areOrdersEnabled }
    });

    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: "Failed to update settings" });
  }
};