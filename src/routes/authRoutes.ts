import { Router } from 'express';
import { changePassword, loginStep1, requestAdminPasswordReset, resetAdminPassword, verify2FA } from '../controllers/authController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

router.post('/login', loginStep1);
router.post('/verify-2fa', verify2FA);
router.put('/change-password', protect, changePassword);

router.post('/admin/forgot-password', requestAdminPasswordReset);
router.post('/admin/reset-password', resetAdminPassword);
export default router;