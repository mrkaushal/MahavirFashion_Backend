import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import NodeCache from 'node-cache'; // ⚡ NEW: Install 'npm install node-cache'
import prisma from '../config/prisma';

// ⚡ PERFORMANCE: Cache setup (TTL = 5 minutes)
const productCache = new NodeCache({ stdTTL: 300 }); 
const CACHE_KEY_PRODUCTS = 'all_products';

// Helper: Delete file from disk
const deleteFileFromDisk = (fileUrl: string) => {
  if (!fileUrl) return;
  try {
    const filename = fileUrl.split('/uploads/')[1];
    if (filename) {
      const filePath = path.join(__dirname, '../uploads', filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("File delete error:", err);
  }
};

// 1. Get All Products (⚡ CACHED)
export const getProducts = async (req: Request, res: Response) => {
  try {
    // Check Cache
    if (productCache.has(CACHE_KEY_PRODUCTS)) {
       return res.json(productCache.get(CACHE_KEY_PRODUCTS));
    }

    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' }
    });

    // Save to Cache
    productCache.set(CACHE_KEY_PRODUCTS, products);
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch products" });
  }
};

// 2. Create Product
export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    const { title, price, stock, category, description, specs, status } = req.body;
    
    const imageUrls = files.map(file => `${req.protocol}://${req.get('host')}/uploads/${file.filename}`);

    // Parse specs safely
    let parsedSpecs = {};
    try { parsedSpecs = JSON.parse(specs); } catch(e) { parsedSpecs = specs; }

    const newProduct = await prisma.product.create({
      data: {
        title,
        price: parseFloat(price),
        stock: parseInt(stock),
        category,
        description,
        status,
        specs: parsedSpecs,
        images: imageUrls
      }
    });

    // ⚡ Clear Cache on Change
    productCache.del(CACHE_KEY_PRODUCTS);

    res.status(201).json(newProduct);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create product" });
  }
};

// 3. Update Product (⚡ FIX + CLEANUP)
export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const files = (req.files as Express.Multer.File[]) || [];
    const { title, price, stock, category, description, specs, status, existingImages } = req.body;

    // 1. Generate URLs for NEW images
    const newImageUrls = files.map(file => `${req.protocol}://${req.get('host')}/uploads/${file.filename}`);

    // 2. Normalize Existing Images (Handle single/multiple/empty)
    let currentImages: string[] = [];
    if (existingImages) {
        currentImages = Array.isArray(existingImages) ? existingImages : [existingImages];
    }

    // 3. ⚡ CLEANUP: Find images that were removed and delete them from disk
    const oldProduct = await prisma.product.findUnique({ 
        where: { id: parseInt(id) },
        select: { images: true }
    });

    if (oldProduct && oldProduct.images) {
        // Files in DB that are NOT in the 'currentImages' list from frontend
        const imagesToDelete = oldProduct.images.filter(img => !currentImages.includes(img));
        imagesToDelete.forEach(img => deleteFileFromDisk(img));
    }

    // 4. Combine Lists
    const finalImages = [...currentImages, ...newImageUrls];

    // 5. Parse Specs
    let parsedSpecs = {};
    try { parsedSpecs = JSON.parse(specs); } catch(e) { parsedSpecs = specs; }

    const updated = await prisma.product.update({
      where: { id: parseInt(id) },
      data: {
        title,
        price: parseFloat(price),
        stock: parseInt(stock),
        category,
        description,
        status,
        specs: parsedSpecs,
        images: finalImages
      }
    });

    // ⚡ Clear Cache on Change
    productCache.del(CACHE_KEY_PRODUCTS);

    res.json(updated);
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ error: "Failed to update product" });
  }
};

// 4. Delete Product (⚡ CLEANUP)
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Find product first to get images
    const product = await prisma.product.findUnique({ where: { id: parseInt(id) } });
    
    if (product && product.images) {
        // Delete all images from disk
        product.images.forEach(img => deleteFileFromDisk(img));
    }

    await prisma.product.delete({ where: { id: parseInt(id) } });
    
    // ⚡ Clear Cache
    productCache.del(CACHE_KEY_PRODUCTS);

    res.json({ message: "Product deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete product" });
  }
};