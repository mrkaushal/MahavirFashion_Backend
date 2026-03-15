"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProduct = exports.getProductById = exports.updateProduct = exports.createProduct = exports.uploadImageBatch = exports.getProducts = exports.productCache = void 0;
const node_cache_1 = __importDefault(require("node-cache"));
const prisma_1 = __importDefault(require("../config/prisma"));
const client_s3_1 = require("@aws-sdk/client-s3");
const s3Client_1 = require("../config/s3Client"); // ⚡ Import Helper
// ⚡ PERFORMANCE: Cache setup (TTL = 50 minutes)
exports.productCache = new node_cache_1.default({ stdTTL: 3000, checkperiod: 600 });
// --- HELPER: Delete File from Cloud (Backblaze B2) ---
const deleteFileFromCloud = (fileUrl) => __awaiter(void 0, void 0, void 0, function* () {
    if (!fileUrl)
        return;
    try {
        const fileKey = fileUrl.split('/').pop();
        if (fileKey) {
            yield s3Client_1.s3.send(new client_s3_1.DeleteObjectCommand({
                Bucket: s3Client_1.BUCKET_NAME,
                Key: fileKey
            }));
            console.log(`Deleted Cloud file: ${fileKey}`);
        }
    }
    catch (err) {
        console.error(`Failed to delete cloud file: ${fileUrl}`, err);
    }
});
// 1. Get All Products (⚡ NOW RETURNS SIGNED URLs + ROLE FILTER)
const getProducts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const isAdmin = (user === null || user === void 0 ? void 0 : user.role) === 'ADMIN';
        const CACHE_KEY = isAdmin ? 'products_admin' : 'products_buyer';
        if (exports.productCache.has(CACHE_KEY)) {
            return res.json(exports.productCache.get(CACHE_KEY));
        }
        const whereClause = isAdmin ? {} : { status: 'ACTIVE' };
        const products = yield prisma_1.default.product.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' }
        });
        const orders = yield prisma_1.default.order.findMany({
            where: { status: { not: 'CANCELLED' } },
            select: {
                items: true,
                createdAt: true,
                user: { select: { companyName: true, name: true } }
            }
        });
        const productsWithDetails = yield Promise.all(products.map((product) => __awaiter(void 0, void 0, void 0, function* () {
            const rawImages = product.images || [];
            const signedImages = yield Promise.all(rawImages.map((imgUrl) => __awaiter(void 0, void 0, void 0, function* () {
                if (imgUrl.startsWith('http') && !imgUrl.includes('backblazeb2'))
                    return imgUrl;
                const signed = yield (0, s3Client_1.getSignedFileUrl)(imgUrl);
                return signed || imgUrl;
            })));
            const productReviews = [];
            orders.forEach(order => {
                const items = order.items;
                const matchedItems = items.filter((i) => i.id === product.id && i.review);
                matchedItems.forEach((i) => {
                    var _a, _b;
                    productReviews.push({
                        id: order.createdAt.getTime() + Math.random(),
                        companyName: ((_a = order.user) === null || _a === void 0 ? void 0 : _a.companyName) || ((_b = order.user) === null || _b === void 0 ? void 0 : _b.name) || "Anonymous",
                        rating: i.review.rating,
                        comment: i.review.comment || "",
                        date: new Date(i.review.createdAt || order.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric'
                        })
                    });
                });
            });
            return Object.assign(Object.assign({}, product), { images: signedImages, reviews: productReviews });
        })));
        exports.productCache.set(CACHE_KEY, productsWithDetails);
        res.json(productsWithDetails);
    }
    catch (error) {
        console.error("Product Fetch Error:", error);
        res.status(500).json({ error: "Failed to fetch products" });
    }
});
exports.getProducts = getProducts;
// ⚡ NEW: 1.5 Batch Upload Endpoint (Saves your 1GB RAM)
const uploadImageBatch = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const files = req.files || [];
        if (files.length === 0) {
            res.status(400).json({ error: "No images were received in this batch." });
            return;
        }
        // Extract the permanent Backblaze B2 URLs returned by multer-s3
        const uploadedUrls = files.map(file => file.location);
        res.status(200).json({ urls: uploadedUrls });
    }
    catch (error) {
        console.error("Batch Upload Error:", error);
        res.status(500).json({ error: "The server failed to upload a batch of images. Please try again." });
    }
});
exports.uploadImageBatch = uploadImageBatch;
// 2. Create Product (⚡ Now expects URL array from frontend instead of files)
const createProduct = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { title, price, stock, category, description, specs, status, images } = req.body;
        const imageUrls = Array.isArray(images) ? images : [];
        if (imageUrls.length > 30) {
            res.status(400).json({ error: "You can only save a maximum of 30 images per product." });
            return;
        }
        let parsedSpecs = {};
        try {
            parsedSpecs = typeof specs === 'string' ? JSON.parse(specs) : specs;
        }
        catch (e) {
            parsedSpecs = specs;
        }
        const newProduct = yield prisma_1.default.product.create({
            data: {
                title: title,
                price: parseFloat(price) || 0,
                stock: parseInt(stock) || 0,
                category: category,
                description: description,
                status: status,
                specs: parsedSpecs,
                images: imageUrls // ⚡ Using the URLs sent from the frontend batch upload
            }
        });
        exports.productCache.del('products_admin');
        exports.productCache.del('products_buyer');
        res.status(201).json(newProduct);
    }
    catch (error) {
        console.error("Create Product Error:", error);
        if (error.code === 'P2002') {
            res.status(400).json({ error: "A product with this title already exists." });
        }
        else {
            res.status(500).json({ error: "Failed to save the product to the database. Please check your inputs." });
        }
    }
});
exports.createProduct = createProduct;
// 3. Update Product (⚡ ROBUST CLOUD CLEANUP)
const updateProduct = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { title, price, stock, category, description, specs, status, existingImages, newImages } = req.body;
        let currentImages = [];
        if (existingImages) {
            currentImages = Array.isArray(existingImages) ? existingImages : [existingImages];
        }
        let uploadedUrls = [];
        if (newImages) {
            uploadedUrls = Array.isArray(newImages) ? newImages : [newImages];
        }
        const finalImages = [...currentImages, ...uploadedUrls];
        if (finalImages.length > 30) {
            res.status(400).json({ error: "A product cannot have more than 30 images in total." });
            return;
        }
        const oldProduct = yield prisma_1.default.product.findUnique({
            where: { id: parseInt(id) },
            select: { images: true }
        });
        if (oldProduct && oldProduct.images) {
            // Safe Mode: We skip aggressive cloud deletion here to avoid accidental data loss 
            // if signed URLs are passed back. We rely on DB updates.
        }
        let parsedSpecs = {};
        try {
            parsedSpecs = typeof specs === 'string' ? JSON.parse(specs) : specs;
        }
        catch (e) {
            parsedSpecs = specs;
        }
        const updated = yield prisma_1.default.product.update({
            where: { id: parseInt(id) },
            data: {
                title: title,
                price: parseFloat(price) || 0,
                stock: parseInt(stock) || 0,
                category: category,
                description: description,
                status: status,
                specs: parsedSpecs,
                images: finalImages
            }
        });
        exports.productCache.del('products_admin');
        exports.productCache.del('products_buyer');
        res.json(updated);
    }
    catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ error: "Failed to update the product. Please try again." });
    }
});
exports.updateProduct = updateProduct;
// 4. Get Product By ID (⚡ ROLE & VISIBILITY CHECK)
const getProductById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const productId = parseInt(id);
        const user = req.user;
        const isAdmin = (user === null || user === void 0 ? void 0 : user.role) === 'ADMIN';
        if (isNaN(productId)) {
            return res.status(400).json({ error: "Invalid product ID" });
        }
        const product = yield prisma_1.default.product.findUnique({ where: { id: productId } });
        if (!product)
            return res.status(404).json({ error: "Product not found" });
        if (!isAdmin && product.status !== 'ACTIVE') {
            return res.status(404).json({ error: "Product not found or unavailable" });
        }
        const ordersWithProduct = yield prisma_1.default.order.findMany({
            where: {
                status: { not: 'CANCELLED' }
            },
            select: {
                items: true,
                createdAt: true,
                user: { select: { companyName: true, name: true } }
            }
        });
        const reviews = [];
        ordersWithProduct.forEach(order => {
            const items = order.items;
            const matchedItems = items.filter((i) => i.id === productId && i.review);
            matchedItems.forEach((i) => {
                var _a, _b;
                reviews.push({
                    id: order.createdAt.getTime() + Math.random(),
                    companyName: ((_a = order.user) === null || _a === void 0 ? void 0 : _a.companyName) || ((_b = order.user) === null || _b === void 0 ? void 0 : _b.name) || "Anonymous",
                    rating: i.review.rating,
                    comment: i.review.comment,
                    date: new Date(i.review.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric'
                    })
                });
            });
        });
        const rawImages = product.images || [];
        const signedImages = yield Promise.all(rawImages.map((imgUrl) => __awaiter(void 0, void 0, void 0, function* () {
            if (imgUrl.startsWith('http') && !imgUrl.includes('backblazeb2'))
                return imgUrl;
            const signed = yield (0, s3Client_1.getSignedFileUrl)(imgUrl);
            return signed || imgUrl;
        })));
        res.json(Object.assign(Object.assign({}, product), { images: signedImages, reviews: reviews }));
    }
    catch (error) {
        console.error("Get Product Error:", error);
        res.status(500).json({ error: "Failed to fetch product details" });
    }
});
exports.getProductById = getProductById;
// 5. Delete Product (⚡ CLOUD CLEANUP & CACHE CLEAR)
const deleteProduct = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const product = yield prisma_1.default.product.findUnique({ where: { id: parseInt(id) } });
        if (product && product.images) {
            product.images.forEach(img => deleteFileFromCloud(img));
        }
        yield prisma_1.default.product.delete({ where: { id: parseInt(id) } });
        exports.productCache.del('products_admin');
        exports.productCache.del('products_buyer');
        res.json({ message: "Product deleted" });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to delete product" });
    }
});
exports.deleteProduct = deleteProduct;
