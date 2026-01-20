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
exports.verify2FA = exports.loginStep1 = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const msg91Service_1 = require("../services/msg91Service");
const prisma_1 = __importDefault(require("../config/prisma"));
const logger_1 = require("../utils/logger"); // <--- 1. Import Logger
// 1. Initial Login (Email + Password)
const loginStep1 = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password } = req.body;
        const user = yield prisma_1.default.user.findUnique({ where: { email } });
        // Check User existence and status
        if (!user || !user.isActive) {
            // 🔴 LOG FAILURE (User not found or inactive)
            yield (0, logger_1.logActivity)(email, 'FAILED', 'GUEST');
            res.status(401).json({ error: "Invalid credentials or account inactive" });
            return;
        }
        // Verify Password
        const isValid = yield bcryptjs_1.default.compare(password, user.password);
        if (!isValid) {
            // 🔴 LOG FAILURE (Wrong Password)
            yield (0, logger_1.logActivity)(email, 'FAILED', user.role, user.id);
            res.status(401).json({ error: "Invalid credentials" });
            return;
        }
        // Credentials OK -> Trigger 2FA (MSG91)
        const mobileWithCode = user.mobile.startsWith('91') ? user.mobile : `91${user.mobile}`;
        yield (0, msg91Service_1.sendOtp)(mobileWithCode);
        // Return temp token
        const tempToken = jsonwebtoken_1.default.sign({ id: user.id, mobile: mobileWithCode, stage: '2fa_pending' }, process.env.JWT_SECRET, { expiresIn: '5m' });
        res.json({
            message: "Credentials valid. OTP sent.",
            tempToken,
            mobile: user.mobile.slice(-4)
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Login failed" });
    }
});
exports.loginStep1 = loginStep1;
// 2. Verify OTP (2FA)
const verify2FA = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { tempToken, otp } = req.body;
        // Decode the temp token
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(tempToken, process.env.JWT_SECRET);
        }
        catch (e) {
            res.status(401).json({ error: "Session expired. Login again." });
            return;
        }
        if (decoded.stage !== '2fa_pending') {
            res.status(401).json({ error: "Invalid login flow" });
            return;
        }
        // Fetch user FIRST (so we can log attempts properly)
        const user = yield prisma_1.default.user.findUnique({ where: { id: decoded.id } });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        // Verify with MSG91
        const isOtpValid = yield (0, msg91Service_1.verifyOtp)(decoded.mobile, otp);
        if (!isOtpValid) {
            // 🔴 LOG FAILURE (Wrong OTP)
            yield (0, logger_1.logActivity)(user.email, 'FAILED', user.role, user.id);
            res.status(400).json({ error: "Invalid OTP" });
            return;
        }
        // 🟢 LOG SUCCESS (Login Complete)
        yield (0, logger_1.logActivity)(user.email, 'SUCCESS', user.role, user.id);
        // Generate Final Access Token
        const accessToken = jsonwebtoken_1.default.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({
            message: "Login successful",
            token: accessToken,
            user: {
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Verification failed" });
    }
});
exports.verify2FA = verify2FA;
