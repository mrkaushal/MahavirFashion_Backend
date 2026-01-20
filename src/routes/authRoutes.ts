import { Router } from 'express';
import { loginStep1, verify2FA } from '../controllers/authController';

const router = Router();

router.post('/login', loginStep1);
router.post('/verify-2fa', verify2FA);

export default router;