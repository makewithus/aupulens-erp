import { checkAuthRateLimit } from "@/lib/auth/rateLimit";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { registrationTransaction } from "@/lib/auth/registrationTransaction";
import connectDB from "@/lib/db";
import User from "@/models/auth/User";
import Organization from "@/models/admin/Organization";
import { ENTITY_STATUS, SUBSCRIPTION_EVENT_TYPE } from "@/lib/constants/statuses";
import { appendSubscriptionEvent } from "@/lib/billing/appendSubscriptionEvent";
import { getCountryInfo } from "@/lib/constants/countries";

const DEFAULT_TENANT_ID = "default-tenant";

function normalizeTenantId(value?: string | null): string {
  const normalized = (value || DEFAULT_TENANT_ID).trim().toLowerCase();
  return normalized === "default" ? DEFAULT_TENANT_ID : normalized;
}

function isValidTenantSlug(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(value);
}

export async function POST(req: NextRequest) {
  const limited = await checkAuthRateLimit(req, "/api/auth/register");
  if (limited) return limited;

  try {
    if (process.env.ALLOW_PUBLIC_REGISTRATION !== "true") {
      return NextResponse.json(
        { error: "Public registration is disabled. Ask an administrator for an invitation.", code: "PUBLIC_REGISTRATION_DISABLED" },
        { status: 403 },
      );
    }
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

    // All tenant provisioning writes either commit together or roll back together.
    return await registrationTransaction(async (session) => {
    const options = session ? { session } : {};
    // Check if user already exists within the selected tenant.
    const existingUser = await User.findOne({
      email: normalizedEmail,
      tenantId,
    }, null, options);
    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists in this organization" },
        { status: 409 },
      );
    }

    const tenantUserCount = await User.countDocuments({ tenantId }, options);
    let organization: any = null;
    let isNewOrganization = false;

    if (tenantId !== DEFAULT_TENANT_ID) {
      organization = await Organization.findOne({ subdomain: tenantId }, null, options);

      if (organization) {
        // AUP-002: Public self-registration CANNOT register into an existing organization.
        // It must NOT create admins or overwrite ownership of existing organizations.
        return NextResponse.json(
          {
            error:
              "An organization with this subdomain already exists. Please sign in or ask your organization administrator for an invitation.",
            code: "ORGANIZATION_EXISTS",
          },
          { status: 409 },
        );
      }

      // Create new organization
      isNewOrganization = true;
      const temporaryOwnerUserId = new Types.ObjectId();
      const countryInfo = getCountryInfo(country || "India");
      const organizationData = {
        name: companyName || `${name}'s Organization`,
        subdomain: tenantId,
        ownerUserId: temporaryOwnerUserId,
        settings: {
          themeColor: "#3b82f6",
          timezone: countryInfo.timezone,
          currency: countryInfo.currencyCode,
          country: country || "India",
          state: state || "",
          industry: industry || "",
          isGstRegistered: !!isGstRegistered,
          enabledModules: enabledModules || [],
        },
      };
      organization = session ? (await Organization.create([organizationData], options))[0] : await Organization.create(organizationData);

      // Real billing-history event (Phase 3)
      await appendSubscriptionEvent({
        tenantId: organization.subdomain,
        type: SUBSCRIPTION_EVENT_TYPE.CREATED,
        tier: organization.tier,
      }, session);
    } else {
      if (tenantUserCount > 0) {
        return NextResponse.json(
          {
            error:
              "Public registration is disabled for this organization. Ask an administrator to create your user account.",
            code: "PUBLIC_REGISTRATION_DISABLED",
          },
          { status: 403 },
        );
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // AUP-010: Cryptographically secure temporary token with SHA-256 hash storage
    const rawTempToken = `autologin_${crypto.randomBytes(24).toString("hex")}`;
    const tempTokenHash = crypto
      .createHash("sha256")
      .update(rawTempToken)
      .digest("hex");
    const tempTokenExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity

    // Create user
    const userData = {
      name: String(name).trim(),
      email: normalizedEmail,
      phone: String(phone).trim(),
      password: hashedPassword,
      role: "admin",
      status: ENTITY_STATUS.ACTIVE,
      dateOfJoining: new Date(),
      tenantId,
      tempTokenHash,
      tempTokenExpiry,
    };
    const user = session ? (await User.create([userData], options))[0] : await User.create(userData);

    // Only assign ownership if this organization was newly created in this request
    if (isNewOrganization && organization) {
      organization.ownerUserId = user._id as Types.ObjectId;
      await organization.save(options);
    }

    const { seedChartOfAccounts } = await import("@/lib/accounting/coa-seeder");
    const { seedNewChartOfAccounts } = await import("@/lib/accounting/coa-feature-seeder");
    await seedChartOfAccounts(tenantId, String(user._id), session);
    await seedNewChartOfAccounts(tenantId, String(user._id), session);

    return NextResponse.json(
      {
        message: "Admin account created successfully",
        tempToken: rawTempToken,
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
      { status: 201, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
    );
    });
  } catch (error: unknown) {
    // Do not expose database errors or onboarding credentials in logs/responses.
    if ((error as any)?.code === 11000) {
      return NextResponse.json({ error: "Organization or account already exists", code: "ORGANIZATION_EXISTS" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Registration failed. Please try again or contact support.", code: "REGISTRATION_FAILED" },
      { status: 500 },
    );
  }
}
