"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const orderController_1 = require("../controllers/orderController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const uploadMiddleware_1 = require("../middleware/uploadMiddleware");
const router = (0, express_1.Router)();
// 🔓 SHARED ROUTES (Controller handles Role Security)
// We remove 'adminOnly' here so Buyers can access their own data
router.get('/', authMiddleware_1.protect, orderController_1.getOrders);
router.post('/', authMiddleware_1.protect, orderController_1.createOrder);
// 🔒 ADMIN ONLY ROUTES (Status & Shipping)
// Buyers should NEVER be able to update status or shipping
router.patch('/:id/status', authMiddleware_1.protect, authMiddleware_1.adminOnly, orderController_1.updateOrderStatus);
router.post('/:id/shipping', authMiddleware_1.protect, authMiddleware_1.adminOnly, uploadMiddleware_1.upload.any(), orderController_1.addShippingDetails);
router.patch('/bulk-status', authMiddleware_1.protect, authMiddleware_1.adminOnly, orderController_1.bulkUpdateItemStatus);
router.post('/:id/review', authMiddleware_1.protect, orderController_1.addItemReview);
exports.default = router;
