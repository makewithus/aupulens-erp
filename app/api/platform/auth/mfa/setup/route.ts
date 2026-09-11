import { NextResponse } from "next/server";
import QRCode from "qrcode";
import connectDB from "@/lib/db";
import AdminUser from "@/models/platform/AdminUser";
import { verifyLoginChallenge } from "@/lib/platform/auth/adminSession";
import { generateTotpSecret, totpOtpauthUrl } from "@/lib/platform/auth/totp";
import { encrypt } from "@/lib/crypto";

/**
 * Step 1 of first-time MFA enrollment: given a valid `mfa_setup` challenge
 * (issued only after a correct password), generate a new TOTP secret, store
 * it encrypted (mfaEnabled stays false until the code is confirmed via
 * /api/platform/auth/mfa/verify), and return the QR + manual-entry secret.
 * Never returns the raw secret again after this call succeeds and is
 * confirmed — only this one-time enrollment view shows it.
 */
export async function POST(request: Request) {
  await connectDB();
  const body = await request.json().catch(() => null);
  const challengeToken = typeof body?.challengeToken === "string" ? body.challengeToken : "";

  const challenge = challengeToken ? await verifyLoginChallenge(challengeToken, "mfa_setup") : null;
  if (!challenge) {
    return NextResponse.json({ success: false, message: "Invalid or expired setup link." }, { status: 401 });
  }

  const admin = await AdminUser.findById(challenge.adminUserId);
  if (!admin) {
    return NextResponse.json({ success: false, message: "Admin account not found." }, { status: 404 });
  }
  if (admin.mfaEnabled) {
    return NextResponse.json({ success: false, message: "MFA is already enabled for this account." }, { status: 409 });
  }

  const secret = generateTotpSecret();
  admin.mfaSecretEncrypted = encrypt(secret);
  await admin.save();

  const otpauthUrl = totpOtpauthUrl(secret, admin.email);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  return NextResponse.json({
    success: true,
    data: { secret, qrDataUrl },
  });
}
