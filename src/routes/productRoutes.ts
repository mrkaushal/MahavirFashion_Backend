import { Router } from 'express';
import { getProducts, createProduct, updateProduct, deleteProduct, getProductById } from '../controllers/productController';
import { upload } from '../middleware/uploadMiddleware';
import { protect, adminOnly } from '../middleware/authMiddleware';

const router = Router();

// ⚡ CACHING is handled in the controller, so this route is fast now
router.get('/', protect, getProducts);
router.get('/:id', protect, getProductById);
router.post('/', protect, upload.array('images', 5), createProduct);

// ⚡ FIX: Added 'upload' middleware here. This populates req.body!
router.put('/:id', protect, upload.array('images', 5), updateProduct);

router.delete('/:id', protect, deleteProduct);

export default router;