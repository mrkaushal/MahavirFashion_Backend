import { Router } from 'express';
import { getBuyers, toggleUserStatus, updateUser, createBuyer } from '../controllers/userController';
import { protect, adminOnly } from '../middleware/authMiddleware';

const router = Router();
// 🔒 All User Management is Admin Only
router.get('/', protect, adminOnly, getBuyers);
router.post('/', protect, adminOnly, createBuyer);
router.put('/:id', protect, adminOnly, updateUser);
router.patch('/:id/status', protect, adminOnly, toggleUserStatus);
export default router;