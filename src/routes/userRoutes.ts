import { Router } from 'express';
import { 
  getBuyers, 
  toggleUserStatus, 
  updateUser, 
  createBuyer, 
  getUserProfile,    // <--- Import
  updateUserProfile  // <--- Import
} from '../controllers/userController';
import { protect, adminOnly } from '../middleware/authMiddleware';

const router = Router();

// 🔓 Buyer/Admin Profile Routes (Must be BEFORE /:id)
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateUserProfile);

// 🔒 Admin Management Routes
router.get('/', protect, adminOnly, getBuyers);
router.post('/', protect, adminOnly, createBuyer);
router.put('/:id', protect, adminOnly, updateUser);
router.patch('/:id/status', protect, adminOnly, toggleUserStatus);

export default router;