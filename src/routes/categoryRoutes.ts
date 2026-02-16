import { Router } from 'express';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../controllers/categoryController';
import { protect, adminOnly } from '../middleware/authMiddleware';

const router = Router();

// 1. Get Categories (Open to all authenticated users)
// Used by: 
// - Admin (Product Creation Dropdown)
// - Buyer (Home Page Filters)
router.get('/', protect, getCategories);

// 2. Create Category (Admin Only)
router.post('/', protect, adminOnly, createCategory);

// 3. Update Category (Admin Only - e.g., Rename or Deactivate)
router.put('/:id', protect, adminOnly, updateCategory);

// 4. Delete Category (Admin Only)
router.delete('/:id', protect, adminOnly, deleteCategory);

export default router;