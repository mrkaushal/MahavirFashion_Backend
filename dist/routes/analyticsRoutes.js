"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const analyticsController_1 = require("../controllers/analyticsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// 🔒 Locked: Only Admin can see analytics
router.get('/', authMiddleware_1.protect, authMiddleware_1.adminOnly, analyticsController_1.getAnalytics);
exports.default = router;
