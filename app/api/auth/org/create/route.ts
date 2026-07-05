import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Organization from "@/models/Organization";
import User from "@/models/User";
import { ENTITY_STATUS } from "@/lib/constants/statuses";
import { buildTenantUrl } from "@/lib/config";
import { Types } from "mongoose";

function normalizeSubdomain(value: string): string {
  return value.trim().toLowerCase();
}

function isValidSubdomain(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(value);
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id as string;
    const currentTenantId = (session.user as any).tenantId as string | undefined;
    if (!currentTenantId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, subdomain } = body;

    if (!name || !subdomain) {
      return NextResponse.json(
        { error: "Name and subdomain are required" },
        { status: 400 }
      );
    }

    const normalizedSubdomain = normalizeSubdomain(subdomain);

    if (!isValidSubdomain(normalizedSubdomain)) {
      return NextResponse.json(
        { error: "Subdomain must be a valid DNS-safe slug (lowercase letters, digits, hyphens; no leading/trailing hyphen)" },
        { status: 400 }
      );
    }

    await connectDB();

    // Check subdomain uniqueness
    const existing = await Organization.findOne({ subdomain: normalizedSubdomain }).lean();
    if (existing) {
      return NextResponse.json({ error: "Subdomain already taken" }, { status: 409 });
    }

    // Look up caller's User record to clone identity into the new org
    const callerUser = await User.findById(userId).lean();
    if (!callerUser) {
      return NextResponse.json({ error: "Caller user not found" }, { status: 404 });
    }

    // Mirror master-admin tenant-creation pattern:
    // 1. Create org with a placeholder ownerUserId
    // 2. Create the caller's admin account in the new org (same credentials — re-auth per org)
    // 3. Update org with the real User _id
    const temporaryOwnerUserId = new Types.ObjectId();
    const organization = await Organization.create({
      name,
      subdomain: normalizedSubdomain,
      ownerUserId: temporaryOwnerUserId,
      // tier / maxUsers / aiCallsPerMonth use schema defaults (starter)
    });

    const ownerUser = await User.create({
      name: callerUser.name,
      email: callerUser.email,
      phone: callerUser.phone || "0000000000",
      password: callerUser.password, // already hashed — same credentials for the new workspace
      role: "admin",
      status: ENTITY_STATUS.ACTIVE,
      tenantId: normalizedSubdomain,
    });

    organization.ownerUserId = ownerUser._id as any;
    await organization.save();

    return NextResponse.json(
      {
        message: "Organization created successfully",
        organization: {
          id: organization._id,
          name: organization.name,
          subdomain: organization.subdomain,
          tier: organization.tier,
          url: buildTenantUrl(organization.subdomain),
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Self-service org creation error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Something went wrong" },
      { status: 500 }
    );
  }
}
