import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { sendOtp, verifyOtp } from '../services/msg91Service';
import prisma from '../config/prisma';
import { logActivity } from '../utils/logger'; // <--- 1. Import Logger

// 1. Initial Login (Email + Password)
export const loginStep1 = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    // Check User existence and status
    if (!user || !user.isActive) {
      // 🔴 LOG FAILURE (User not found or inactive)
      await logActivity(email, 'FAILED', 'GUEST');
      
      res.status(401).json({ error: "Invalid credentials or account inactive" });
      return;
    }

    // Verify Password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      // 🔴 LOG FAILURE (Wrong Password)
      await logActivity(email, 'FAILED', user.role, user.id);
      
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Credentials OK -> Trigger 2FA (MSG91)
    const mobileWithCode = user.mobile.startsWith('91') ? user.mobile : `91${user.mobile}`;
    await sendOtp(mobileWithCode);

    // Return temp token
    const tempToken = jwt.sign(
      { id: user.id, mobile: mobileWithCode, stage: '2fa_pending' },
      process.env.JWT_SECRET as string,
      { expiresIn: '5m' }
    );

    res.json({ 
      message: "Credentials valid. OTP sent.", 
      tempToken,
      mobile: user.mobile.slice(-4) 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Login failed" });
  }
};

// 2. Verify OTP (2FA)
export const verify2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tempToken, otp } = req.body;

    // Decode the temp token
    let decoded: any;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET as string);
    } catch (e) {
      res.status(401).json({ error: "Session expired. Login again." });
      return;
    }

    if (decoded.stage !== '2fa_pending') {
      res.status(401).json({ error: "Invalid login flow" });
      return;
    }

    // Fetch user FIRST (so we can log attempts properly)
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
    }

    // Verify with MSG91
    const isOtpValid = await verifyOtp(decoded.mobile, otp);
    
    if (!isOtpValid) {
      // 🔴 LOG FAILURE (Wrong OTP)
      await logActivity(user.email, 'FAILED', user.role, user.id);
      
      res.status(400).json({ error: "Invalid OTP" });
      return;
    }

    // 🟢 LOG SUCCESS (Login Complete)
    await logActivity(user.email, 'SUCCESS', user.role, user.id);

    // Generate Final Access Token
    const accessToken = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    );

    res.json({
      message: "Login successful",
      token: accessToken,
      user: {
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Verification failed" });
  }
};