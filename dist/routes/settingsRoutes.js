"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const settingsController_1 = require("../controllers/settingsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Public read (so Buyers know if they can order), but Protected Write
router.get('/', settingsController_1.getSettings);
router.put('/', authMiddleware_1.protect, authMiddleware_1.adminOnly, settingsController_1.updateSettings);
exports.default = router;
