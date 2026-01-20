import axios from 'axios';

const AUTH_KEY = process.env.MSG91_AUTH_KEY;
const TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID;

// Toggle this to TRUE when client gives real keys
const USE_REAL_MSG91 = false; 

export const sendOtp = async (mobile: string) => {
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
    const response = await axios.post(url, {}, {
      params: { template_id: TEMPLATE_ID, mobile: mobile, authkey: AUTH_KEY }
    });
    return response.data;
  } catch (error: any) {
    console.error(`[MSG91] 🔴 Request Failed`, error.message);
    throw new Error("Failed to send OTP");
  }
};

export const verifyOtp = async (mobile: string, otp: string) => {
  // 1. DEV MODE: Verify Magic OTP
  if (!USE_REAL_MSG91) {
    console.log(`[DEV MODE] 🟡 Verifying OTP: ${otp}`);
    
    if (otp === '123456') {
      console.log(`[DEV MODE] 🟢 OTP Verified!`);
      return true;
    } else {
      console.log(`[DEV MODE] 🔴 Invalid OTP`);
      return false;
    }
  }

  // 2. REAL MODE
  const url = 'https://control.msg91.com/api/v5/otp/verify';
  try {
    const response = await axios.get(url, {
      params: { otp: otp, mobile: mobile, authkey: AUTH_KEY }
    });
    if (response.data.type === 'error') return false;
    return true;
  } catch (error: any) {
    return false;
  }
};