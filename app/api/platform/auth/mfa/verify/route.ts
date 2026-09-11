import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import AdminUser from "@/models/platform/AdminUser";
import {
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
} from "@/lib/constants/statuses";
import {
  buildAdminSessionCookie,
  createAdminSession,
  verifyLoginChallenge,
} from "@/lib/platform/auth/adminSession";
import { generateBackupCodes, verifyTotpCode } from "@/lib/platform/auth/totp";
import { decrypt } from "@/lib/crypto";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";

function clientIp(request: Request): string | undefined {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
}

export async function POST(request: Request) {
  await connectDB();
  const body = await request.json().catch(() => null);
  const challengeToken = typeof body?.challengeToken === "string" ? body.challengeToken : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent") ?? undefined;

  if (!challengeToken || !code) {
    return NextResponse.json({ success: false, message: "Missing challenge or code." }, { status: 400 });
  }

  const setupChallenge = await verifyLoginChallenge(challengeToken, "mfa_setup");
  const loginChallenge = setupChallenge ? null : await verifyLoginChallenge(challengeToken, "mfa");
  const challenge = setupChallenge ?? loginChallenge;
  const isSetupConfirmation = Boolean(setupChallenge);

  if (!challenge) {
    return NextResponse.json({ success: false, message: "Invalid or expired challenge." }, { status: 401 });
  }

  const admin = await AdminUser.findById(challenge.adminUserId);
  if (!admin) {
    return NextResponse.json({ success: false, message: "Admin account not found." }, { status: 404 });
  }

  if (!isSetupConfirmation && !admin.mfaEnabled) {
    return NextResponse.json({ success: false, message: "MFA is not enabled for this account." }, { status: 409 });
  }
  if (!admin.mfaSecretEncrypted) {
    return NextResponse.json({ success: false, message: "No MFA secret on file — restart setup." }, { status: 409 });
  }

  const secret = decrypt(admin.mfaSecretEncrypted);
  let matched = verifyTotpCode(secret, code);

  let consumedBackupCode = false;
  if (!matched && !isSetupConfirmation && admin.mfaBackupCodeHashes.length > 0) {
    for (let i = 0; i < admin.mfaBackupCodeHashes.length; i++) {
      if (await bcrypt.compare(code, admin.mfaBackupCodeHashes[i])) {
        matched = true;
        consumedBackupCode = true;
        admin.mfaBackupCodeHashes.splice(i, 1);
        break;
      }
    }
  }

  if (!matched) {
    admin.failedLoginCount += 1;
    await admin.save();
    await emitPlatformAuditEvent({
      actor: { id: String(admin._id), role: admin.role },
      eventCategory: PLATFORM_EVENT_CATEGORY.AUTH,
      eventType: PLATFORM_EVENT_TYPE.MFA_CHALLENGE_FAILED,
      severity: PLATFORM_SEVERITY.SECURITY,
      ipAddress: ip,
      userAgent,
    });
    return NextResponse.json({ success: false, message: "Incorrect code." }, { status: 401 });
  }

  let issuedBackupCodes: string[] | undefined;
  if (isSetupConfirmation) {
    admin.mfaEnabled = true;
    const plainCodes = generateBackupCodes();
    admin.mfaBackupCodeHashes = await Promise.all(plainCodes.map((c) => bcrypt.hash(c, 10)));
    issuedBackupCodes = plainCodes;
    await emitPlatformAuditEvent({
      actor: { id: String(admin._id), role: admin.role },
      eventCategory: PLATFORM_EVENT_CATEGORY.AUTH,
      eventType: PLATFORM_EVENT_TYPE.MFA_ENROLLED,
      severity: PLATFORM_SEVERITY.INFO,
      ipAddress: ip,
      userAgent,
    });
  }

  admin.failedLoginCount = 0;
  admin.lastLoginAt = new Date();
  admin.lastLoginIp = ip;
  await admin.save();

  const { token, expiresAt } = await createAdminSession(
    { id: String(admin._id), email: admin.email, name: admin.name, role: admin.role },
    { ip, userAgent },
  );

  await emitPlatformAuditEvent({
    actor: { id: String(admin._id), role: admin.role },
    eventCategory: PLATFORM_EVENT_CATEGORY.AUTH,
    eventType: PLATFORM_EVENT_TYPE.LOGIN_SUCCESS,
    severity: PLATFORM_SEVERITY.INFO,
    ipAddress: ip,
    userAgent,
    metadata: consumedBackupCode ? { usedBackupCode: true } : undefined,
  });

  const response = NextResponse.json({
    success: true,
    data: {
      admin: { id: String(admin._id), email: admin.email, name: admin.name, role: admin.role },
      ...(issuedBackupCodes ? { backupCodes: issuedBackupCodes } : {}),
    },
  });
  response.headers.set("Set-Cookie", buildAdminSessionCookie(token, expiresAt));
  return response;
}
