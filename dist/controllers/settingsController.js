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
exports.updateSettings = exports.getSettings = void 0;
const prisma_1 = __importDefault(require("../config/prisma"));
// 1. Get Settings (Auto-create if missing)
const getSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let settings = yield prisma_1.default.globalSettings.findUnique({ where: { id: 1 } });
        if (!settings) {
            settings = yield prisma_1.default.globalSettings.create({
                data: { id: 1, areOrdersEnabled: true }
            });
        }
        res.json(settings);
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch settings" });
    }
});
exports.getSettings = getSettings;
// 2. Update Toggle
const updateSettings = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { areOrdersEnabled } = req.body;
        const settings = yield prisma_1.default.globalSettings.upsert({
            where: { id: 1 },
            update: { areOrdersEnabled },
            create: { id: 1, areOrdersEnabled }
        });
        res.json(settings);
    }
    catch (error) {
        res.status(500).json({ error: "Failed to update settings" });
    }
});
exports.updateSettings = updateSettings;
