import { Request, Response } from 'express';
import prisma from '../config/prisma';

// Helper to check if user is Admin
// (Assumes you have the 'protect' middleware adding user to req)
const isAdmin = (req: Request) => (req as any).user?.role === 'ADMIN';

// 1. Get All Orders
export const getOrders = async (req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      take: 100, // Limit to 100 for performance
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            name: true,
            companyName: true,
            // Exclude password/sensitive info
          }
        },
        shippingDetails: true
      }
    });
    res.json(orders);
  } catch (error) {
    console.error("Get Orders Error:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
};

// 2. Create Order (With Global Toggle Check)
export const createOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { customerId, products, total } = req.body;

    // ⚡ CHECK GLOBAL SETTINGS (Enforce Admin Control)
    // Only check restriction if the user is NOT an admin.
    // (Admins can always place orders on behalf of users).
    if (!isAdmin(req)) {
      const settings = await prisma.globalSettings.findUnique({ where: { id: 1 } });
      if (settings && !settings.areOrdersEnabled) {
         res.status(403).json({ 
           error: "Ordering is currently disabled by the Administrator. Please contact support." 
         });
         return;
      }
    }

    // Generate Readable ID (Format: ORD-YYMM-XXX)
    // e.g., ORD-2401-005
    const count = await prisma.order.count();
    const dateStr = new Date().toISOString().slice(2, 7).replace('-', ''); 
    const readableId = `ORD-${dateStr}-${(count + 1).toString().padStart(3, '0')}`;

    const newOrder = await prisma.order.create({
      data: {
        readableId,
        userId: parseInt(customerId),
        items: products, // Stores JSON snapshot of items
        totalAmount: total,
        status: 'PENDING'
      }
    });

    res.status(201).json(newOrder);
  } catch (error) {
    console.error("Create Order Error:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
};

// 3. Update Status
export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { status }
    });

    res.json(updatedOrder);
  } catch (error) {
    console.error("Update Status Error:", error);
    res.status(500).json({ error: "Failed to update status" });
  }
};

// 4. Add/Update Shipping Details (Fixes Duplicates & Handles Files)
export const addShippingDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // A. Parse Text Data
    // Since we use FormData, 'entries' comes as a JSON string.
    const entriesRaw = req.body.entries;
    if (!entriesRaw) {
        res.status(400).json({ error: "No entries provided" });
        return;
    }
    const entries = JSON.parse(entriesRaw);

    // B. Get Files from Multer
    const files = (req.files as Express.Multer.File[]) || [];

    // C. Perform Atomic Transaction
    await prisma.$transaction(async (tx) => {
      
      // ⚡ STEP 1: DELETE OLD ENTRIES
      // This logic fixes the "duplicate entries" bug. We wipe the slate clean
      // for this specific order and re-save the latest state.
      await tx.shippingDetail.deleteMany({
        where: { orderId: id }
      });

      // ⚡ STEP 2: CREATE NEW ENTRIES
      for (const [index, entry] of entries.entries()) {
        
        let finalFileUrl = entry.fileUrl || ""; // Keep existing URL if valid

        // Check if a NEW file was uploaded for this index (file_0, file_1, etc.)
        const uploadedFile = files.find(f => f.fieldname === `file_${index}`);

        if (uploadedFile) {
           // Construct Local URL (Fastest Performance)
           // http://localhost:5000/uploads/1748239-invoice.pdf
           finalFileUrl = `${req.protocol}://${req.get('host')}/uploads/${uploadedFile.filename}`;
        }

        await tx.shippingDetail.create({
          data: {
            orderId: id,
            transportName: entry.transportName,
            lrNumber: entry.lrNo,
            fileUrl: finalFileUrl
          }
        });
      }

      // ⚡ STEP 3: AUTO-UPDATE STATUS
      // If shipping is added, order is logically "IN_TRANSIT" (unless already delivered)
      const currentOrder = await tx.order.findUnique({ where: { id } });
      if (currentOrder && currentOrder.status !== 'DELIVERED' && currentOrder.status !== 'CANCELLED') {
          await tx.order.update({
            where: { id },
            data: { status: 'IN_TRANSIT' }
          });
      }
    });

    res.json({ message: "Shipping details saved successfully" });

  } catch (error) {
    console.error("Shipping Save Error:", error);
    res.status(500).json({ error: "Failed to save shipping details" });
  }
};