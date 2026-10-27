import { NextResponse } from "next/server";
import QRCode from "qrcode";
import connectDB from "@/lib/db";
import { ADMIN_USER_STATUS } from "@/lib/constants/statuses";
import AdminUser from "@/models/platform/AdminUser";
import { verifyLoginChallenge } from "@/lib/platform/auth/adminSession";
import { generateTotpSecret, totpOtpauthUrl } from "@/lib/platform/auth/totp";
import { decrypt, encrypt } from "@/lib/crypto";

/**
 * Step 1 of first-time MFA enrollment: given a valid `mfa_setup` challenge
 * (issued only after a correct password), generate a new TOTP secret, store
 * it encrypted (mfaEnabled stays false until the code is confirmed via
 * /api/platform/auth/mfa/verify), and return the QR + manual-entry secret.
 * Reuses the pending secret until confirmation so retries cannot invalidate
 * the QR code. Enrolled secrets are never returned.
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
  if (admin.status !== ADMIN_USER_STATUS.ACTIVE) {
    return NextResponse.json({ success: false, message: "This admin account is not active." }, { status: 403 });
  }
  if (admin.mfaEnabled) {
    return NextResponse.json({ success: false, message: "MFA is already enabled for this account." }, { status: 409 });
  }

  // Strict Mode, refreshes and concurrent tabs must all receive the same
  // pending secret. Atomically initialize it only when it is absent.
  const pending = await AdminUser.findOneAndUpdate(
    { _id: admin._id, mfaEnabled: false, $or: [
      { mfaSecretEncrypted: { $exists: false } }, { mfaSecretEncrypted: null },
    ] },
    { $set: { mfaSecretEncrypted: encrypt(generateTotpSecret()) } },
    { new: true },
  );
  const current = pending ?? await AdminUser.findById(admin._id);
  if (!current || current.mfaEnabled || !current.mfaSecretEncrypted) {
    return NextResponse.json({ success: false, message: "Restart sign-in to continue." }, { status: 409 });
  }
  const secret = decrypt(current.mfaSecretEncrypted);

  const otpauthUrl = totpOtpauthUrl(secret, admin.email);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  return NextResponse.json({
    success: true,
    data: { secret, qrDataUrl },
  });
}
