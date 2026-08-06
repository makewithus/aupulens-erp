import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Organization from "@/models/Organization";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import { ORGANIZATION_TIER_VALUES, SUBSCRIPTION_EVENT_TYPE } from "@/lib/constants/statuses";
import { appendSubscriptionEvent } from "@/lib/billing/appendSubscriptionEvent";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session || session.user.role !== "master-admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const {
      name,
      ownerEmail,
      ownerPhone,
      ownerPassword,
      isActive,
      subscriptionStatus,
      tier,
    } = await req.json();

    if (tier !== undefined && !ORGANIZATION_TIER_VALUES.includes(tier)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    await connectDB();

    const organization = await Organization.findById(id);
    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    // Update organization fields
    if (name) organization.name = name;
    if (isActive !== undefined) organization.isActive = isActive;
    if (subscriptionStatus)
      organization.subscriptionStatus = subscriptionStatus;

    // Real tier-change event (Phase 3) — no self-serve billing/payment
    // gateway exists yet (Phase 6.7), so this is the one real tier-change
    // path in the app today: a master-admin manually changing a tenant's
    // plan (e.g. after an off-platform sales conversation), not a fake
    // checkout flow. Logged as a real SubscriptionEvent either way.
    const previousTier = organization.tier;
    if (tier !== undefined && tier !== previousTier) {
      organization.tier = tier;
      const prevRank = ORGANIZATION_TIER_VALUES.indexOf(previousTier);
      const newRank = ORGANIZATION_TIER_VALUES.indexOf(tier);
      await appendSubscriptionEvent({
        tenantId: organization.subdomain,
        type: newRank > prevRank ? SUBSCRIPTION_EVENT_TYPE.UPGRADED : SUBSCRIPTION_EVENT_TYPE.DOWNGRADED,
        tier,
        meta: { previousTier, changedBy: session.user.id },
      });
    }

    await organization.save();

    // Update owner user if details provided
    if (organization.ownerUserId) {
      const ownerUser = await User.findById(organization.ownerUserId);
      if (ownerUser) {
        if (ownerEmail) ownerUser.email = ownerEmail;
        if (ownerPhone) ownerUser.phone = ownerPhone;
        if (ownerPassword) {
          ownerUser.password = await bcrypt.hash(ownerPassword, 12);
        }
        await ownerUser.save();
      }
    }

    return NextResponse.json(
      { message: "Tenant updated successfully" },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("Update tenant error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Something went wrong" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session || session.user.role !== "master-admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    await connectDB();

    const organization = await Organization.findById(id);
    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    // Optional: Delete all users and data associated with this tenant
    // For now, just delete org and owner user to be safe but thorough enough
    if (organization.ownerUserId) {
      await User.findByIdAndDelete(organization.ownerUserId);
    }

    // Also delete any other users belonging to this tenant
    await User.deleteMany({ tenantId: organization.subdomain });

    await Organization.findByIdAndDelete(id);

    return NextResponse.json(
      { message: "Tenant deleted successfully" },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("Delete tenant error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Something went wrong" },
      { status: 500 },
    );
  }
}
