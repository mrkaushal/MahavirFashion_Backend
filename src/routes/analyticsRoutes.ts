import { Router } from 'express';
import { getAnalytics } from '../controllers/analyticsController';
import { protect, adminOnly } from '../middleware/authMiddleware';

const router = Router();
// 🔒 Locked: Only Admin can see analytics
router.get('/', protect, adminOnly, getAnalytics); 
export default router;