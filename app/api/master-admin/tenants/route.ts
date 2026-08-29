import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import User from "@/models/auth/User";
import bcrypt from "bcryptjs";
import { ENTITY_STATUS } from "@/lib/constants/statuses";
import { buildTenantUrl } from "@/lib/config";
import { Types } from "mongoose";

function normalizeSubdomain(value: string): string {
  return value.trim().toLowerCase();
}

function isValidSubdomain(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(value);
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user.role !== "master-admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizations = await Organization.find()
          .populate("ownerUserId", "email name phone")
          .sort({ createdAt: -1 }).lean();

    return NextResponse.json({ organizations }, { status: 200 });
  } catch (error: unknown) {
    console.error("Get tenants error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Something went wrong" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user.role !== "master-admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, subdomain, ownerEmail, ownerPassword } = await req.json();

    if (!name || !subdomain || !ownerEmail || !ownerPassword) {
      return NextResponse.json(
        { error: "Name, subdomain, owner email, and password are required" },
        { status: 400 },
      );
    }

    const normalizedSubdomain = normalizeSubdomain(subdomain);
    const normalizedOwnerEmail = String(ownerEmail).trim().toLowerCase();

    if (!isValidSubdomain(normalizedSubdomain)) {
      return NextResponse.json(
        { error: "Subdomain must be a valid DNS-safe slug" },
        { status: 400 },
      );
    }

    await connectDB();

    // Check if subdomain is already taken
    const existingOrg = await Organization.findOne({
      subdomain: normalizedSubdomain,
    });
    if (existingOrg) {
      return NextResponse.json(
        { error: "Subdomain already exists" },
        { status: 409 },
      );
    }

    const existingOwner = await User.findOne({
      tenantId: normalizedSubdomain,
      email: normalizedOwnerEmail,
    });
    if (existingOwner) {
      return NextResponse.json(
        { error: "Owner email already exists for this tenant" },
        { status: 409 },
      );
    }

    // Create organization
    // Using a temporary ownerUserId which will be updated
    const temporaryOwnerUserId = new Types.ObjectId();
    const organization = await Organization.create({
      name,
      subdomain: normalizedSubdomain,
      ownerUserId: temporaryOwnerUserId,
    });

    // Hash owner password
    const hashedPassword = await bcrypt.hash(ownerPassword, 12);

    // Create owner user in the new organization
    // Using SUBDOMAIN as tenantId as requested
    const ownerUser = await User.create({
      name: `${name} Admin`,
      email: normalizedOwnerEmail,
      phone: "0000000000",
      password: hashedPassword,
      role: "admin",
      status: ENTITY_STATUS.ACTIVE,
      tenantId: normalizedSubdomain,
    });

    // Update organization with actual owner user ID
    organization.ownerUserId = ownerUser._id as any;
    await organization.save();

    return NextResponse.json(
      {
        message: "Tenant created successfully",
        tenant: {
          id: organization._id,
          name: organization.name,
          subdomain: organization.subdomain,
          url: buildTenantUrl(organization.subdomain),
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Create tenant error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Something went wrong" },
      { status: 500 },
    );
  }
}
