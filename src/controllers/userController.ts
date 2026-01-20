import { Request, Response } from 'express';
import prisma from '../config/prisma';
import bcrypt from 'bcryptjs';

// 1. Get All Buyers
export const getBuyers = async (req: Request, res: Response): Promise<void> => {
  try {
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
        address: true, // JSON field
        city: true,
        state: true,
        isActive: true,
        createdAt: true
      }
    });
    res.json(buyers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
};

// 2. Toggle Status (Block/Unblock)
export const toggleUserStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    // ⚡ FIX: Explicit cast
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

    res.json({ message: "Status updated", isActive: updatedUser.isActive });
  } catch (error) {
    res.status(500).json({ error: "Failed to update status" });
  }
};

// 3. Update User (FIXED)
export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    // ⚡ FIX: Explicit cast
    const { id } = req.params as { id: string };
    
    const { name, companyName, gstNumber, mobile, email, city, state, address, password } = req.body;

    let updateData: any = {
      name,
      companyName,
      gstNumber,
      mobile,
      email,
      city,
      state,
      address: address || {}
    };

    if (password && password.trim() !== "") {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    res.json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update user" });
  }
};

// 4. Create User (Admin manually adds a buyer)
export const createBuyer = async (req: Request, res: Response): Promise<void> => {
    try {
        const { mobile, email, name, companyName, gstNumber, city, state, address, password } = req.body;
        
        // --- Validation ---
        if (!mobile || !email || !password || !name) {
             res.status(400).json({ error: "Name, Mobile, Email, and Password are required." });
             return;
        }

        // Check for duplicates
        const exists = await prisma.user.findFirst({
            where: { OR: [{ mobile }, { email }] }
        });

        if (exists) {
            res.status(400).json({ error: "User with this mobile or email already exists" });
            return;
        }

        // Hash the provided password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = await prisma.user.create({
            data: {
                role: 'BUYER',
                mobile,
                email,
                name,
                companyName,
                gstNumber,
                city,
                state,
                address: address ? address : {},
                password: hashedPassword,
                isActive: true
            }
        });

        res.status(201).json({ 
            message: "User created successfully", 
            user: newUser
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to create buyer" });
    }
}