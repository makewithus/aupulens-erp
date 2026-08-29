import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import connectDB from "@/lib/db";
import User from "@/models/auth/User";
import { getEmailService } from "@/lib/email/sendEmail";
import { buildTenantUrl } from "@/lib/config";

const DEFAULT_TENANT_ID = "default-tenant";
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function normalizeTenantId(value?: string | null): string {
  const normalized = (value || DEFAULT_TENANT_ID).trim().toLowerCase();
  return normalized === "default" ? DEFAULT_TENANT_ID : normalized;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Always returns the same generic success response regardless of whether the
// email exists, to avoid leaking which addresses have an account (user
// enumeration).
const GENERIC_RESPONSE = {
  success: true,
  message: "We have sent a password reset link to that email if it matches an existing account.",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = (body.email || "").trim().toLowerCase();
    const tenantId = normalizeTenantId(body.tenantId);

    if (!email) {
      return NextResponse.json({ success: false, message: "Email is required" }, { status: 400 });
    }

    await connectDB();

    const user = await User.findOne({ tenantId, email });
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      user.passwordResetTokenHash = hashToken(token);
      user.passwordResetTokenExpiry = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await user.save();

      // Dynamically generate the base URL based on the request host.
      // This ensures that Vercel preview URLs (aupulens-erp.vercel.app) work seamlessly,
      // while falling back to the configured NEXT_PUBLIC_APP_BASE_URL if needed.
      const host = req.headers.get("host");
      const protocol = host?.includes("localhost") ? "http" : "https";
      const baseUrl = host 
        ? `${protocol}://${host}` 
        : (process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000");
      const resetLink =
        tenantId === DEFAULT_TENANT_ID
          ? `${baseUrl}/auth/reset-password?token=${token}&email=${encodeURIComponent(email)}`
          : `${buildTenantUrl(tenantId)}/auth/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0a0a0a; color: #f2f2f2; padding: 40px 20px; border-radius: 8px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #ffffff; font-size: 28px; font-weight: bold; margin: 0; letter-spacing: -1px;">aupulens</h1>
            <p style="color: #888888; font-size: 11px; letter-spacing: 2px; margin-top: 5px; text-transform: uppercase;">Enterprise Resource Planning</p>
          </div>
          
          <div style="background-color: #161616; border: 1px solid #272727; padding: 40px 30px; border-radius: 6px;">
            <h2 style="margin-top: 0; color: #ffffff; font-size: 20px; font-weight: 600;">Password Reset Request</h2>
            <p style="color: #d1d5db; line-height: 1.6; font-size: 15px; margin-top: 20px;">
              Hi ${user.name || "there"},
            </p>
            <p style="color: #d1d5db; line-height: 1.6; font-size: 15px;">
              We received a request to reset the password for your Aupulens ERP account. Click the button below to choose a new password. This link will expire in 1 hour.
            </p>
            
            <div style="text-align: center; margin: 35px 0;">
              <a href="${resetLink}" style="background-color: #1e40af; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 15px; display: inline-block;">Reset Password</a>
            </div>
            
            <p style="color: #888888; line-height: 1.5; font-size: 13px; margin-bottom: 0; border-top: 1px solid #272727; padding-top: 20px;">
              If you did not request this password reset, you can safely ignore this email. Your password will remain unchanged.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; color: #666666; font-size: 12px;">
            &copy; ${new Date().getFullYear()} Aupulens. All rights reserved.
          </div>
        </div>
      `;

      const emailService = getEmailService();
      await emailService.send({
        to: email,
        subject: "Reset your Aupulens ERP password",
        body: `Hi ${user.name || "there"},\n\nClick the link below to reset your password. This link expires in 1 hour.\n\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.`,
        html: htmlBody,
      });
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (error: any) {
    console.error("Password reset request error:", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
