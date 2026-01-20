import { Router } from 'express';
import { getProducts, createProduct, updateProduct, deleteProduct } from '../controllers/productController';
import { upload } from '../middleware/uploadMiddleware';
import { protect, adminOnly } from '../middleware/authMiddleware';
const router = Router();

router.get('/', protect, getProducts);
router.post('/', protect, upload.array('images', 5), createProduct);
router.put('/:id', protect, updateProduct);
router.delete('/:id', protect, deleteProduct);
export default router;