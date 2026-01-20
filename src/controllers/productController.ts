import { Request, Response } from 'express';
import prisma from '../config/prisma';

// 1. Get All Products
export const getProducts = async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch products" });
  }
};

// 2. Create Product (Updated for images array)
export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    // ⚡ Multer puts files in req.files
    const files = req.files as Express.Multer.File[];
    
    // Convert specs from string (FormData sends everything as strings) back to JSON
    const { title, price, stock, category, description, specs, status } = req.body;
    
    // Generate URLs
    const imageUrls = files.map(file => `${req.protocol}://${req.get('host')}/uploads/${file.filename}`);

    const newProduct = await prisma.product.create({
      data: {
        title,
        price: parseFloat(price),
        stock: parseInt(stock),
        category,
        description,
        status,
        specs: JSON.parse(specs), // Parse the stringified JSON
        images: imageUrls // Save REAL urls, not blob
      }
    });
    res.status(201).json(newProduct);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create product" });
  }
};
// 3. Update Product (Updated for images array)
export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, price, stock, category, description, specs, status, images } = req.body;

    const updated = await prisma.product.update({
      where: { id: parseInt(id) },
      data: {
        title,
        price: parseFloat(price),
        stock: parseInt(stock),
        category,
        description,
        specs,
        status,
        images: images || []
      }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Failed to update product" });
  }
};

// 4. Delete Product (Keep same)
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.product.delete({ where: { id: parseInt(id) } });
    res.json({ message: "Product deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete product" });
  }
};