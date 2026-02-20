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
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // Define Query Filter based on Role
    // Buyer -> Own Orders | Admin -> All Orders
    const whereClause = user.role === 'BUYER' ? { userId: user.id } : {};

    // ⚡ Admin Cache Check (Only for Admins to keep data fresh/secure for buyers)
    // We check cache ONLY if user is Admin, because Admins see the same "All Orders" list.
    // Buyers see unique lists, so we don't cache their specific queries globally.
    if (isAdmin(req) && orderCache.has(CACHE_KEY_ORDERS)) {
       console.log("Serving Orders from Cache 🚀");
       return res.json(orderCache.get(CACHE_KEY_ORDERS));
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
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

    // ⚡ MAP OVER ORDERS TO SIGN SHIPPING FILES (Presigned URLs)
    // This makes private B2 files accessible to the frontend temporarily
    const ordersWithSignedUrls = await Promise.all(orders.map(async (order) => {
        
        // Map over shipping details to sign fileUrls
        const signedShipping = await Promise.all(order.shippingDetails.map(async (detail) => {
            return {
                ...detail,
                fileUrl: await getSignedFileUrl(detail.fileUrl) // ⚡ Sign the PDF/Image link
            };
        }));

        return {
            ...order,
            shippingDetails: signedShipping
        };
    }));

    // Cache result ONLY for Admins (Buyers have dynamic signed URLs unique to time/user)
    if (isAdmin(req)) {
        orderCache.set(CACHE_KEY_ORDERS, ordersWithSignedUrls);
    }
    
    res.json(ordersWithSignedUrls);
  } catch (error) {
    console.error("Get Orders Error:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
};

// 2. Create Order (⚡ SMART ID ASSIGNMENT + REORDER BYPASS)
export const createOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { customerId, products, total, isReorder } = req.body; // ⚡ Added isReorder flag

    // 1. Check Global Settings
    // Logic: If user is NOT Admin AND this is NOT a re-order, check if ordering is enabled.
    // This allows Re-orders to bypass the block ("isReorder" comes from frontend).
    if (!isAdmin(req) && !isReorder) {
        const settings = await prisma.globalSettings.findUnique({ where: { id: 1 } });
        if (settings && !settings.areOrdersEnabled) {
           res.status(403).json({ error: "Ordering is currently disabled." });
           return;
        }
    }

    // 2. Determine Target User ID
    // If ADMIN: Use the 'customerId' sent in body
    // If BUYER: Use the 'user.id' from the Token (ignores body for security)
    const targetUserId = isAdmin(req) ? parseInt(customerId) : user.id;

    if (!targetUserId) {
        res.status(400).json({ error: "Invalid User ID for order." });
        return;
    }

    // 3. Generate ID
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

    // ⚡ PERFORMANCE: Invalidate Cache (So Admin sees it immediately)
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
    const { status, itemIndex } = req.body; 

    // 1. Fetch current order
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return res.status(404).json({ error: "Order not found" });

    // 2. Parse Items
    const items = order.items as any[];
    
    // 3. Update Specific Item Status
    if (typeof itemIndex === 'number' && items[itemIndex]) {
        items[itemIndex].status = status;
    }

    // 4. Calculate Global Status (Auto-derived)
    const allStatuses = items.map(i => i.status || 'PENDING');
    
    // ⚡ FIX: Initialize with Enum Type
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
    
    // 5. Update DB
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { 
        items: items, 
        status: globalStatus // ⚡ Now strictly typed as OrderStatus
      }
    });

    // Invalidate Cache
    orderCache.del(CACHE_KEY_ORDERS);

    res.json(updatedOrder);
  } catch (error) {
    console.error("Update Status Error:", error);
    res.status(500).json({ error: "Failed to update status" });
  }
};
// 4. Add/Update Shipping Details (⚡ OPTIMIZED FOR CLOUD)
export const addShippingDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };

    const entriesRaw = req.body.entries;
    if (!entriesRaw) {
        res.status(400).json({ error: "No entries provided" });
        return;
    }

    const entries = JSON.parse(entriesRaw);
    // Cast to 'any' to access the .location property added by Multer S3
    const files = (req.files as any[]) || [];

    await prisma.$transaction(async (tx) => {
      
      // --- STEP 1: LOGIC TO DELETE OLD FILES FROM CLOUD ---
      // Fetch existing details to find which files need deletion
      const oldDetails = await tx.shippingDetail.findMany({
        where: { orderId: id },
        select: { fileUrl: true }
      });

      // Get list of URLs that are being KEPT in the new update
      const keptUrls = entries
        .map((e: any) => e.fileUrl)
        .filter((url: string) => url && url !== "");

      // Identify files to delete (Old URLs NOT in Kept URLs)
      const filesToDelete = oldDetails
        .map(d => d.fileUrl)
        .filter(url => url && !keptUrls.includes(url));

      // 🗑️ Perform Cloud Deletion
      filesToDelete.forEach(url => deleteFileFromCloud(url));

      // --- STEP 2: DELETE OLD DB ENTRIES ---
      await tx.shippingDetail.deleteMany({
        where: { orderId: id }
      });

      // --- STEP 3: CREATE NEW ENTRIES (⚡ PARALLELIZED) ---
      // Prepare data array for parallel insertion
      const detailsToInsert = entries.map((entry: any, index: number) => {
        let finalFileUrl = entry.fileUrl || ""; 

        // Check if a NEW file was uploaded for this index
        // Multer puts all files in one array, we need to find the one matching the fieldname
        const uploadedFile = files.find(f => f.fieldname === `file_${index}`);
        
        if (uploadedFile) {
           // ⚡ USE CLOUD URL (Backblaze/S3)
           // .location is provided by multer-s3
           finalFileUrl = uploadedFile.location; 
        }

        return {
          orderId: id,
          transportName: entry.transportName,
          lrNumber: entry.lrNo,
          fileUrl: finalFileUrl
        };
      });

      // Use Promise.all for faster execution
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
export const bulkUpdateItemStatus = async (req: Request, res: Response) => {
  try {
    const { updates, newStatus } = req.body; 
    // updates structure: [{ orderId: "uuid", itemIndex: 0 }, ...]

    if (!Array.isArray(updates) || updates.length === 0 || !newStatus) {
        return res.status(400).json({ error: "Invalid data provided" });
    }

    // ⚡ Optimization: Group updates by Order ID to minimize DB queries
    // Map: { "order_id": [index1, index2, ...] }
    const updatesByOrder: Record<string, number[]> = {};
    
    updates.forEach((u: any) => {
        if (!updatesByOrder[u.orderId]) updatesByOrder[u.orderId] = [];
        updatesByOrder[u.orderId].push(u.itemIndex);
    });

    // ⚡ Transactional Update
    await prisma.$transaction(async (tx) => {
        const orderIds = Object.keys(updatesByOrder);

        // Process each affected order
        await Promise.all(orderIds.map(async (orderId) => {
            const indicesToUpdate = updatesByOrder[orderId];

            // 1. Fetch current items
            const order = await tx.order.findUnique({ 
                where: { id: orderId },
                select: { items: true, status: true } 
            });

            if (!order) return;

            const items = order.items as any[];
            let hasChanges = false;

            // 2. Update specific items
            indicesToUpdate.forEach(idx => {
                if (items[idx]) {
                    items[idx].status = newStatus;
                    hasChanges = true;
                }
            });

            if (!hasChanges) return;

            // 3. Recalculate Global Status (Same logic as single update)
            const allStatuses = items.map(i => i.status || 'PENDING');
            let globalStatus: OrderStatus = OrderStatus.PROCESSING;

            if (allStatuses.every(s => s === 'PENDING')) globalStatus = OrderStatus.PENDING;
            else if (allStatuses.every(s => s === 'DELIVERED')) globalStatus = OrderStatus.DELIVERED;
            else if (allStatuses.every(s => s === 'CANCELLED')) globalStatus = OrderStatus.CANCELLED;
            else if (allStatuses.some(s => s === 'IN_TRANSIT')) globalStatus = OrderStatus.IN_TRANSIT;
            else if (allStatuses.some(s => s === 'READY_TRANSPORT')) globalStatus = OrderStatus.READY_TRANSPORT;

            // 4. Save
            await tx.order.update({
                where: { id: orderId },
                data: { items, status: globalStatus }
            });
        }));
    });

    // Invalidate Cache
    orderCache.del(CACHE_KEY_ORDERS);

    res.json({ message: "Bulk update successful" });

  } catch (error) {
    console.error("Bulk Update Error:", error);
    res.status(500).json({ error: "Failed to perform bulk update" });
  }
};
export const addItemReview = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string }; 
    const { itemIndex, rating, comment } = req.body;
    const userId = (req as any).user.id;

    const order = await prisma.order.findUnique({ where: { id } });
    
    if (!order || order.userId !== userId) {
        return res.status(403).json({ error: "Unauthorized or Order not found" });
    }

    const items = order.items as any[];

    if (!items[itemIndex]) return res.status(404).json({ error: "Item not found" });
    
    const itemStatus = items[itemIndex].status || 'PENDING';
    if (itemStatus !== 'DELIVERED') {
        return res.status(400).json({ error: "Can only review delivered items." });
    }

    if (items[itemIndex].review) {
        return res.status(400).json({ error: "You have already reviewed this item." });
    }

    items[itemIndex].review = {
        rating: Math.min(5, Math.max(1, rating)), 
        comment: comment || "",
        createdAt: new Date().toISOString()
    };

    // Save to DB
    await prisma.order.update({
        where: { id },
        data: { items }
    });

    // ⚡ CLEAR PRODUCT CACHE SO NEW REVIEWS SHOW INSTANTLY ON HOMEPAGE
    if (productCache) {
        productCache.del('products_admin');
        productCache.del('products_buyer');
        console.log(`[CACHE] Cleared product cache after new review for order ${id}`);
    }

    res.json({ message: "Review submitted successfully" });

  } catch (error) {
    console.error("Review Error:", error);
    res.status(500).json({ error: "Failed to submit review" });
  }
};