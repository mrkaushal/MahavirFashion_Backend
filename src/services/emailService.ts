import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendAdminResetOtp = async (otp: string) => {
  const mailOptions = {
    from: `"Mahavir Security" <${process.env.EMAIL_USER}>`,
    to: 'mahavirfashion@yahoo.com', // ⚡ Hardcoded as requested
    subject: 'Admin Password Reset OTP - Mahavir Fashion',
    html: `
      <div style="font-family: sans-serif; padding: 20px; text-align: center;">
        <h2 style="color: #014b35;">Password Reset Request</h2>
        <p>Someone requested a password reset for the Admin Portal.</p>
        <p>Your one-time verification code is:</p>
        <h1 style="letter-spacing: 5px; color: #333;">${otp}</h1>
        <p style="color: #888; font-size: 12px;">This code expires in 10 minutes. If you did not request this, ignore this email.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};