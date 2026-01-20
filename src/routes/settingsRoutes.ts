import { Router } from 'express';
import { getSettings, updateSettings } from '../controllers/settingsController';
import { protect, adminOnly } from '../middleware/authMiddleware';

const router = Router();

// Public read (so Buyers know if they can order), but Protected Write
router.get('/', getSettings); 
router.put('/', protect, adminOnly, updateSettings);

export default router;