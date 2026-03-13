import { Request, Response } from 'express';
import NodeCache from 'node-cache';
import prisma from '../config/prisma';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKET_NAME, getSignedFileUrl } from '../config/s3Client'; // ⚡ Import Helper

// ⚡ PERFORMANCE: Cache setup (TTL = 50 minutes)
export const productCache = new NodeCache({ stdTTL: 3000, checkperiod: 600 }); 

// --- HELPER: Delete File from Cloud (Backblaze B2) ---
const deleteFileFromCloud = async (fileUrl: string) => {
  if (!fileUrl) return;
  try {
    const fileKey = fileUrl.split('/').pop(); 
    
    if (fileKey) {
      await s3.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fileKey
      }));
      console.log(`Deleted Cloud file: ${fileKey}`);
    }
  } catch (err) {
    console.error(`Failed to delete cloud file: ${fileUrl}`, err);
  }
};

// 1. Get All Products (⚡ NOW RETURNS SIGNED URLs + ROLE FILTER)
export const getProducts = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const isAdmin = user?.role === 'ADMIN';

    const CACHE_KEY = isAdmin ? 'products_admin' : 'products_buyer';

    if (productCache.has(CACHE_KEY)) {
       return res.json(productCache.get(CACHE_KEY));
    }

    const whereClause = isAdmin ? {} : { status: 'ACTIVE' };

    const products = await prisma.product.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' }
    });

    const orders = await prisma.order.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: { 
        items: true,
        createdAt: true,
        user: { select: { companyName: true, name: true } } 
      }
    });

    const productsWithDetails = await Promise.all(products.map(async (product) => {
        const rawImages = product.images || [];
        const signedImages = await Promise.all(
            rawImages.map(async (imgUrl) => {
                if (imgUrl.startsWith('http') && !imgUrl.includes('backblazeb2')) return imgUrl;
                const signed = await getSignedFileUrl(imgUrl);
                return signed || imgUrl;
            })
        );

        const productReviews: any[] = [];
        orders.forEach(order => {
            const items = order.items as any[];
            const matchedItems = items.filter((i: any) => i.id === product.id && i.review);
            matchedItems.forEach((i: any) => {
                productReviews.push({ 
                    id: order.createdAt.getTime() + Math.random(), 
                    companyName: order.user?.companyName || order.user?.name || "Anonymous",
                    rating: i.review.rating,
                    comment: i.review.comment || "",
                    date: new Date(i.review.createdAt || order.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric'
                    })
                });
            });
        });

        return {
            ...product,
            images: signedImages,
            reviews: productReviews
        };
    }));

    productCache.set(CACHE_KEY, productsWithDetails);
    
    res.json(productsWithDetails);
  } catch (error) {
    console.error("Product Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
};

// ⚡ NEW: 1.5 Batch Upload Endpoint (Saves your 1GB RAM)
export const uploadImageBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const files = (req.files as any[]) || [];
    if (files.length === 0) {
        res.status(400).json({ error: "No images were received in this batch." });
        return;
    }
    
    // Extract the permanent Backblaze B2 URLs returned by multer-s3
    const uploadedUrls = files.map(file => file.location);
    
    res.status(200).json({ urls: uploadedUrls });
  } catch (error) {
    console.error("Batch Upload Error:", error);
    res.status(500).json({ error: "The server failed to upload a batch of images. Please try again." });
  }
};

// 2. Create Product (⚡ Now expects URL array from frontend instead of files)
export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, price, stock, category, description, specs, status, images } = req.body;
    
    const imageUrls = Array.isArray(images) ? images : [];
    
    if (imageUrls.length > 30) {
        res.status(400).json({ error: "You can only save a maximum of 30 images per product." });
        return;
    }

    let parsedSpecs = {};
    try { 
        parsedSpecs = typeof specs === 'string' ? JSON.parse(specs) : specs;
    } catch(e) { 
        parsedSpecs = specs; 
    }

    const newProduct = await prisma.product.create({
      data: {
        title: title as string,
        price: parseFloat(price as string) || 0,
        stock: parseInt(stock as string) || 0,
        category: category as string,
        description: description as string,
        status: status as string,
        specs: parsedSpecs,
        images: imageUrls // ⚡ Using the URLs sent from the frontend batch upload
      }
    });

    productCache.del('products_admin');
    productCache.del('products_buyer');

    res.status(201).json(newProduct);
  } catch (error: any) {
    console.error("Create Product Error:", error);
    if (error.code === 'P2002') {
        res.status(400).json({ error: "A product with this title already exists." });
    } else {
        res.status(500).json({ error: "Failed to save the product to the database. Please check your inputs." });
    }
  }
};

// 3. Update Product (⚡ ROBUST CLOUD CLEANUP)
export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { title, price, stock, category, description, specs, status, existingImages, newImages } = req.body;

    let currentImages: string[] = [];
    if (existingImages) {
        currentImages = Array.isArray(existingImages) ? existingImages : [existingImages as string];
    }
    
    let uploadedUrls: string[] = [];
    if (newImages) {
        uploadedUrls = Array.isArray(newImages) ? newImages : [newImages as string];
    }

    const finalImages = [...currentImages, ...uploadedUrls];

    if (finalImages.length > 30) {
        res.status(400).json({ error: "A product cannot have more than 30 images in total." });
        return;
    }

    const oldProduct = await prisma.product.findUnique({ 
        where: { id: parseInt(id) },
        select: { images: true }
    });

    if (oldProduct && oldProduct.images) {
        // Safe Mode: We skip aggressive cloud deletion here to avoid accidental data loss 
        // if signed URLs are passed back. We rely on DB updates.
    }

    let parsedSpecs = {};
    try { 
        parsedSpecs = typeof specs === 'string' ? JSON.parse(specs) : specs;
    } catch(e) { 
        parsedSpecs = specs; 
    }

    const updated = await prisma.product.update({
      where: { id: parseInt(id) },
      data: {
        title: title as string,
        price: parseFloat(price as string) || 0,
        stock: parseInt(stock as string) || 0,
        category: category as string,
        description: description as string,
        status: status as string,
        specs: parsedSpecs,
        images: finalImages
      }
    });

    productCache.del('products_admin');
    productCache.del('products_buyer');

    res.json(updated);
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ error: "Failed to update the product. Please try again." });
  }
};

// 4. Get Product By ID (⚡ ROLE & VISIBILITY CHECK)
export const getProductById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const productId = parseInt(id);
    
    const user = (req as any).user;
    const isAdmin = user?.role === 'ADMIN';

    if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    
    if (!product) return res.status(404).json({ error: "Product not found" });

    if (!isAdmin && product.status !== 'ACTIVE') {
        return res.status(404).json({ error: "Product not found or unavailable" });
    }

    const ordersWithProduct = await prisma.order.findMany({
      where: { 
        status: { not: 'CANCELLED' } 
      },
      select: { 
        items: true, 
        createdAt: true,
        user: { select: { companyName: true, name: true } }
      }
    });

    const reviews: any[] = [];

    ordersWithProduct.forEach(order => {
        const items = order.items as any[];
        const matchedItems = items.filter((i: any) => i.id === productId && i.review);
        
        matchedItems.forEach((i: any) => {
            reviews.push({
                id: order.createdAt.getTime() + Math.random(), 
                companyName: order.user?.companyName || order.user?.name || "Anonymous",
                rating: i.review.rating,
                comment: i.review.comment,
                date: new Date(i.review.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric'
                })
            });
        });
    });

    const rawImages = product.images || [];
    const signedImages = await Promise.all(
        rawImages.map(async (imgUrl) => {
            if (imgUrl.startsWith('http') && !imgUrl.includes('backblazeb2')) return imgUrl;
            const signed = await getSignedFileUrl(imgUrl);
            return signed || imgUrl;
        })
    );

    res.json({
        ...product,
        images: signedImages,
        reviews: reviews 
    });

  } catch (error) {
    console.error("Get Product Error:", error);
    res.status(500).json({ error: "Failed to fetch product details" });
  }
};

// 5. Delete Product (⚡ CLOUD CLEANUP & CACHE CLEAR)
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    
    const product = await prisma.product.findUnique({ where: { id: parseInt(id) } });
    
    if (product && product.images) {
        product.images.forEach(img => deleteFileFromCloud(img));
    }

    await prisma.product.delete({ where: { id: parseInt(id) } });
    
    productCache.del('products_admin');
    productCache.del('products_buyer');

    res.json({ message: "Product deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete product" });
  }
};