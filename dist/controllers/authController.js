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
const logger_1 = require("../utils/logger");
// 1. Initial Login (Email + Password)
const loginStep1 = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password, rememberMe } = req.body;
    console.log(`\n--- [AUTH_STEP_1] Attempt for: ${email} ---`);
    console.log(`[AUTH_STEP_1] Params received: rememberMe=${rememberMe}`);
    try {
        // 1. Find User
        const user = yield prisma_1.default.user.findUnique({ where: { email } });
        if (!user) {
            console.error(`[AUTH_FAIL] User not found in DB: ${email}`);
            yield (0, logger_1.logActivity)(email, 'FAILED', 'GUEST');
            res.status(401).json({ error: "Invalid credentials or account inactive" });
            return;
        }
        if (!user.isActive) {
            console.error(`[AUTH_FAIL] User account is inactive: ${email}`);
            yield (0, logger_1.logActivity)(email, 'FAILED', 'GUEST');
            res.status(401).json({ error: "Account is inactive. Contact Admin." });
            return;
        }
        // 2. Check Password
        const isValid = yield bcryptjs_1.default.compare(password, user.password);
        if (!isValid) {
            console.error(`[AUTH_FAIL] Password mismatch for: ${email}`);
            yield (0, logger_1.logActivity)(email, 'FAILED', user.role, user.id);
            res.status(401).json({ error: "Invalid credentials" });
            return;
        }
        console.log(`[AUTH_STEP_1] Credentials valid. Preparing OTP for mobile ending in ${user.mobile.slice(-4)}`);
        // 3. Send OTP
        const mobileWithCode = user.mobile.startsWith('91') ? user.mobile : `91${user.mobile}`;
        try {
            yield (0, msg91Service_1.sendOtp)(mobileWithCode);
            console.log(`[AUTH_STEP_1] OTP sent successfully to ${mobileWithCode}`);
        }
        catch (otpError) {
            console.error(`[AUTH_FAIL] OTP Service Error: ${otpError.message}`);
            res.status(500).json({ error: "Failed to send OTP. System error." });
            return;
        }
        // 4. Generate Temp Token
        const tempToken = jsonwebtoken_1.default.sign({
            id: user.id,
            mobile: mobileWithCode,
            stage: '2fa_pending',
            rememberMe: !!rememberMe
        }, process.env.JWT_SECRET, { expiresIn: '5m' });
        console.log(`[AUTH_STEP_1] Success. Temp token generated.`);
        res.json({
            message: "Credentials valid. OTP sent.",
            tempToken,
            mobile: user.mobile.slice(-4)
        });
    }
    catch (error) {
        console.error(`[AUTH_CRITICAL_ERROR] Step 1 Failed:`, error);
        res.status(500).json({ error: "Login failed due to server error" });
    }
});
exports.loginStep1 = loginStep1;
// 2. Verify OTP (2FA)
const verify2FA = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { tempToken, otp } = req.body;
    console.log(`\n--- [AUTH_2FA] Verifying OTP: ${otp} ---`);
    try {
        // 1. Verify Temp Token
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(tempToken, process.env.JWT_SECRET);
            console.log(`[AUTH_2FA] Temp token decoded for User ID: ${decoded.id}`);
        }
        catch (e) {
            console.error(`[AUTH_FAIL] Temp Token Invalid/Expired: ${e.message}`);
            res.status(401).json({ error: "Session expired. Login again." });
            return;
        }
        if (decoded.stage !== '2fa_pending') {
            console.error(`[AUTH_FAIL] Invalid Token Stage: ${decoded.stage}`);
            res.status(401).json({ error: "Invalid login flow" });
            return;
        }
        // 2. Find User
        const user = yield prisma_1.default.user.findUnique({ where: { id: decoded.id } });
        if (!user) {
            console.error(`[AUTH_FAIL] User ID from token not found in DB: ${decoded.id}`);
            res.status(404).json({ error: "User not found" });
            return;
        }
        // 3. Verify OTP via Service
        const isOtpValid = yield (0, msg91Service_1.verifyOtp)(decoded.mobile, otp);
        if (!isOtpValid) {
            console.error(`[AUTH_FAIL] OTP Mismatch for ${decoded.mobile}`);
            yield (0, logger_1.logActivity)(user.email, 'FAILED', user.role, user.id);
            res.status(400).json({ error: "Invalid OTP" });
            return;
        }
        console.log(`[AUTH_2FA] OTP Valid. Generating Access Token...`);
        yield (0, logger_1.logActivity)(user.email, 'SUCCESS', user.role, user.id);
        // 4. Generate Final Token
        let expiresIn = '1d';
        if (user.role === 'BUYER' || decoded.rememberMe) {
            expiresIn = '15d';
        }
        const accessToken = jsonwebtoken_1.default.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn });
        console.log(`[AUTH_SUCCESS] Login Complete for ${user.email} (${user.role}). Token Expiry: ${expiresIn}`);
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
        console.error(`[AUTH_CRITICAL_ERROR] 2FA Failed:`, error);
        res.status(500).json({ error: "Verification failed due to server error" });
    }
});
exports.verify2FA = verify2FA;
