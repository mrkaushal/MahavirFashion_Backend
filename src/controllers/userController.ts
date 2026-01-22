import { Request, Response } from 'express';
import prisma from '../config/prisma';
import bcrypt from 'bcryptjs';
import NodeCache from 'node-cache'; // ⚡ npm install node-cache

// ⚡ PERFORMANCE: Cache setup
const userCache = new NodeCache({ stdTTL: 300 }); // Cache for 5 minutes
const CACHE_KEY = 'all_buyers';

// 1. Get All Buyers (⚡ CACHED)
export const getBuyers = async (req: Request, res: Response): Promise<void> => {
  try {
    // Check Cache
    if (userCache.has(CACHE_KEY)) {
        res.json(userCache.get(CACHE_KEY));
        return;
    }

    const buyers = await prisma.user.findMany({
      where: { role: 'BUYER' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        companyName: true,
        gstNumber: true,
        address: true,
        city: true,
        state: true,
        isActive: true,
        createdAt: true
      }
    });

    // Save to Cache
    userCache.set(CACHE_KEY, buyers);

    res.json(buyers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
};

// 2. Toggle Status (Block/Unblock)
export const toggleUserStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    
    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user) {
        res.status(404).json({ error: "User not found" });
        return; 
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { isActive: !user.isActive }
    });

    // ⚡ INVALIDATE CACHE
    userCache.del(CACHE_KEY);

    res.json({ message: "Status updated", isActive: updatedUser.isActive });
  } catch (error) {
    res.status(500).json({ error: "Failed to update status" });
  }
};

// 3. Update User
export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { name, companyName, gstNumber, mobile, email, city, state, address, password } = req.body;

    let updateData: any = {
      name, companyName, gstNumber, mobile, email, city, state,
      address: address || {}
    };

    if (password && password.trim() !== "") {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    // ⚡ INVALIDATE CACHE
    userCache.del(CACHE_KEY);

    res.json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update user" });
  }
};

// 4. Create User
export const createBuyer = async (req: Request, res: Response): Promise<void> => {
    try {
        const { mobile, email, name, companyName, gstNumber, city, state, address, password } = req.body;
        
        if (!mobile || !email || !password || !name) {
             res.status(400).json({ error: "Name, Mobile, Email, and Password are required." });
             return;
        }

        const exists = await prisma.user.findFirst({
            where: { OR: [{ mobile }, { email }] }
        });

        if (exists) {
            res.status(400).json({ error: "User with this mobile or email already exists" });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = await prisma.user.create({
            data: {
                role: 'BUYER',
                mobile, email, name, companyName, gstNumber, city, state,
                address: address ? address : {},
                password: hashedPassword,
                isActive: true
            }
        });

        // ⚡ INVALIDATE CACHE
        userCache.del(CACHE_KEY);

        res.status(201).json({ message: "User created successfully", user: newUser });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to create buyer" });
    }
}