import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Organization from "@/models/Organization";
import OrgInvite from "@/models/OrgInvite";
import User from "@/models/User";
import { INVITE_STATUS } from "@/lib/constants/statuses";
import { requireOrgAdmin } from "@/lib/org/rbac";
import { getTierLimits } from "@/lib/constants/tiers";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId as string | undefined;
    if (!tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // Admin/owner-only — mirrors lib/crm/rbac.ts requirePermission pattern
    try {
      requireOrgAdmin(session);
    } catch {
      return NextResponse.json(
        { success: false, message: "Forbidden: admin role required to invite members" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { email, role } = body;

    if (!email || !role) {
      return NextResponse.json(
        { success: false, message: "email and role are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json(
        { success: false, message: "Invalid email address" },
        { status: 400 }
      );
    }

    await connectDB();

    const org = await Organization.findOne({ subdomain: tenantId }).lean();
    if (!org) {
      return NextResponse.json({ success: false, message: "Organization not found" }, { status: 404 });
    }

    // Tier-derived cap — single source of truth (lib/constants/tiers.ts).
    const { maxUsers } = getTierLimits(org.tier);

    const memberCount = await User.countDocuments({ tenantId });

    // Exclude the email being (re-)invited so a refresh doesn't count as a new seat.
    const pendingCount = await OrgInvite.countDocuments({
      tenantId,
      status: INVITE_STATUS.PENDING,
      email: { $ne: normalizedEmail },
    });

    if (memberCount + pendingCount >= maxUsers) {
      return NextResponse.json(
        {
          success: false,
          message: `Your ${org.tier} plan allows ${maxUsers} members. Upgrade to invite more.`,
          upgradeRequired: true,
        },
        { status: 403 }
      );
    }

    const invitedBy = (session.user as any).id as string;
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    // Upsert on { tenantId, email } — refreshes token + expiry for re-invites.
    const invite = await OrgInvite.findOneAndUpdate(
      { tenantId, email: normalizedEmail },
      {
        $set: { role, token, status: INVITE_STATUS.PENDING, invitedBy, expiresAt },
        $setOnInsert: { tenantId, email: normalizedEmail },
      },
      { upsert: true, new: true }
    );

    // Email delivery is deferred — no mailer exists yet. Return the link so
    // the calling UI can surface it or wire a transactional email provider later.
    const inviteLink = `https://${tenantId}.aupulens.online/accept-invite?token=${token}`;

    return NextResponse.json(
      {
        success: true,
        message: "Invitation created. Email delivery is not yet enabled — share the link manually.",
        data: {
          token,
          email: normalizedEmail,
          role,
          expiresAt,
          inviteLink,
          emailDeliveryDeferred: true,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Org invite error:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message || "Something went wrong" },
      { status: 500 }
    );
  }
}
