import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import connectDB from "@/lib/db";
import User from "@/models/User";
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
  message: "If an account exists for that email, a password reset link has been sent.",
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

      const resetLink =
        tenantId === DEFAULT_TENANT_ID
          ? `/auth/reset-password?token=${token}&email=${encodeURIComponent(email)}`
          : `${buildTenantUrl(tenantId)}/auth/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

      const emailService = getEmailService();
      await emailService.send({
        to: email,
        subject: "Reset your Aupulens ERP password",
        body: `Hi ${user.name || "there"}, click the link below to reset your password. This link expires in 1 hour.\n\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.`,
      });
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (error: any) {
    console.error("Password reset request error:", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
