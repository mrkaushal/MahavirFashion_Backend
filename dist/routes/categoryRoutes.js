"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const categoryController_1 = require("../controllers/categoryController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// 1. Get Categories (Open to all authenticated users)
// Used by: 
// - Admin (Product Creation Dropdown)
// - Buyer (Home Page Filters)
router.get('/', authMiddleware_1.protect, categoryController_1.getCategories);
// 2. Create Category (Admin Only)
router.post('/', authMiddleware_1.protect, authMiddleware_1.adminOnly, categoryController_1.createCategory);
// 3. Update Category (Admin Only - e.g., Rename or Deactivate)
router.put('/:id', authMiddleware_1.protect, authMiddleware_1.adminOnly, categoryController_1.updateCategory);
// 4. Delete Category (Admin Only)
router.delete('/:id', authMiddleware_1.protect, authMiddleware_1.adminOnly, categoryController_1.deleteCategory);
exports.default = router;
