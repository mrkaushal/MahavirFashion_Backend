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
// Toggle this to TRUE when client gives real keys
const USE_REAL_MSG91 = false;
const sendOtp = (mobile) => __awaiter(void 0, void 0, void 0, function* () {
    // 1. DEV MODE: Bypass actual API call
    if (!USE_REAL_MSG91) {
        console.log(`[DEV MODE] 🟡 Skipping MSG91 API Call`);
        console.log(`[DEV MODE] 🔑 OTP for ${mobile} is: 123456`); // <--- Magic OTP
        // Simulate MSG91 success response
        return {
            type: "success",
            request_id: "dev-mode-request-id",
            message: "OTP sent successfully (Simulated)"
        };
    }
    // 2. REAL MODE (Keep this code for later)
    const url = 'https://control.msg91.com/api/v5/otp';
    try {
        const response = yield axios_1.default.post(url, {}, {
            params: { template_id: TEMPLATE_ID, mobile: mobile, authkey: AUTH_KEY }
        });
        return response.data;
    }
    catch (error) {
        console.error(`[MSG91] 🔴 Request Failed`, error.message);
        throw new Error("Failed to send OTP");
    }
});
exports.sendOtp = sendOtp;
const verifyOtp = (mobile, otp) => __awaiter(void 0, void 0, void 0, function* () {
    // 1. DEV MODE: Verify Magic OTP
    if (!USE_REAL_MSG91) {
        console.log(`[DEV MODE] 🟡 Verifying OTP: ${otp}`);
        if (otp === '123456') {
            console.log(`[DEV MODE] 🟢 OTP Verified!`);
            return true;
        }
        else {
            console.log(`[DEV MODE] 🔴 Invalid OTP`);
            return false;
        }
    }
    // 2. REAL MODE
    const url = 'https://control.msg91.com/api/v5/otp/verify';
    try {
        const response = yield axios_1.default.get(url, {
            params: { otp: otp, mobile: mobile, authkey: AUTH_KEY }
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
