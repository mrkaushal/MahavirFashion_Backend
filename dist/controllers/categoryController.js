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
exports.deleteCategory = exports.updateCategory = exports.createCategory = exports.getCategories = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// 1. Get All Categories
const getCategories = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // ⚡ FIX: Type assertion to handle 'string | string[] | undefined'
        const { status } = req.query;
        const whereClause = status ? { status: status } : {};
        const categories = yield prisma_1.default.category.findMany({
            where: whereClause,
            orderBy: { name: 'asc' }
        });
        res.json(categories);
    }
    catch (error) {
        console.error("Get Category Error:", error);
        res.status(500).json({ error: "Failed to fetch categories" });
    }
});
exports.getCategories = getCategories;
// 2. Create Category
const createCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name } = req.body;
        if (!name)
            return res.status(400).json({ error: "Category name is required" });
        // Check Duplicate
        const existing = yield prisma_1.default.category.findUnique({ where: { name } });
        if (existing) {
            return res.status(400).json({ error: "Category already exists" });
        }
        const newCategory = yield prisma_1.default.category.create({
            data: { name, status: 'ACTIVE' }
        });
        res.status(201).json(newCategory);
    }
    catch (error) {
        console.error("Create Category Error:", error);
        res.status(500).json({ error: "Failed to create category" });
    }
});
exports.createCategory = createCategory;
// 3. Update Category
const updateCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // ⚡ FIX: Type assertion for params
        const { id } = req.params;
        const { name, status } = req.body;
        const updatedCategory = yield prisma_1.default.category.update({
            where: { id: parseInt(id) },
            data: {
                name,
                status // ACTIVE or INACTIVE
            }
        });
        res.json(updatedCategory);
    }
    catch (error) {
        console.error("Update Category Error:", error);
        res.status(500).json({ error: "Failed to update category" });
    }
});
exports.updateCategory = updateCategory;
// 4. Delete Category
const deleteCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // ⚡ FIX: Type assertion for params
        const { id } = req.params;
        yield prisma_1.default.category.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: "Category deleted successfully" });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to delete category" });
    }
});
exports.deleteCategory = deleteCategory;
