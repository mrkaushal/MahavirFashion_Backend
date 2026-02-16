import { Request, Response } from 'express';
import prisma from '../config/prisma';

// 1. Get All Categories
export const getCategories = async (req: Request, res: Response) => {
  try {
    // ⚡ FIX: Type assertion to handle 'string | string[] | undefined'
    const { status } = req.query as { status?: string };

    const whereClause = status ? { status: status } : {};

    const categories = await prisma.category.findMany({
      where: whereClause,
      orderBy: { name: 'asc' }
    });

    res.json(categories);
  } catch (error) {
    console.error("Get Category Error:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
};

// 2. Create Category
export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name) return res.status(400).json({ error: "Category name is required" });

    // Check Duplicate
    const existing = await prisma.category.findUnique({ where: { name } });
    if (existing) {
        return res.status(400).json({ error: "Category already exists" });
    }

    const newCategory = await prisma.category.create({
      data: { name, status: 'ACTIVE' }
    });

    res.status(201).json(newCategory);
  } catch (error) {
    console.error("Create Category Error:", error);
    res.status(500).json({ error: "Failed to create category" });
  }
};

// 3. Update Category
export const updateCategory = async (req: Request, res: Response) => {
  try {
    // ⚡ FIX: Type assertion for params
    const { id } = req.params as { id: string };
    const { name, status } = req.body;

    const updatedCategory = await prisma.category.update({
      where: { id: parseInt(id) },
      data: { 
        name, 
        status // ACTIVE or INACTIVE
      }
    });

    res.json(updatedCategory);
  } catch (error) {
    console.error("Update Category Error:", error);
    res.status(500).json({ error: "Failed to update category" });
  }
};

// 4. Delete Category
export const deleteCategory = async (req: Request, res: Response) => {
  try {
    // ⚡ FIX: Type assertion for params
    const { id } = req.params as { id: string };

    await prisma.category.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete category" });
  }
};