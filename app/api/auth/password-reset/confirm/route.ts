import { checkAuthRateLimit } from "@/lib/auth/rateLimit";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import User from "@/models/auth/User";

const DEFAULT_TENANT_ID = "default-tenant";

function normalizeTenantId(value?: string | null): string {
  const normalized = (value || DEFAULT_TENANT_ID).trim().toLowerCase();
  return normalized === "default" ? DEFAULT_TENANT_ID : normalized;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(req: NextRequest) {
  const limited = await checkAuthRateLimit(req, "/api/auth/password-reset/confirm");
  if (limited) return limited;
  try {
    const body = await req.json();
    const email = (body.email || "").trim().toLowerCase();
    const tenantId = normalizeTenantId(body.tenantId);
    const token = body.token as string | undefined;
    const newPassword = body.newPassword as string | undefined;

    if (!email || !token || !newPassword) {
      return NextResponse.json(
        { success: false, message: "Email, token, and new password are required" },
        { status: 400 },
      );
    }
    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    await connectDB();

    const tokenHash = hashToken(token);
    const password = await bcrypt.hash(newPassword, 12);
    const user = await User.findOneAndUpdate(
      { tenantId, email, passwordResetTokenHash: tokenHash, passwordResetTokenExpiry: { $gt: new Date() } },
      { $set: { password }, $unset: { passwordResetTokenHash: "", passwordResetTokenExpiry: "" } },
      { new: false, runValidators: true },
    ).select("_id");

    if (!user) {
      return NextResponse.json(
        { success: false, message: "This reset link is invalid or has expired" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, message: "Password updated. You can now sign in." });
  } catch (error: any) {
    console.error("Password reset confirm error:", error);
    return NextResponse.json({ success: false, message: "Something went wrong" }, { status: 500 });
  }
}
