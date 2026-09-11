import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import AdminUser from "@/models/platform/AdminUser";
import { ADMIN_USER_STATUS, PLATFORM_EVENT_CATEGORY, PLATFORM_EVENT_TYPE, PLATFORM_SEVERITY } from "@/lib/constants/statuses";
import { signLoginChallenge } from "@/lib/platform/auth/adminSession";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function clientIp(request: Request): string | undefined {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
}

export async function POST(request: Request) {
  await connectDB();
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ success: false, message: "Email and password are required." }, { status: 400 });
  }

  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent") ?? undefined;
  const admin = await AdminUser.findOne({ email });

  const auditFailure = async (reason: string) =>
    emitPlatformAuditEvent({
      actor: { id: admin ? String(admin._id) : email, role: admin?.role ?? "unknown" },
      actorType: "admin",
      eventCategory: PLATFORM_EVENT_CATEGORY.AUTH,
      eventType: PLATFORM_EVENT_TYPE.LOGIN_FAILED,
      severity: PLATFORM_SEVERITY.WARNING,
      ipAddress: ip,
      userAgent,
      metadata: { email, reason },
    });

  if (!admin) {
    await auditFailure("no_such_admin");
    return NextResponse.json({ success: false, message: "Invalid credentials." }, { status: 401 });
  }

  if (admin.status !== ADMIN_USER_STATUS.ACTIVE) {
    await auditFailure("account_not_active");
    return NextResponse.json({ success: false, message: "This admin account is not active." }, { status: 403 });
  }

  if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
    await auditFailure("account_locked");
    return NextResponse.json(
      { success: false, message: "Too many failed attempts. Try again later." },
      { status: 423 },
    );
  }

  const passwordValid = await bcrypt.compare(password, admin.passwordHash);
  if (!passwordValid) {
    admin.failedLoginCount += 1;
    if (admin.failedLoginCount >= MAX_FAILED_ATTEMPTS) {
      admin.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    }
    await admin.save();
    await auditFailure("bad_password");
    return NextResponse.json({ success: false, message: "Invalid credentials." }, { status: 401 });
  }

  admin.failedLoginCount = 0;
  admin.lockedUntil = undefined;
  await admin.save();

  // MFA is mandatory (source doc §25) — every path from here requires it,
  // either completing a challenge (already enrolled) or enrolling now.
  if (admin.mfaEnabled) {
    const challengeToken = await signLoginChallenge(String(admin._id), "mfa");
    await emitPlatformAuditEvent({
      actor: { id: String(admin._id), role: admin.role },
      eventCategory: PLATFORM_EVENT_CATEGORY.AUTH,
      eventType: PLATFORM_EVENT_TYPE.MFA_CHALLENGE_SENT,
      severity: PLATFORM_SEVERITY.INFO,
      ipAddress: ip,
      userAgent,
    });
    return NextResponse.json({ success: true, data: { mfaRequired: true, challengeToken } });
  }

  const setupToken = await signLoginChallenge(String(admin._id), "mfa_setup");
  return NextResponse.json({ success: true, data: { mfaSetupRequired: true, challengeToken: setupToken } });
}
