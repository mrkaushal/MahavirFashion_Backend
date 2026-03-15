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
exports.verifyOtp = exports.sendOtp = void 0;
const axios_1 = __importDefault(require("axios"));
const AUTH_KEY = process.env.MSG91_AUTH_KEY;
const TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID;
const USE_REAL_MSG91 = false;
console.log(`\n🔌 [MSG91_INIT] Service Loaded.`);
console.log(`🔌 [MSG91_INIT] Mode: ${USE_REAL_MSG91 ? '✅ PRODUCTION (Real SMS)' : '⚠️ DEV (Simulated for ALL)'}`);
// --- Helper: Format Mobile (Adds '91' if missing) ---
const formatMobile = (mobile) => {
    const original = mobile;
    const cleaned = mobile.replace(/\D/g, '');
    let formatted = cleaned;
    if (cleaned.length === 10)
        formatted = `91${cleaned}`;
    if (cleaned.startsWith('0') && cleaned.length === 11)
        formatted = `91${cleaned.substring(1)}`;
    if (original !== formatted) {
        console.log(`🛠️ [MSG91_UTIL] Formatted Mobile: ${original} -> ${formatted}`);
    }
    return formatted;
};
const sendOtp = (mobile) => __awaiter(void 0, void 0, void 0, function* () {
    const formattedMobile = formatMobile(mobile);
    console.log(`\n📤 [MSG91_SEND] Request to send OTP to: ${formattedMobile}`);
    // 1. DEV MODE: Since USE_REAL_MSG91 is false, it will always hit this block.
    if (!USE_REAL_MSG91) {
        console.log(`🟡 [MSG91_DEV] Real SMS is disabled globally.`);
        console.log(`🔑 [MSG91_DEV] SIMULATED OTP for ${formattedMobile} is: 123456`);
        return { type: "success", message: "OTP sent (Simulated)" };
    }
    // 2. REAL MODE (Currently unreachable)
    const url = 'https://control.msg91.com/api/v5/otp';
    try {
        const response = yield axios_1.default.post(url, null, {
            params: { template_id: TEMPLATE_ID, mobile: formattedMobile, authkey: AUTH_KEY }
        });
        if (response.data.type === 'error')
            throw new Error(response.data.message);
        return response.data;
    }
    catch (error) {
        throw new Error("Failed to send OTP via MSG91");
    }
});
exports.sendOtp = sendOtp;
const verifyOtp = (mobile, otp) => __awaiter(void 0, void 0, void 0, function* () {
    const formattedMobile = formatMobile(mobile);
    console.log(`\n🔍 [MSG91_VERIFY] Verifying OTP for: ${formattedMobile}`);
    // 1. DEV MODE: Will always check against '123456'
    if (!USE_REAL_MSG91) {
        console.log(`🟡 [MSG91_DEV] Checking against Magic OTP '123456'`);
        const isValid = otp === '123456';
        console.log(isValid ? `✅ [MSG91_DEV] Matched!` : `❌ [MSG91_DEV] Mismatch! Provided: ${otp}`);
        return isValid;
    }
    // 2. REAL MODE (Currently unreachable)
    const url = 'https://control.msg91.com/api/v5/otp/verify';
    try {
        const response = yield axios_1.default.get(url, {
            params: { otp: otp, mobile: formattedMobile, authkey: AUTH_KEY }
        });
        if (response.data.type === 'error')
            return false;
        return true;
    }
    catch (error) {
        return false;
    }
});
exports.verifyOtp = verifyOtp;
