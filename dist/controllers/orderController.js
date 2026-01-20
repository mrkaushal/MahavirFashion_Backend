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
exports.addShippingDetails = exports.updateOrderStatus = exports.createOrder = exports.getOrders = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// Helper to check if user is Admin
// (Assumes you have the 'protect' middleware adding user to req)
const isAdmin = (req) => { var _a; return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) === 'ADMIN'; };
// 1. Get All Orders
const getOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const orders = yield prisma_1.default.order.findMany({
            take: 100, // Limit to 100 for performance
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: {
                        name: true,
                        companyName: true,
                        // Exclude password/sensitive info
                    }
                },
                shippingDetails: true
            }
        });
        res.json(orders);
    }
    catch (error) {
        console.error("Get Orders Error:", error);
        res.status(500).json({ error: "Failed to fetch orders" });
    }
});
exports.getOrders = getOrders;
// 2. Create Order (With Global Toggle Check)
const createOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { customerId, products, total } = req.body;
        // ⚡ CHECK GLOBAL SETTINGS (Enforce Admin Control)
        // Only check restriction if the user is NOT an admin.
        // (Admins can always place orders on behalf of users).
        if (!isAdmin(req)) {
            const settings = yield prisma_1.default.globalSettings.findUnique({ where: { id: 1 } });
            if (settings && !settings.areOrdersEnabled) {
                res.status(403).json({
                    error: "Ordering is currently disabled by the Administrator. Please contact support."
                });
                return;
            }
        }
        // Generate Readable ID (Format: ORD-YYMM-XXX)
        // e.g., ORD-2401-005
        const count = yield prisma_1.default.order.count();
        const dateStr = new Date().toISOString().slice(2, 7).replace('-', '');
        const readableId = `ORD-${dateStr}-${(count + 1).toString().padStart(3, '0')}`;
        const newOrder = yield prisma_1.default.order.create({
            data: {
                readableId,
                userId: parseInt(customerId),
                items: products, // Stores JSON snapshot of items
                totalAmount: total,
                status: 'PENDING'
            }
        });
        res.status(201).json(newOrder);
    }
    catch (error) {
        console.error("Create Order Error:", error);
        res.status(500).json({ error: "Failed to create order" });
    }
});
exports.createOrder = createOrder;
// 3. Update Status
const updateOrderStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // ⚡ FIX: Cast params to ensure 'id' is a string
        const { id } = req.params;
        const { status } = req.body;
        const updatedOrder = yield prisma_1.default.order.update({
            where: { id },
            data: { status }
        });
        res.json(updatedOrder);
    }
    catch (error) {
        console.error("Update Status Error:", error);
        res.status(500).json({ error: "Failed to update status" });
    }
});
exports.updateOrderStatus = updateOrderStatus;
// 4. Add/Update Shipping Details (FIXED)
const addShippingDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // ⚡ FIX: Cast params here too
        const { id } = req.params;
        const entriesRaw = req.body.entries;
        if (!entriesRaw) {
            res.status(400).json({ error: "No entries provided" });
            return;
        }
        const entries = JSON.parse(entriesRaw);
        const files = req.files || [];
        yield prisma_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            // STEP 1: DELETE OLD ENTRIES
            yield tx.shippingDetail.deleteMany({
                where: { orderId: id } // 'id' is now guaranteed string
            });
            // STEP 2: CREATE NEW ENTRIES
            for (const [index, entry] of entries.entries()) {
                let finalFileUrl = entry.fileUrl || "";
                const uploadedFile = files.find(f => f.fieldname === `file_${index}`);
                if (uploadedFile) {
                    finalFileUrl = `${req.protocol}://${req.get('host')}/uploads/${uploadedFile.filename}`;
                }
                yield tx.shippingDetail.create({
                    data: {
                        orderId: id,
                        transportName: entry.transportName,
                        lrNumber: entry.lrNo,
                        fileUrl: finalFileUrl
                    }
                });
            }
            // STEP 3: AUTO-UPDATE STATUS
            const currentOrder = yield tx.order.findUnique({ where: { id } });
            if (currentOrder && currentOrder.status !== 'DELIVERED' && currentOrder.status !== 'CANCELLED') {
                yield tx.order.update({
                    where: { id },
                    data: { status: 'IN_TRANSIT' }
                });
            }
        }));
        res.json({ message: "Shipping details saved successfully" });
    }
    catch (error) {
        console.error("Shipping Save Error:", error);
        res.status(500).json({ error: "Failed to save shipping details" });
    }
});
exports.addShippingDetails = addShippingDetails;
