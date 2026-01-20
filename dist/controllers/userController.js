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
exports.createBuyer = exports.updateUser = exports.toggleUserStatus = exports.getBuyers = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
// 1. Get All Buyers
const getBuyers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const buyers = yield prisma_1.default.user.findMany({
            where: { role: 'BUYER' },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                email: true,
                mobile: true,
                companyName: true,
                gstNumber: true,
                address: true, // JSON field
                city: true,
                state: true,
                isActive: true,
                createdAt: true
            }
        });
        res.json(buyers);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch customers" });
    }
});
exports.getBuyers = getBuyers;
// 2. Toggle Status (Block/Unblock)
const toggleUserStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // ⚡ FIX: Explicit cast
        const { id } = req.params;
        const user = yield prisma_1.default.user.findUnique({ where: { id: parseInt(id) } });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        const updatedUser = yield prisma_1.default.user.update({
            where: { id: parseInt(id) },
            data: { isActive: !user.isActive }
        });
        res.json({ message: "Status updated", isActive: updatedUser.isActive });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to update status" });
    }
});
exports.toggleUserStatus = toggleUserStatus;
// 3. Update User (FIXED)
const updateUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // ⚡ FIX: Explicit cast
        const { id } = req.params;
        const { name, companyName, gstNumber, mobile, email, city, state, address, password } = req.body;
        let updateData = {
            name,
            companyName,
            gstNumber,
            mobile,
            email,
            city,
            state,
            address: address || {}
        };
        if (password && password.trim() !== "") {
            const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
            updateData.password = hashedPassword;
        }
        const updatedUser = yield prisma_1.default.user.update({
            where: { id: parseInt(id) },
            data: updateData
        });
        res.json(updatedUser);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update user" });
    }
});
exports.updateUser = updateUser;
// 4. Create User (Admin manually adds a buyer)
const createBuyer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { mobile, email, name, companyName, gstNumber, city, state, address, password } = req.body;
        // --- Validation ---
        if (!mobile || !email || !password || !name) {
            res.status(400).json({ error: "Name, Mobile, Email, and Password are required." });
            return;
        }
        // Check for duplicates
        const exists = yield prisma_1.default.user.findFirst({
            where: { OR: [{ mobile }, { email }] }
        });
        if (exists) {
            res.status(400).json({ error: "User with this mobile or email already exists" });
            return;
        }
        // Hash the provided password
        const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
        const newUser = yield prisma_1.default.user.create({
            data: {
                role: 'BUYER',
                mobile,
                email,
                name,
                companyName,
                gstNumber,
                city,
                state,
                address: address ? address : {},
                password: hashedPassword,
                isActive: true
            }
        });
        res.status(201).json({
            message: "User created successfully",
            user: newUser
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to create buyer" });
    }
});
exports.createBuyer = createBuyer;
