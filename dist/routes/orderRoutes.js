"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const orderController_1 = require("../controllers/orderController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const uploadMiddleware_1 = require("../middleware/uploadMiddleware"); // ⚡ Import the Multer configuration
const router = (0, express_1.Router)();
// 🔒 Locked Routes
router.get('/', authMiddleware_1.protect, authMiddleware_1.adminOnly, orderController_1.getOrders);
router.post('/', authMiddleware_1.protect, authMiddleware_1.adminOnly, orderController_1.createOrder);
router.patch('/:id/status', authMiddleware_1.protect, authMiddleware_1.adminOnly, orderController_1.updateOrderStatus);
// ⚡ FIX: Add 'upload.any()' middleware.
// This allows the route to accept both Text Data (JSON) and Files (Bills/Invoices).
router.post('/:id/shipping', authMiddleware_1.protect, authMiddleware_1.adminOnly, uploadMiddleware_1.upload.any(), orderController_1.addShippingDetails);
exports.default = router;
