import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { sendOtp, verifyOtp } from '../services/msg91Service';
import prisma from '../config/prisma';
import { logActivity } from '../utils/logger';

// 1. Initial Login (Email + Password)
export const loginStep1 = async (req: Request, res: Response): Promise<void> => {
  const { email, password, rememberMe } = req.body;
  
  console.log(`\n--- [AUTH_STEP_1] Attempt for: ${email} ---`);
  console.log(`[AUTH_STEP_1] Params received: rememberMe=${rememberMe}`);

  try {
    // 1. Find User
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      console.error(`[AUTH_FAIL] User not found in DB: ${email}`);
      await logActivity(email, 'FAILED', 'GUEST');
      res.status(401).json({ error: "Invalid credentials or account inactive" });
      return;
    }

    if (!user.isActive) {
        console.error(`[AUTH_FAIL] User account is inactive: ${email}`);
        await logActivity(email, 'FAILED', 'GUEST');
        res.status(401).json({ error: "Account is inactive. Contact Admin." });
        return;
    }

    // 2. Check Password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      console.error(`[AUTH_FAIL] Password mismatch for: ${email}`);
      await logActivity(email, 'FAILED', user.role, user.id);
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    console.log(`[AUTH_STEP_1] Credentials valid. Preparing OTP for mobile ending in ${user.mobile.slice(-4)}`);

    // 3. Send OTP
    const mobileWithCode = user.mobile.startsWith('91') ? user.mobile : `91${user.mobile}`;
    
    try {
        await sendOtp(mobileWithCode);
        console.log(`[AUTH_STEP_1] OTP sent successfully to ${mobileWithCode}`);
    } catch (otpError: any) {
        console.error(`[AUTH_FAIL] OTP Service Error: ${otpError.message}`);
        res.status(500).json({ error: "Failed to send OTP. System error." });
        return;
    }

    // 4. Generate Temp Token
    const tempToken = jwt.sign(
      { 
        id: user.id, 
        mobile: mobileWithCode, 
        stage: '2fa_pending',
        rememberMe: !!rememberMe 
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '5m' }
    );

    console.log(`[AUTH_STEP_1] Success. Temp token generated.`);

    res.json({ 
      message: "Credentials valid. OTP sent.", 
      tempToken,
      mobile: user.mobile.slice(-4) 
    });

  } catch (error: any) {
    console.error(`[AUTH_CRITICAL_ERROR] Step 1 Failed:`, error);
    res.status(500).json({ error: "Login failed due to server error" });
  }
};

// 2. Verify OTP (2FA)
export const verify2FA = async (req: Request, res: Response): Promise<void> => {
  const { tempToken, otp } = req.body;

  console.log(`\n--- [AUTH_2FA] Verifying OTP: ${otp} ---`);

  try {
    // 1. Verify Temp Token
    let decoded: any;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET as string);
      console.log(`[AUTH_2FA] Temp token decoded for User ID: ${decoded.id}`);
    } catch (e: any) {
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
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
        console.error(`[AUTH_FAIL] User ID from token not found in DB: ${decoded.id}`);
        res.status(404).json({ error: "User not found" });
        return;
    }

    // 3. Verify OTP via Service
    const isOtpValid = await verifyOtp(decoded.mobile, otp);
    
    if (!isOtpValid) {
      console.error(`[AUTH_FAIL] OTP Mismatch for ${decoded.mobile}`);
      await logActivity(user.email, 'FAILED', user.role, user.id);
      res.status(400).json({ error: "Invalid OTP" });
      return;
    }

    console.log(`[AUTH_2FA] OTP Valid. Generating Access Token...`);
    await logActivity(user.email, 'SUCCESS', user.role, user.id);

    // 4. Generate Final Token
    let expiresIn = '1d'; 
    if (user.role === 'BUYER' || decoded.rememberMe) {
        expiresIn = '15d';
    }

    const accessToken = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn } as jwt.SignOptions 
    );

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

  } catch (error: any) {
    console.error(`[AUTH_CRITICAL_ERROR] 2FA Failed:`, error);
    res.status(500).json({ error: "Verification failed due to server error" });
  }
};