import { Router } from 'express';
import { getOrders, createOrder, updateOrderStatus, addShippingDetails } from '../controllers/orderController';
import { protect, adminOnly } from '../middleware/authMiddleware';
import { upload } from '../middleware/uploadMiddleware'; // ⚡ Import the Multer configuration

const router = Router();

// 🔒 Locked Routes
router.get('/', protect, adminOnly, getOrders);
router.post('/', protect, adminOnly, createOrder);
router.patch('/:id/status', protect, adminOnly, updateOrderStatus);

// ⚡ FIX: Add 'upload.any()' middleware.
// This allows the route to accept both Text Data (JSON) and Files (Bills/Invoices).
router.post('/:id/shipping', protect, adminOnly, upload.any(), addShippingDetails);

export default router;