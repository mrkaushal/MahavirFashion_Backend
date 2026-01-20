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
exports.deleteProduct = exports.updateProduct = exports.createProduct = exports.getProducts = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// 1. Get All Products
const getProducts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const products = yield prisma_1.default.product.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(products);
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch products" });
    }
});
exports.getProducts = getProducts;
// 2. Create Product (Updated for images array)
const createProduct = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // ⚡ Multer puts files in req.files
        const files = req.files;
        // Convert specs from string (FormData sends everything as strings) back to JSON
        const { title, price, stock, category, description, specs, status } = req.body;
        // Generate URLs
        const imageUrls = files.map(file => `${req.protocol}://${req.get('host')}/uploads/${file.filename}`);
        const newProduct = yield prisma_1.default.product.create({
            data: {
                title,
                price: parseFloat(price),
                stock: parseInt(stock),
                category,
                description,
                status,
                specs: JSON.parse(specs), // Parse the stringified JSON
                images: imageUrls // Save REAL urls, not blob
            }
        });
        res.status(201).json(newProduct);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to create product" });
    }
});
exports.createProduct = createProduct;
// 3. Update Product (Updated for images array)
const updateProduct = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // ⚡ FIX: Explicit cast
        const { id } = req.params;
        const { title, price, stock, category, description, specs, status, images } = req.body;
        const updated = yield prisma_1.default.product.update({
            where: { id: parseInt(id) }, // parseInt is now happy
            data: {
                title,
                price: parseFloat(price),
                stock: parseInt(stock),
                category,
                description,
                specs,
                status,
                images: images || []
            }
        });
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: "Failed to update product" });
    }
});
exports.updateProduct = updateProduct;
// 4. Delete Product (FIXED)
const deleteProduct = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // ⚡ FIX: Explicit cast
        const { id } = req.params;
        yield prisma_1.default.product.delete({ where: { id: parseInt(id) } });
        res.json({ message: "Product deleted" });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to delete product" });
    }
});
exports.deleteProduct = deleteProduct;
