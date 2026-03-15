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
exports.addItemReview = exports.bulkUpdateItemStatus = exports.addShippingDetails = exports.updateOrderStatus = exports.createOrder = exports.getOrders = void 0;
const node_cache_1 = __importDefault(require("node-cache")); // ⚡ Caching
const prisma_1 = __importDefault(require("../config/prisma"));
const client_s3_1 = require("@aws-sdk/client-s3");
const s3Client_1 = require("../config/s3Client"); // ⚡ Added getSignedFileUrl
const client_1 = require("@prisma/client");
const productController_1 = require("./productController");
// ⚡ PERFORMANCE: Initialize Cache
// stdTTL: 60 seconds (Data stays in memory for 1 minute)
const orderCache = new node_cache_1.default({ stdTTL: 60, checkperiod: 120 });
const CACHE_KEY_ORDERS = 'all_orders';
// --- HELPER: Delete File from Cloud (Backblaze B2) ---
const deleteFileFromCloud = (fileUrl) => __awaiter(void 0, void 0, void 0, function* () {
    if (!fileUrl)
        return;
    try {
        // Extract the "Key" (filename) from the full URL
        // URL Format: https://<endpoint>/file/<bucket>/<filename>
        // We just need the last part: <filename>
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
// Helper to check Admin
const isAdmin = (req) => { var _a; return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) === 'ADMIN'; };
// 1. Get Orders (⚡ SECURED + SIGNED URLs)
const getOrders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: "Your session has expired. Please log in again." });
        const whereClause = user.role === 'BUYER' ? { userId: user.id } : {};
        if (isAdmin(req) && orderCache.has(CACHE_KEY_ORDERS)) {
            console.log("Serving Orders from Cache 🚀");
            return res.json(orderCache.get(CACHE_KEY_ORDERS));
        }
        const orders = yield prisma_1.default.order.findMany({
            where: whereClause,
            take: 100,
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: {
                        name: true,
                        companyName: true,
                    }
                },
                shippingDetails: true
            }
        });
        const ordersWithSignedUrls = yield Promise.all(orders.map((order) => __awaiter(void 0, void 0, void 0, function* () {
            const signedShipping = yield Promise.all(order.shippingDetails.map((detail) => __awaiter(void 0, void 0, void 0, function* () {
                return Object.assign(Object.assign({}, detail), { fileUrl: yield (0, s3Client_1.getSignedFileUrl)(detail.fileUrl) });
            })));
            return Object.assign(Object.assign({}, order), { shippingDetails: signedShipping });
        })));
        if (isAdmin(req)) {
            orderCache.set(CACHE_KEY_ORDERS, ordersWithSignedUrls);
        }
        res.json(ordersWithSignedUrls);
    }
    catch (error) {
        console.error("Get Orders Error:", error);
        res.status(500).json({ error: "The server failed to fetch the orders. Please refresh the page and try again." });
    }
});
exports.getOrders = getOrders;
// 2. Create Order (⚡ SMART ID ASSIGNMENT + REORDER BYPASS)
const createOrder = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const { customerId, products, total, isReorder } = req.body;
        if (!isAdmin(req) && !isReorder) {
            const settings = yield prisma_1.default.globalSettings.findUnique({ where: { id: 1 } });
            if (settings && !settings.areOrdersEnabled) {
                res.status(403).json({ error: "Ordering is currently disabled by the administrator. Please check back later." });
                return;
            }
        }
        const targetUserId = isAdmin(req) ? parseInt(customerId) : user.id;
        if (!targetUserId) {
            res.status(400).json({ error: "Please select a valid customer profile to attach to this order." });
            return;
        }
        if (!products || products.length === 0) {
            res.status(400).json({ error: "You cannot create an empty order. Please add at least one product." });
            return;
        }
        const count = yield prisma_1.default.order.count();
        const dateStr = new Date().toISOString().slice(2, 7).replace('-', '');
        const readableId = `ORD-${dateStr}-${(count + 1).toString().padStart(3, '0')}`;
        const newOrder = yield prisma_1.default.order.create({
            data: {
                readableId,
                userId: targetUserId,
                items: products,
                totalAmount: total,
                status: 'PENDING'
            }
        });
        orderCache.del(CACHE_KEY_ORDERS);
        res.status(201).json(newOrder);
    }
    catch (error) {
        console.error("Create Order Error:", error);
        res.status(500).json({ error: "The database rejected the order. Please verify your product quantities and try again." });
    }
});
exports.createOrder = createOrder;
// 3. Update Status
const updateOrderStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { status, itemIndex } = req.body;
        const order = yield prisma_1.default.order.findUnique({ where: { id } });
        if (!order)
            return res.status(404).json({ error: "The requested order could not be found in the system." });
        const items = order.items;
        if (typeof itemIndex === 'number' && items[itemIndex]) {
            items[itemIndex].status = status;
        }
        else {
            return res.status(400).json({ error: "Invalid item selected for status update." });
        }
        const allStatuses = items.map(i => i.status || 'PENDING');
        let globalStatus = client_1.OrderStatus.PROCESSING;
        if (allStatuses.every(s => s === 'PENDING')) {
            globalStatus = client_1.OrderStatus.PENDING;
        }
        else if (allStatuses.every(s => s === 'DELIVERED')) {
            globalStatus = client_1.OrderStatus.DELIVERED;
        }
        else if (allStatuses.every(s => s === 'CANCELLED')) {
            globalStatus = client_1.OrderStatus.CANCELLED;
        }
        else if (allStatuses.some(s => s === 'IN_TRANSIT')) {
            globalStatus = client_1.OrderStatus.IN_TRANSIT;
        }
        else if (allStatuses.some(s => s === 'READY_TRANSPORT')) {
            globalStatus = client_1.OrderStatus.READY_TRANSPORT;
        }
        const updatedOrder = yield prisma_1.default.order.update({
            where: { id },
            data: {
                items: items,
                status: globalStatus
            }
        });
        orderCache.del(CACHE_KEY_ORDERS);
        res.json(updatedOrder);
    }
    catch (error) {
        console.error("Update Status Error:", error);
        res.status(500).json({ error: "Failed to save the new status to the database. Please try again." });
    }
});
exports.updateOrderStatus = updateOrderStatus;
// 4. Add/Update Shipping Details (⚡ OPTIMIZED FOR CLOUD)
const addShippingDetails = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const entriesRaw = req.body.entries;
        if (!entriesRaw) {
            res.status(400).json({ error: "No shipping entries were provided." });
            return;
        }
        const entries = JSON.parse(entriesRaw);
        const files = req.files || [];
        yield prisma_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const oldDetails = yield tx.shippingDetail.findMany({
                where: { orderId: id },
                select: { fileUrl: true }
            });
            const keptUrls = entries
                .map((e) => e.fileUrl)
                .filter((url) => url && url !== "");
            const filesToDelete = oldDetails
                .map(d => d.fileUrl)
                .filter(url => url && !keptUrls.includes(url));
            filesToDelete
                .filter((url) => Boolean(url))
                .forEach(url => deleteFileFromCloud(url));
            yield tx.shippingDetail.deleteMany({
                where: { orderId: id }
            });
            const detailsToInsert = entries.map((entry, index) => {
                let finalFileUrl = entry.fileUrl || "";
                const uploadedFile = files.find(f => f.fieldname === `file_${index}`);
                if (uploadedFile) {
                    finalFileUrl = uploadedFile.location;
                }
                return {
                    orderId: id,
                    merchantNumber: entry.merchantNumber,
                    fileUrl: finalFileUrl
                };
            });
            yield Promise.all(detailsToInsert.map((data) => tx.shippingDetail.create({ data })));
            const currentOrder = yield tx.order.findUnique({ where: { id } });
            if (currentOrder && !['DELIVERED', 'CANCELLED'].includes(currentOrder.status)) {
                yield tx.order.update({
                    where: { id },
                    data: { status: 'IN_TRANSIT' }
                });
            }
        }));
        orderCache.del(CACHE_KEY_ORDERS);
        res.json({ message: "Shipping details saved successfully." });
    }
    catch (error) {
        console.error("Shipping Save Error:", error);
        res.status(500).json({ error: "Failed to securely save the shipping documents. Please check your file sizes and try again." });
    }
});
exports.addShippingDetails = addShippingDetails;
const bulkUpdateItemStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { updates, newStatus } = req.body;
        if (!Array.isArray(updates) || updates.length === 0 || !newStatus) {
            return res.status(400).json({ error: "Invalid data provided. Please select items and a target status." });
        }
        const updatesByOrder = {};
        updates.forEach((u) => {
            if (!updatesByOrder[u.orderId])
                updatesByOrder[u.orderId] = [];
            updatesByOrder[u.orderId].push(u.itemIndex);
        });
        yield prisma_1.default.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
            const orderIds = Object.keys(updatesByOrder);
            yield Promise.all(orderIds.map((orderId) => __awaiter(void 0, void 0, void 0, function* () {
                const indicesToUpdate = updatesByOrder[orderId];
                const order = yield tx.order.findUnique({
                    where: { id: orderId },
                    select: { items: true, status: true }
                });
                if (!order)
                    return;
                const items = order.items;
                let hasChanges = false;
                indicesToUpdate.forEach(idx => {
                    if (items[idx]) {
                        items[idx].status = newStatus;
                        hasChanges = true;
                    }
                });
                if (!hasChanges)
                    return;
                const allStatuses = items.map(i => i.status || 'PENDING');
                let globalStatus = client_1.OrderStatus.PROCESSING;
                if (allStatuses.every(s => s === 'PENDING'))
                    globalStatus = client_1.OrderStatus.PENDING;
                else if (allStatuses.every(s => s === 'DELIVERED'))
                    globalStatus = client_1.OrderStatus.DELIVERED;
                else if (allStatuses.every(s => s === 'CANCELLED'))
                    globalStatus = client_1.OrderStatus.CANCELLED;
                else if (allStatuses.some(s => s === 'IN_TRANSIT'))
                    globalStatus = client_1.OrderStatus.IN_TRANSIT;
                else if (allStatuses.some(s => s === 'READY_TRANSPORT'))
                    globalStatus = client_1.OrderStatus.READY_TRANSPORT;
                yield tx.order.update({
                    where: { id: orderId },
                    data: { items, status: globalStatus }
                });
            })));
        }));
        orderCache.del(CACHE_KEY_ORDERS);
        res.json({ message: "Bulk update applied successfully." });
    }
    catch (error) {
        console.error("Bulk Update Error:", error);
        res.status(500).json({ error: "A database error occurred while updating multiple items. Please try again." });
    }
});
exports.bulkUpdateItemStatus = bulkUpdateItemStatus;
const addItemReview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { itemIndex, rating, comment } = req.body;
        const userId = req.user.id;
        const order = yield prisma_1.default.order.findUnique({ where: { id } });
        if (!order || order.userId !== userId) {
            return res.status(403).json({ error: "You are not authorized to leave a review for this order." });
        }
        const items = order.items;
        if (!items[itemIndex])
            return res.status(404).json({ error: "The requested product item could not be found." });
        const itemStatus = items[itemIndex].status || 'PENDING';
        if (itemStatus !== 'DELIVERED') {
            return res.status(400).json({ error: "You can only leave reviews for items that have been successfully delivered." });
        }
        if (items[itemIndex].review) {
            return res.status(400).json({ error: "You have already submitted a review for this specific item." });
        }
        items[itemIndex].review = {
            rating: Math.min(5, Math.max(1, rating)),
            comment: comment || "",
            createdAt: new Date().toISOString()
        };
        yield prisma_1.default.order.update({
            where: { id },
            data: { items }
        });
        if (productController_1.productCache) {
            productController_1.productCache.del('products_admin');
            productController_1.productCache.del('products_buyer');
        }
        res.json({ message: "Your review was submitted successfully." });
    }
    catch (error) {
        console.error("Review Error:", error);
        res.status(500).json({ error: "Failed to submit your review to the server. Please try again." });
    }
});
exports.addItemReview = addItemReview;
