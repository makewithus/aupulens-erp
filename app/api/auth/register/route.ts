import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import connectDB from "@/lib/db";
import User from "@/models/User";
import Organization from "@/models/Organization";
import { ENTITY_STATUS } from "@/lib/constants/statuses";

const DEFAULT_TENANT_ID = "default-tenant";

function normalizeTenantId(value?: string | null): string {
  const normalized = (value || DEFAULT_TENANT_ID).trim().toLowerCase();
  return normalized === "default" ? DEFAULT_TENANT_ID : normalized;
}

function isValidTenantSlug(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(value);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      email,
      phone,
      password,
      companyName,
      subdomain,
      tenantId: bodyTenantId,
      country,
      state,
      industry,
      isGstRegistered,
      enabledModules,
    } = body;

    if (!name || !email || !phone || !password) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 },
      );
    }

    // Email validation
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 },
      );
    }

    // Password validation
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }

    const headerTenantId = req.headers.get("x-tenant-id");
    const tenantId = normalizeTenantId(
      subdomain || bodyTenantId || headerTenantId,
    );
    const normalizedEmail = email.toLowerCase().trim();

    if (tenantId !== DEFAULT_TENANT_ID && !isValidTenantSlug(tenantId)) {
      return NextResponse.json(
        { error: "Tenant subdomain must be a valid DNS-safe slug" },
        { status: 400 },
      );
    }

    await connectDB();

    // Check if user already exists within the selected tenant.
    const existingUser = await User.findOne({
      email: normalizedEmail,
      tenantId,
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists in this organization" },
        { status: 409 },
      );
    }

    const tenantUserCount = await User.countDocuments({ tenantId });
    // Default to true to allow registration of test accounts/users in prod/dev unless explicitly set to "false"
    const allowPublicRegistration =
      process.env.ALLOW_PUBLIC_REGISTRATION !== "false";

    if (tenantUserCount > 0 && !allowPublicRegistration) {
      return NextResponse.json(
        {
          error:
            "Public registration is disabled for this organization. Ask an administrator to create your user account.",
        },
        { status: 403 },
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    let organization = null;
    if (tenantId !== DEFAULT_TENANT_ID) {
      organization = await Organization.findOne({ subdomain: tenantId });

      if (!organization) {
        const temporaryOwnerUserId = new Types.ObjectId();
        organization = await Organization.create({
          name: companyName || `${name}'s Organization`,
          subdomain: tenantId,
          ownerUserId: temporaryOwnerUserId,
          settings: {
            themeColor: "#3b82f6",
            timezone: "Asia/Kolkata",
            currency: "INR",
            country: country || "India",
            state: state || "",
            industry: industry || "",
            isGstRegistered: !!isGstRegistered,
            enabledModules: enabledModules || [],
          },
        });
      }
    }

    const tempToken = `autologin_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const tempTokenExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity

    // Create user
    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      phone: String(phone).trim(),
      password: hashedPassword,
      role: "admin",
      status: ENTITY_STATUS.ACTIVE,
      dateOfJoining: new Date(),
      tenantId,
      tempToken,
      tempTokenExpiry,
    });

    if (organization && String(organization.ownerUserId) !== String(user._id)) {
      organization.ownerUserId = user._id as Types.ObjectId;
      await organization.save();
    }

    // Seed default hierarchical Chart of Accounts for this tenant
    try {
      const { seedChartOfAccounts } = await import("@/lib/accounting/coa-seeder");
      const { seedNewChartOfAccounts } = await import("@/lib/accounting/coa-feature-seeder");
      await seedChartOfAccounts(tenantId, String(user._id));
      await seedNewChartOfAccounts(tenantId, String(user._id));
    } catch (coaError) {
      console.error("Failed to seed Chart of Accounts on registration:", coaError);
      // We do not fail the registration if COA seeding fails, but log it
    }

    return NextResponse.json(
      {
        message: "Admin account created successfully",
        tempToken,
        user: {
          id: String(user._id),
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status,
          tenantId: user.tenantId,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Something went wrong" },
      { status: 500 },
    );
  }
}
