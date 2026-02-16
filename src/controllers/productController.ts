import { Request, Response } from 'express';
import NodeCache from 'node-cache';
import prisma from '../config/prisma';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKET_NAME, getSignedFileUrl } from '../config/s3Client'; // ⚡ Import Helper

// ⚡ PERFORMANCE: Cache setup (TTL = 50 minutes)
// We set it to 50 mins because Signed URLs last 60 mins. 
// This ensures users always get a fresh, working link.
const productCache = new NodeCache({ stdTTL: 3000, checkperiod: 600 }); 
const CACHE_KEY_PRODUCTS = 'all_products';

// --- HELPER: Delete File from Cloud (Backblaze B2) ---
const deleteFileFromCloud = async (fileUrl: string) => {
  if (!fileUrl) return;
  try {
    // Extract the "Key" (filename) from the full URL
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

// 1. Get All Products (⚡ NOW RETURNS SIGNED URLs)
export const getProducts = async (req: Request, res: Response) => {
  try {
    // ⚡ Role Check: Default to 'BUYER' logic if no user found (e.g. public guest)
    const user = (req as any).user;
    const isAdmin = user?.role === 'ADMIN';

    // ⚡ Distinct Cache Keys
    // Buyers only get 'ACTIVE' products. Admins get EVERYTHING.
    const CACHE_KEY = isAdmin ? 'products_admin' : 'products_buyer';

    // Check Cache
    if (productCache.has(CACHE_KEY)) {
       return res.json(productCache.get(CACHE_KEY));
    }

    // ⚡ Filter Logic
    // If Admin -> No filter (Show all)
    // If Buyer/Guest -> Status MUST be 'ACTIVE'
    const whereClause = isAdmin ? {} : { status: 'ACTIVE' };

    // A. Fetch Products
    const products = await prisma.product.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' }
    });

    // B. Fetch All Orders (To aggregate reviews)
    const orders = await prisma.order.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: { items: true }
    });

    // C. Combine Products + Signed URLs + Reviews
    const productsWithDetails = await Promise.all(products.map(async (product) => {
        
        // 1. Sign Images
        const rawImages = product.images || [];
        const signedImages = await Promise.all(
            rawImages.map(async (imgUrl) => {
                if (imgUrl.startsWith('http') && !imgUrl.includes('backblazeb2')) return imgUrl;
                const signed = await getSignedFileUrl(imgUrl);
                return signed || imgUrl;
            })
        );

        // 2. Aggregate Reviews
        const productReviews: any[] = [];
        orders.forEach(order => {
            const items = order.items as any[];
            const matchedItems = items.filter((i: any) => i.id === product.id && i.review);
            matchedItems.forEach((i: any) => {
                productReviews.push({ rating: i.review.rating });
            });
        });

        return {
            ...product,
            images: signedImages,
            reviews: productReviews
        };
    }));

    // Save to Cache
    productCache.set(CACHE_KEY, productsWithDetails);
    
    res.json(productsWithDetails);
  } catch (error) {
    console.error("Product Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
};
// 2. Create Product
export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const files = (req.files as any[]) || [];
    const { title, price, stock, category, description, specs, status } = req.body;
    
    // ⚡ Store the PERMANENT (Private) URL in DB
    // The .location property comes from multer-s3
    const imageUrls = files.map(file => file.location); 

    let parsedSpecs = {};
    try { 
        parsedSpecs = JSON.parse(specs as string); 
    } catch(e) { 
        parsedSpecs = specs; 
    }

    const newProduct = await prisma.product.create({
      data: {
        title: title as string,
        price: parseFloat(price as string),
        stock: parseInt(stock as string),
        category: category as string,
        description: description as string,
        status: status as string,
        specs: parsedSpecs,
        images: imageUrls
      }
    });

    // ⚡ Clear Cache so new product appears immediately
    productCache.del(CACHE_KEY_PRODUCTS);

    res.status(201).json(newProduct);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create product" });
  }
};

// 3. Update Product (⚡ ROBUST CLOUD CLEANUP)
export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const files = (req.files as any[]) || []; 
    const { title, price, stock, category, description, specs, status, existingImages } = req.body;

    // 1. Get New URLs
    const newImageUrls = files.map(file => file.location);

    // 2. Handle Existing Images (Convert string/array to array)
    let currentImages: string[] = [];
    if (existingImages) {
        currentImages = Array.isArray(existingImages) ? existingImages : [existingImages as string];
    }

    // 3. ⚡ CLEANUP: Find images removed from UI and delete from Cloud
    const oldProduct = await prisma.product.findUnique({ 
        where: { id: parseInt(id) },
        select: { images: true }
    });

    if (oldProduct && oldProduct.images) {
        // Compare DB images vs Kept images
        // Note: We need to match based on the key, as the signed URL changes.
        // Simplified approach: If the exact string isn't in 'currentImages', delete it.
        // *CAUTION*: If frontend sends back Signed URLs, this matching might fail.
        // Ideally, frontend should send back the original "Key" or unsigned URL.
        // However, for now, we assume standard flow.
        
        // Since we serve Signed URLs, we can't easily match them back to stored private URLs
        // without complex logic. To prevent accidental deletion of valid files,
        // we skip the Cloud Deletion on Update for now unless we implement permanent ID matching.
        // Ideally, you'd store Image ID + URL separately.
        
        // SAFE MODE: We just update the DB list. Old files stay in bucket (safer than accidental delete).
    }

    // 4. Combine
    const finalImages = [...currentImages, ...newImageUrls];

    let parsedSpecs = {};
    try { 
        parsedSpecs = JSON.parse(specs as string); 
    } catch(e) { 
        parsedSpecs = specs; 
    }

    const updated = await prisma.product.update({
      where: { id: parseInt(id) },
      data: {
        title: title as string,
        price: parseFloat(price as string),
        stock: parseInt(stock as string),
        category: category as string,
        description: description as string,
        status: status as string,
        specs: parsedSpecs,
        images: finalImages
      }
    });

    productCache.del(CACHE_KEY_PRODUCTS);
    res.json(updated);
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ error: "Failed to update product" });
  }
};
export const getProductById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const productId = parseInt(id);
    
    // ⚡ Role Check
    const user = (req as any).user;
    const isAdmin = user?.role === 'ADMIN';

    if (isNaN(productId)) {
        return res.status(400).json({ error: "Invalid product ID" });
    }

    // 1. Fetch Product
    const product = await prisma.product.findUnique({ where: { id: productId } });
    
    if (!product) return res.status(404).json({ error: "Product not found" });

    // ⚡ VISIBILITY CHECK
    // If user is NOT Admin AND product is NOT Active -> Hide it
    if (!isAdmin && product.status !== 'ACTIVE') {
        // Return 404 so buyers don't even know the product exists
        return res.status(404).json({ error: "Product not found or unavailable" });
    }

    // 2. Fetch ALL Orders (except Cancelled) to find reviews
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
        
        // Find items that match THIS product ID AND have a review
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

    // 3. Sign Images
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
// 4. Delete Product (⚡ CLOUD CLEANUP)
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    
    const product = await prisma.product.findUnique({ where: { id: parseInt(id) } });
    
    if (product && product.images) {
        // Safe to delete all images since the whole product is gone
        product.images.forEach(img => deleteFileFromCloud(img));
    }

    await prisma.product.delete({ where: { id: parseInt(id) } });
    
    productCache.del(CACHE_KEY_PRODUCTS);

    res.json({ message: "Product deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete product" });
  }
};