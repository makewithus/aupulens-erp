import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import OrgInvite from "@/models/auth/OrgInvite";
import User from "@/models/auth/User";
import { ENTITY_STATUS, INVITE_STATUS } from "@/lib/constants/statuses";
import { getTierLimits } from "@/lib/constants/tiers";
import { buildTenantUrl } from "@/lib/config";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const currentTenantId = (session.user as any).tenantId as string | undefined;
    if (!currentTenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Invite token is required" },
        { status: 400 }
      );
    }

    await connectDB();

    // Look up the invite by token — token is globally unique (see OrgInvite model).
    const invite = await OrgInvite.findOne({ token }).lean();
    if (!invite) {
      return NextResponse.json(
        { success: false, message: "Invalid or unknown invite token" },
        { status: 404 }
      );
    }

    // Status checks before date check so we give the most useful error.
    if (invite.status === INVITE_STATUS.ACCEPTED) {
      return NextResponse.json(
        { success: false, message: "This invitation has already been accepted" },
        { status: 409 }
      );
    }
    if (invite.status === INVITE_STATUS.REVOKED) {
      return NextResponse.json(
        { success: false, message: "This invitation has been revoked" },
        { status: 410 }
      );
    }
    if (invite.status === INVITE_STATUS.EXPIRED || invite.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, message: "This invitation has expired" },
        { status: 410 }
      );
    }

    // Verify the logged-in user's email matches the invite.
    const sessionEmail = (session.user.email ?? "").toLowerCase();
    if (sessionEmail !== invite.email) {
      return NextResponse.json(
        {
          success: false,
          message: `This invitation was sent to ${invite.email}. Please sign in with that account to accept.`,
        },
        { status: 403 }
      );
    }

    const targetTenantId = invite.tenantId;

    // Check if this user already exists in the target org.
    const existingMember = await User.findOne({
      tenantId: targetTenantId,
      email: invite.email,
    }).lean();

    if (existingMember) {
      // Attach: user already exists — mark accepted and return gracefully.
      await OrgInvite.updateOne({ token }, { $set: { status: INVITE_STATUS.ACCEPTED } });
      return NextResponse.json({
        success: true,
        message: "You are already a member of this organization. Invitation marked accepted.",
        data: { tenantId: targetTenantId, alreadyMember: true },
      });
    }

    // Re-check maxUsers at accept time — members could have been added between
    // invite creation and acceptance (invites may temporarily outpace seats).
    const org = await Organization.findOne({ subdomain: targetTenantId }).lean();
    if (!org) {
      return NextResponse.json(
        { success: false, message: "Target organization not found" },
        { status: 404 }
      );
    }

    // Tier-derived cap — single source of truth (lib/constants/tiers.ts).
    const { maxUsers } = getTierLimits(org.tier);
    const memberCount = await User.countDocuments({ tenantId: targetTenantId });
    if (memberCount >= maxUsers) {
      return NextResponse.json(
        {
          success: false,
          message: `This organization has reached its ${org.tier} plan member limit (${maxUsers}). Ask an admin to upgrade.`,
          upgradeRequired: true,
        },
        { status: 403 }
      );
    }

    // Copy caller's credentials into the target org (Step 2 / master-admin identity pattern).
    const callerUser = await User.findById((session.user as any).id).lean();
    if (!callerUser) {
      return NextResponse.json(
        { success: false, message: "Could not locate your user account" },
        { status: 404 }
      );
    }

    await User.create({
      name: callerUser.name,
      email: callerUser.email,
      phone: callerUser.phone || "0000000000",
      password: callerUser.password, // already hashed — same credentials for new workspace
      role: invite.role,
      status: ENTITY_STATUS.ACTIVE,
      tenantId: targetTenantId,
    });

    await OrgInvite.updateOne({ token }, { $set: { status: INVITE_STATUS.ACCEPTED } });

    return NextResponse.json(
      {
        success: true,
        message: "Invitation accepted. Re-authenticate on the new workspace to access it.",
        data: {
          tenantId: targetTenantId,
          role: invite.role,
          workspaceUrl: buildTenantUrl(targetTenantId),
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Org accept error:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message || "Something went wrong" },
      { status: 500 }
    );
  }
}
