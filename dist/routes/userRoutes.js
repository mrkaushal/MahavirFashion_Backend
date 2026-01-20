"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController_1 = require("../controllers/userController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// 🔒 All User Management is Admin Only
router.get('/', authMiddleware_1.protect, authMiddleware_1.adminOnly, userController_1.getBuyers);
router.post('/', authMiddleware_1.protect, authMiddleware_1.adminOnly, userController_1.createBuyer);
router.put('/:id', authMiddleware_1.protect, authMiddleware_1.adminOnly, userController_1.updateUser);
router.patch('/:id/status', authMiddleware_1.protect, authMiddleware_1.adminOnly, userController_1.toggleUserStatus);
exports.default = router;
