import { Router } from 'express';
import { getOrders, createOrder, updateOrderStatus, addShippingDetails } from '../controllers/orderController';
import { protect, adminOnly } from '../middleware/authMiddleware';
import { upload } from '../middleware/uploadMiddleware'; 

const router = Router();

// 🔓 SHARED ROUTES (Controller handles Role Security)
// We remove 'adminOnly' here so Buyers can access their own data
router.get('/', protect, getOrders); 
router.post('/', protect, createOrder);

// 🔒 ADMIN ONLY ROUTES (Status & Shipping)
// Buyers should NEVER be able to update status or shipping
router.patch('/:id/status', protect, adminOnly, updateOrderStatus);
router.post('/:id/shipping', protect, adminOnly, upload.any(), addShippingDetails);

export default router;