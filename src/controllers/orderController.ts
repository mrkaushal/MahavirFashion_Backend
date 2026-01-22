import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import NodeCache from 'node-cache'; // ⚡ NEW: Caching
import prisma from '../config/prisma';

// ⚡ PERFORMANCE: Initialize Cache
// stdTTL: 60 seconds (Data stays in memory for 1 minute)
// checkperiod: 120 seconds
const orderCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });
const CACHE_KEY_ORDERS = 'all_orders';

// --- HELPER: Delete File from Disk ---
const deleteFileFromDisk = (fileUrl: string) => {
  if (!fileUrl) return;
  try {
    // Extract filename from URL (Assuming URL is http://host/uploads/filename.ext)
    const filename = fileUrl.split('/uploads/')[1];
    if (filename) {
      const filePath = path.join(__dirname, '../uploads', filename); // Adjust '../uploads' based on your folder structure
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath); // Delete file
        console.log(`Deleted old file: ${filename}`);
      }
    }
  } catch (err) {
    console.error(`Failed to delete file: ${fileUrl}`, err);
  }
};

// Helper to check Admin
const isAdmin = (req: Request) => (req as any).user?.role === 'ADMIN';

// 1. Get All Orders (⚡ CACHED)
export const getOrders = async (req: Request, res: Response) => {
  try {
    // ⚡ PERFORMANCE: Check Cache First
    if (orderCache.has(CACHE_KEY_ORDERS)) {
      console.log("Serving Orders from Cache 🚀");
      return res.json(orderCache.get(CACHE_KEY_ORDERS));
    }

    const orders = await prisma.order.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: {
        // ⚡ PERFORMANCE: Select only what you need
        user: {
          select: {
            name: true,
            companyName: true,
          }
        },
        shippingDetails: true
      }
    });

    // ⚡ PERFORMANCE: Save to Cache
    orderCache.set(CACHE_KEY_ORDERS, orders);
    
    res.json(orders);
  } catch (error) {
    console.error("Get Orders Error:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
};

// 2. Create Order
export const createOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { customerId, products, total } = req.body;

    if (!isAdmin(req)) {
      const settings = await prisma.globalSettings.findUnique({ where: { id: 1 } });
      if (settings && !settings.areOrdersEnabled) {
         res.status(403).json({ error: "Ordering is disabled." });
         return;
      }
    }

    // Generate ID
    const count = await prisma.order.count();
    const dateStr = new Date().toISOString().slice(2, 7).replace('-', ''); 
    const readableId = `ORD-${dateStr}-${(count + 1).toString().padStart(3, '0')}`;

    const newOrder = await prisma.order.create({
      data: {
        readableId,
        userId: parseInt(customerId),
        items: products, 
        totalAmount: total,
        status: 'PENDING'
      }
    });

    // ⚡ PERFORMANCE: Invalidate Cache (So new order appears immediately)
    orderCache.del(CACHE_KEY_ORDERS);

    res.status(201).json(newOrder);
  } catch (error) {
    console.error("Create Order Error:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
};

// 3. Update Status
export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string }; 
    const { status } = req.body;

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { status }
    });

    // ⚡ PERFORMANCE: Invalidate Cache
    orderCache.del(CACHE_KEY_ORDERS);

    res.json(updatedOrder);
  } catch (error) {
    console.error("Update Status Error:", error);
    res.status(500).json({ error: "Failed to update status" });
  }
};

// 4. Add/Update Shipping Details (⚡ OPTIMIZED + CLEANUP)
export const addShippingDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };

    const entriesRaw = req.body.entries;
    if (!entriesRaw) {
        res.status(400).json({ error: "No entries provided" });
        return;
    }

    const entries = JSON.parse(entriesRaw);
    const files = (req.files as Express.Multer.File[]) || [];

    await prisma.$transaction(async (tx) => {
      
      // --- STEP 1: LOGIC TO DELETE OLD FILES ---
      // Fetch existing details to find which files need deletion
      const oldDetails = await tx.shippingDetail.findMany({
        where: { orderId: id },
        select: { fileUrl: true }
      });

      // Get list of URLs that are being KEPT in the new update
      const keptUrls = entries
        .map((e: any) => e.fileUrl)
        .filter((url: string) => url && url !== "");

      // Identify files to delete from disk (Old URLs NOT in Kept URLs)
      const filesToDelete = oldDetails
        .map(d => d.fileUrl)
        .filter(url => url && !keptUrls.includes(url));

      // 🗑️ Perform Disk Deletion
      filesToDelete.forEach(url => deleteFileFromDisk(url));

      // --- STEP 2: DELETE OLD DB ENTRIES ---
      await tx.shippingDetail.deleteMany({
        where: { orderId: id }
      });

      // --- STEP 3: CREATE NEW ENTRIES (⚡ PARALLELIZED) ---
      // Prepare data array for parallel insertion
      const detailsToInsert = entries.map((entry: any, index: number) => {
        let finalFileUrl = entry.fileUrl || ""; 

        // Check if a NEW file was uploaded for this index
        const uploadedFile = files.find(f => f.fieldname === `file_${index}`);
        
        if (uploadedFile) {
           // If there was an old URL but we uploaded a new file, the old file is already
           // handled by the "filesToDelete" logic above because the old URL 
           // wouldn't match the new generated one.
           finalFileUrl = `${req.protocol}://${req.get('host')}/uploads/${uploadedFile.filename}`;
        }

        return {
          orderId: id,
          transportName: entry.transportName,
          lrNumber: entry.lrNo,
          fileUrl: finalFileUrl
        };
      });

      // Use Promise.all for faster execution than a standard for-loop await
      await Promise.all(
        detailsToInsert.map((data: any) => tx.shippingDetail.create({ data }))
      );

      // --- STEP 4: AUTO-UPDATE STATUS ---
      const currentOrder = await tx.order.findUnique({ where: { id } });
      if (currentOrder && !['DELIVERED', 'CANCELLED'].includes(currentOrder.status)) {
          await tx.order.update({
            where: { id },
            data: { status: 'IN_TRANSIT' }
          });
      }
    });

    // ⚡ PERFORMANCE: Invalidate Cache
    orderCache.del(CACHE_KEY_ORDERS);

    res.json({ message: "Shipping details saved successfully" });

  } catch (error) {
    console.error("Shipping Save Error:", error);
    res.status(500).json({ error: "Failed to save shipping details" });
  }
};