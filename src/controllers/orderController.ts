import { Request, Response } from 'express';
import NodeCache from 'node-cache'; // ⚡ Caching
import prisma from '../config/prisma';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKET_NAME, getSignedFileUrl } from '../config/s3Client'; // ⚡ Added getSignedFileUrl
import { OrderStatus } from '@prisma/client';
import { productCache } from './productController';
// ⚡ PERFORMANCE: Initialize Cache
// stdTTL: 60 seconds (Data stays in memory for 1 minute)
const orderCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });
const CACHE_KEY_ORDERS = 'all_orders';

// --- HELPER: Delete File from Cloud (Backblaze B2) ---
const deleteFileFromCloud = async (fileUrl: string) => {
  if (!fileUrl) return;
  try {
    // Extract the "Key" (filename) from the full URL
    // URL Format: https://<endpoint>/file/<bucket>/<filename>
    // We just need the last part: <filename>
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

// Helper to check Admin
const isAdmin = (req: Request) => (req as any).user?.role === 'ADMIN';

// 1. Get Orders (⚡ SECURED + SIGNED URLs)
export const getOrders = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "Your session has expired. Please log in again." });

    const whereClause = user.role === 'BUYER' ? { userId: user.id } : {};

    if (isAdmin(req) && orderCache.has(CACHE_KEY_ORDERS)) {
       console.log("Serving Orders from Cache 🚀");
       return res.json(orderCache.get(CACHE_KEY_ORDERS));
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            name: true,
            companyName: true,
          }
        },
        shippingDetails: true
      }
    });

    const ordersWithSignedUrls = await Promise.all(orders.map(async (order) => {
        const signedShipping = await Promise.all(order.shippingDetails.map(async (detail) => {
            return {
                ...detail,
                fileUrl: await getSignedFileUrl(detail.fileUrl)
            };
        }));

        return {
            ...order,
            shippingDetails: signedShipping
        };
    }));

    if (isAdmin(req)) {
        orderCache.set(CACHE_KEY_ORDERS, ordersWithSignedUrls);
    }
    
    res.json(ordersWithSignedUrls);
  } catch (error) {
    console.error("Get Orders Error:", error);
    res.status(500).json({ error: "The server failed to fetch the orders. Please refresh the page and try again." });
  }
};
// 2. Create Order (⚡ SMART ID ASSIGNMENT + REORDER BYPASS)
export const createOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { customerId, products, total, isReorder } = req.body; 

    if (!isAdmin(req) && !isReorder) {
        const settings = await prisma.globalSettings.findUnique({ where: { id: 1 } });
        if (settings && !settings.areOrdersEnabled) {
           res.status(403).json({ error: "Ordering is currently disabled by the administrator. Please check back later." });
           return;
        }
    }

    const targetUserId = isAdmin(req) ? parseInt(customerId) : user.id;

    if (!targetUserId) {
        res.status(400).json({ error: "Please select a valid customer profile to attach to this order." });
        return;
    }

    if (!products || products.length === 0) {
        res.status(400).json({ error: "You cannot create an empty order. Please add at least one product." });
        return;
    }

    const count = await prisma.order.count();
    const dateStr = new Date().toISOString().slice(2, 7).replace('-', ''); 
    const readableId = `ORD-${dateStr}-${(count + 1).toString().padStart(3, '0')}`;

    const newOrder = await prisma.order.create({
      data: {
        readableId,
        userId: targetUserId,
        items: products, 
        totalAmount: total,
        status: 'PENDING'
      }
    });

    orderCache.del(CACHE_KEY_ORDERS);
    res.status(201).json(newOrder);
  } catch (error) {
    console.error("Create Order Error:", error);
    res.status(500).json({ error: "The database rejected the order. Please verify your product quantities and try again." });
  }
};

// 3. Update Status
export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string }; 
    const { status, itemIndex } = req.body; 

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ error: "The requested order could not be found in the system." });

    const items = order.items as any[];
    
    if (typeof itemIndex === 'number' && items[itemIndex]) {
        items[itemIndex].status = status;
    } else {
        return res.status(400).json({ error: "Invalid item selected for status update." });
    }

    const allStatuses = items.map(i => i.status || 'PENDING');
    
    let globalStatus: OrderStatus = OrderStatus.PROCESSING; 

    if (allStatuses.every(s => s === 'PENDING')) {
        globalStatus = OrderStatus.PENDING;
    } else if (allStatuses.every(s => s === 'DELIVERED')) {
        globalStatus = OrderStatus.DELIVERED;
    } else if (allStatuses.every(s => s === 'CANCELLED')) {
        globalStatus = OrderStatus.CANCELLED;
    } else if (allStatuses.some(s => s === 'IN_TRANSIT')) {
        globalStatus = OrderStatus.IN_TRANSIT;
    } else if (allStatuses.some(s => s === 'READY_TRANSPORT')) {
        globalStatus = OrderStatus.READY_TRANSPORT;
    }
    
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { 
        items: items, 
        status: globalStatus 
      }
    });

    orderCache.del(CACHE_KEY_ORDERS);
    res.json(updatedOrder);
  } catch (error) {
    console.error("Update Status Error:", error);
    res.status(500).json({ error: "Failed to save the new status to the database. Please try again." });
  }
};
// 4. Add/Update Shipping Details (⚡ OPTIMIZED FOR CLOUD)
export const addShippingDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };

    const entriesRaw = req.body.entries;
    if (!entriesRaw) {
        res.status(400).json({ error: "No shipping entries were provided." });
        return;
    }

    const entries = JSON.parse(entriesRaw);
    const files = (req.files as any[]) || [];

    await prisma.$transaction(async (tx) => {
      const oldDetails = await tx.shippingDetail.findMany({
        where: { orderId: id },
        select: { fileUrl: true }
      });

      const keptUrls = entries
        .map((e: any) => e.fileUrl)
        .filter((url: string) => url && url !== "");

      const filesToDelete = oldDetails
        .map(d => d.fileUrl)
        .filter(url => url && !keptUrls.includes(url));

      filesToDelete
  .filter((url): url is string => Boolean(url)) 
  .forEach(url => deleteFileFromCloud(url));

      await tx.shippingDetail.deleteMany({
        where: { orderId: id }
      });

      const detailsToInsert = entries.map((entry: any, index: number) => {
        let finalFileUrl = entry.fileUrl || ""; 
        const uploadedFile = files.find(f => f.fieldname === `file_${index}`);
        
        if (uploadedFile) {
           finalFileUrl = uploadedFile.location; 
        }

        return {
          orderId: id,
          merchantNumber: entry.merchantNumber, 
          fileUrl: finalFileUrl
        };
      });

      await Promise.all(
        detailsToInsert.map((data: any) => tx.shippingDetail.create({ data }))
      );

      const currentOrder = await tx.order.findUnique({ where: { id } });
      if (currentOrder && !['DELIVERED', 'CANCELLED'].includes(currentOrder.status)) {
          await tx.order.update({
            where: { id },
            data: { status: 'IN_TRANSIT' }
          });
      }
    });

    orderCache.del(CACHE_KEY_ORDERS);
    res.json({ message: "Shipping details saved successfully." });

  } catch (error) {
    console.error("Shipping Save Error:", error);
    res.status(500).json({ error: "Failed to securely save the shipping documents. Please check your file sizes and try again." });
  }
};
export const bulkUpdateItemStatus = async (req: Request, res: Response) => {
  try {
    const { updates, newStatus } = req.body; 

    if (!Array.isArray(updates) || updates.length === 0 || !newStatus) {
        return res.status(400).json({ error: "Invalid data provided. Please select items and a target status." });
    }

    const updatesByOrder: Record<string, number[]> = {};
    
    updates.forEach((u: any) => {
        if (!updatesByOrder[u.orderId]) updatesByOrder[u.orderId] = [];
        updatesByOrder[u.orderId].push(u.itemIndex);
    });

    await prisma.$transaction(async (tx) => {
        const orderIds = Object.keys(updatesByOrder);

        await Promise.all(orderIds.map(async (orderId) => {
            const indicesToUpdate = updatesByOrder[orderId];

            const order = await tx.order.findUnique({ 
                where: { id: orderId },
                select: { items: true, status: true } 
            });

            if (!order) return;

            const items = order.items as any[];
            let hasChanges = false;

            indicesToUpdate.forEach(idx => {
                if (items[idx]) {
                    items[idx].status = newStatus;
                    hasChanges = true;
                }
            });

            if (!hasChanges) return;

            const allStatuses = items.map(i => i.status || 'PENDING');
            let globalStatus: OrderStatus = OrderStatus.PROCESSING;

            if (allStatuses.every(s => s === 'PENDING')) globalStatus = OrderStatus.PENDING;
            else if (allStatuses.every(s => s === 'DELIVERED')) globalStatus = OrderStatus.DELIVERED;
            else if (allStatuses.every(s => s === 'CANCELLED')) globalStatus = OrderStatus.CANCELLED;
            else if (allStatuses.some(s => s === 'IN_TRANSIT')) globalStatus = OrderStatus.IN_TRANSIT;
            else if (allStatuses.some(s => s === 'READY_TRANSPORT')) globalStatus = OrderStatus.READY_TRANSPORT;

            await tx.order.update({
                where: { id: orderId },
                data: { items, status: globalStatus }
            });
        }));
    });

    orderCache.del(CACHE_KEY_ORDERS);
    res.json({ message: "Bulk update applied successfully." });

  } catch (error) {
    console.error("Bulk Update Error:", error);
    res.status(500).json({ error: "A database error occurred while updating multiple items. Please try again." });
  }
};
export const addItemReview = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string }; 
    const { itemIndex, rating, comment } = req.body;
    const userId = (req as any).user.id;

    const order = await prisma.order.findUnique({ where: { id } });
    
    if (!order || order.userId !== userId) {
        return res.status(403).json({ error: "You are not authorized to leave a review for this order." });
    }

    const items = order.items as any[];

    if (!items[itemIndex]) return res.status(404).json({ error: "The requested product item could not be found." });
    
    const itemStatus = items[itemIndex].status || 'PENDING';
    if (itemStatus !== 'DELIVERED') {
        return res.status(400).json({ error: "You can only leave reviews for items that have been successfully delivered." });
    }

    if (items[itemIndex].review) {
        return res.status(400).json({ error: "You have already submitted a review for this specific item." });
    }

    items[itemIndex].review = {
        rating: Math.min(5, Math.max(1, rating)), 
        comment: comment || "",
        createdAt: new Date().toISOString()
    };

    await prisma.order.update({
        where: { id },
        data: { items }
    });

    if (productCache) {
        productCache.del('products_admin');
        productCache.del('products_buyer');
    }

    res.json({ message: "Your review was submitted successfully." });

  } catch (error) {
    console.error("Review Error:", error);
    res.status(500).json({ error: "Failed to submit your review to the server. Please try again." });
  }
};