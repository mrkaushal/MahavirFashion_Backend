"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const productController_1 = require("../controllers/productController");
const uploadMiddleware_1 = require("../middleware/uploadMiddleware");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// ⚡ CACHING is handled in the controller, so this route is fast now
router.get('/', authMiddleware_1.protect, productController_1.getProducts);
router.get('/:id', authMiddleware_1.protect, productController_1.getProductById);
router.post('/', authMiddleware_1.protect, uploadMiddleware_1.upload.array('images', 5), productController_1.createProduct);
// ⚡ FIX: Added 'upload' middleware here. This populates req.body!
router.put('/:id', authMiddleware_1.protect, uploadMiddleware_1.upload.array('images', 5), productController_1.updateProduct);
router.post('/upload-batch', uploadMiddleware_1.upload.array('images', 5), productController_1.uploadImageBatch);
router.delete('/:id', authMiddleware_1.protect, productController_1.deleteProduct);
exports.default = router;
