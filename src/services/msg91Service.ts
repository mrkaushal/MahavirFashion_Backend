import axios from 'axios';

const AUTH_KEY = process.env.MSG91_AUTH_KEY;
const TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID;

// ⚡ Logic: Use Real Service ONLY if keys exist
const USE_REAL_MSG91 = !!(AUTH_KEY && TEMPLATE_ID); 

console.log(`\n🔌 [MSG91_INIT] Service Loaded.`);
console.log(`🔌 [MSG91_INIT] Mode: ${USE_REAL_MSG91 ? '✅ PRODUCTION (Real SMS)' : '⚠️ DEV (Simulated)'}`);
if (!USE_REAL_MSG91) {
    console.log(`🔌 [MSG91_INIT] Missing Env Vars: ${!AUTH_KEY ? 'MSG91_AUTH_KEY ' : ''}${!TEMPLATE_ID ? 'MSG91_TEMPLATE_ID' : ''}`);
}

// --- Helper: Format Mobile (Adds '91' if missing) ---
const formatMobile = (mobile: string) => {
  const original = mobile;
  // Remove non-numeric characters
  const cleaned = mobile.replace(/\D/g, '');
  
  let formatted = cleaned;
  
  // If length is 10, add '91' (India)
  if (cleaned.length === 10) formatted = `91${cleaned}`;
  
  // If it starts with '0', replace with '91'
  if (cleaned.startsWith('0') && cleaned.length === 11) formatted = `91${cleaned.substring(1)}`;
  
  // Log formatting only if changed
  if (original !== formatted) {
      console.log(`🛠️ [MSG91_UTIL] Formatted Mobile: ${original} -> ${formatted}`);
  }
  
  return formatted;
};

export const sendOtp = async (mobile: string) => {
  const formattedMobile = formatMobile(mobile);

  console.log(`\n📤 [MSG91_SEND] Request to send OTP to: ${formattedMobile}`);

  // 1. DEV MODE: Bypass if keys are missing
  if (!USE_REAL_MSG91) {
    console.log(`🟡 [MSG91_DEV] Real keys missing or disabled.`);
    console.log(`🔑 [MSG91_DEV] SIMULATED OTP for ${formattedMobile} is: 123456`);
    return { type: "success", message: "OTP sent (Simulated)" };
  }

  // 2. REAL MODE
  const url = 'https://control.msg91.com/api/v5/otp';
  
  try {
    console.log(`🚀 [MSG91_API] Calling MSG91 API...`);
    // Note: We don't log AUTH_KEY for security
    
    const response = await axios.post(url, null, {
      params: {
        template_id: TEMPLATE_ID,
        mobile: formattedMobile,
        authkey: AUTH_KEY,
        // otp_length: 6, 
        // otp_expiry: 10 
      }
    });

    console.log(`📥 [MSG91_API] Response Status: ${response.status}`);
    console.log(`📥 [MSG91_API] Response Body:`, JSON.stringify(response.data));

    if (response.data.type === 'error') {
       console.error(`❌ [MSG91_FAIL] API returned error: ${response.data.message}`);
       throw new Error(response.data.message);
    }

    console.log(`✅ [MSG91_SUCCESS] OTP Sent successfully.`);
    return response.data;

  } catch (error: any) {
    console.error(`❌ [MSG91_CRITICAL] HTTP Request Failed:`, error.message);
    if (error.response) {
        console.error(`❌ [MSG91_CRITICAL] Server Response:`, error.response.data);
    }
    throw new Error("Failed to send OTP via MSG91");
  }
};

export const verifyOtp = async (mobile: string, otp: string) => {
  const formattedMobile = formatMobile(mobile);

  console.log(`\n🔍 [MSG91_VERIFY] Verifying OTP for: ${formattedMobile}`);

  // 1. DEV MODE
  if (!USE_REAL_MSG91) {
    console.log(`🟡 [MSG91_DEV] Checking against Magic OTP '123456'`);
    const isValid = otp === '123456';
    console.log(isValid ? `✅ [MSG91_DEV] Matched!` : `❌ [MSG91_DEV] Mismatch! Provided: ${otp}`);
    return isValid;
  }

  // 2. REAL MODE
  const url = 'https://control.msg91.com/api/v5/otp/verify';
  
  try {
    console.log(`🚀 [MSG91_API] Calling Verify Endpoint...`);
    
    const response = await axios.get(url, {
      params: {
        otp: otp,
        mobile: formattedMobile,
        authkey: AUTH_KEY
      }
    });

    console.log(`📥 [MSG91_API] Verify Response:`, JSON.stringify(response.data));

    if (response.data.type === 'error') {
      console.log(`❌ [MSG91_FAIL] MSG91 rejected OTP: ${response.data.message}`);
      return false;
    }

    console.log(`✅ [MSG91_SUCCESS] MSG91 verified OTP!`);
    return true;

  } catch (error: any) {
    console.error(`❌ [MSG91_CRITICAL] Verify Request Failed:`, error.message);
    if (error.response) {
        console.error(`❌ [MSG91_CRITICAL] Data:`, error.response.data);
    }
    return false;
  }
};

// --- Optional: Widget Token Verification (If you use the Widget later) ---
export const verifyWidgetToken = async (accessToken: string) => {
    const url = 'https://control.msg91.com/api/v5/widget/verifyAccessToken';
    if (!USE_REAL_MSG91) return null;

    try {
        const response = await axios.post(url, {
            "authkey": AUTH_KEY,
            "access-token": accessToken
        }, {
            headers: { "Content-Type": "application/json" }
        });
        
        if (response.data.type === 'error') throw new Error(response.data.message);
        return response.data;
    } catch (error: any) {
        console.error("MSG91 Widget Verify Error:", error.message);
        return null;
    }
};