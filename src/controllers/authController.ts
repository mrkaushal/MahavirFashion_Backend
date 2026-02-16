import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { sendOtp, verifyOtp } from '../services/msg91Service';
import prisma from '../config/prisma';
import { logActivity } from '../utils/logger';

// 1. Initial Login (Email + Password)
export const loginStep1 = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, rememberMe } = req.body; // <--- 1. Accept rememberMe

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      await logActivity(email, 'FAILED', 'GUEST');
      res.status(401).json({ error: "Invalid credentials or account inactive" });
      return;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      await logActivity(email, 'FAILED', user.role, user.id);
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const mobileWithCode = user.mobile.startsWith('91') ? user.mobile : `91${user.mobile}`;
    await sendOtp(mobileWithCode);

    // 2. Encode rememberMe into the temp token payload
    const tempToken = jwt.sign(
      { 
        id: user.id, 
        mobile: mobileWithCode, 
        stage: '2fa_pending',
        rememberMe: !!rememberMe // Store boolean
      },
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

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
    }

    const isOtpValid = await verifyOtp(decoded.mobile, otp);
    
    if (!isOtpValid) {
      await logActivity(user.email, 'FAILED', user.role, user.id);
      res.status(400).json({ error: "Invalid OTP" });
      return;
    }

    await logActivity(user.email, 'SUCCESS', user.role, user.id);

    // 3. Determine Expiration Logic
    // Buyers: Always 15 days
    // Admin: 15 days if rememberMe is true, else 1 day (standard session)
    let expiresIn = '1d'; 
    if (user.role === 'BUYER' || decoded.rememberMe) {
        expiresIn = '15d';
    }

  const accessToken = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn } as jwt.SignOptions 
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