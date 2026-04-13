import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { sendOtp, verifyOtp } from '../services/msg91Service';
import prisma from '../config/prisma';
import { logActivity } from '../utils/logger';
import { sendAdminResetOtp } from '../services/emailService';
// 1. Initial Login (Email + Password)

const adminOtpStore = new Map<string, { otp: string, expiresAt: number }>();
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
   let expiresIn = '1d'; // Default is 1 day
    // ⚡ FIX: Only grant 15 days if the user actually clicked "Remember Me"
    if (decoded.rememberMe) {
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
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  const { oldPassword, newPassword } = req.body;
  const userId = (req as any).user.id; // Comes from the 'protect' middleware

  console.log(`\n--- [AUTH_PW_CHANGE] Attempt for User ID: ${userId} ---`);

  try {
    // 1. Get the user from DB
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // 2. Verify the old password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      console.error(`[AUTH_PW_CHANGE] Failed: Old password incorrect for User ID: ${userId}`);
      res.status(400).json({ error: "Incorrect current password" });
      return;
    }

    // 3. Hash the new password and save it
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    console.log(`[AUTH_PW_CHANGE] Success: Password updated for User ID: ${userId}`);
    res.json({ message: "Password updated successfully" });

  } catch (error) {
    console.error(`[AUTH_CRITICAL_ERROR] Password Change Failed:`, error);
    res.status(500).json({ error: "Failed to update password due to server error" });
  }
};
export const requestAdminPasswordReset = async (req: Request, res: Response): Promise<void> => {
  console.log(`\n--- [AUTH_FORGOT_PW] Admin Reset Requested ---`);
  try {
    // Check if an Admin exists in the database
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      res.status(404).json({ error: "No admin account found in the system." });
      return;
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP for 10 minutes
    adminOtpStore.set('admin_reset', { 
      otp, 
      expiresAt: Date.now() + 10 * 60 * 1000 
    });

    // Send email to fixed address
    await sendAdminResetOtp(otp);

    res.json({ message: "OTP sent to registered Admin email" });
  } catch (error) {
    console.error(`[AUTH_CRITICAL_ERROR] Failed to send reset OTP:`, error);
    res.status(500).json({ error: "Failed to send reset email. Check server configuration." });
  }
};

// 5. Verify OTP and Reset Password
export const resetAdminPassword = async (req: Request, res: Response): Promise<void> => {
  const { otp, newPassword } = req.body;
  
  try {
    const record = adminOtpStore.get('admin_reset');

    // Validate OTP
    if (!record || record.expiresAt < Date.now() || record.otp !== otp) {
      res.status(400).json({ error: "Invalid or expired OTP" });
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters long." });
      return;
    }

    // Find the Admin user and update password
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
        res.status(404).json({ error: "Admin not found" });
        return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: admin.id },
      data: { password: hashedPassword }
    });

    // Clear the OTP so it can't be reused
    adminOtpStore.delete('admin_reset');

    console.log(`[AUTH_FORGOT_PW] Success: Admin password reset.`);
    res.json({ message: "Password has been successfully reset" });

  } catch (error) {
    console.error(`[AUTH_CRITICAL_ERROR] Failed to reset password:`, error);
    res.status(500).json({ error: "Server error during password reset." });
  }
};