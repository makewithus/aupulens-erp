import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "../lib/db";
import Organization from "../models/admin/Organization";
import User from "../models/auth/User";
import AdminUser from "../models/platform/AdminUser";
import OrganizationEntitlement from "../models/platform/OrganizationEntitlement";
import {
  ORGANIZATION_STATUS,
  PLAN_KEY,
  ENTITY_STATUS,
  ADMIN_ROLE,
  ADMIN_USER_STATUS,
} from "../lib/constants/statuses";

const ALL_MODULES = [
  "admin",
  "sales",
  "inventory",
  "finance",
  "manufacturing",
  "hr",
  "crm",
  "project",
];

const TENANT_ID = "default-tenant";

const CREDENTIALS_TO_SEED = [
  {
    name: "Krrish Global Admin",
    email: "krrish@dev.com",
    passwordPlain: "12345678abcd",
    phone: "+919876543200",
  },
  {
    name: "Global Admin",
    email: "global@admin.com",
    passwordPlain: "12345678abcd",
    phone: "+919876543201",
  },
  {
    name: "MWUS Admin",
    email: "mwus@test.com",
    passwordPlain: "12345678abcd",
    phone: "+919876543202",
  },
  {
    name: "MWU Dev",
    email: "mwudev2@gmail.com",
    passwordPlain: "Ghs5#%Shuwm",
    phone: "+919876543211",
  },
  {
    name: "Aupulens Test",
    email: "aupulens@test.com",
    passwordPlain: "test1234",
    phone: "+919876543212",
  },
  {
    name: "Test Admin",
    email: "test@gmail.com",
    passwordPlain: "Test@1234",
    phone: "+919876543213",
  },
];

async function seedCredentials() {
  await connectDB();
  console.log("Connected to MongoDB database:", mongoose.connection.name);

  // 1. Update Organization default-tenant with all modules & active enterprise status
  let org = await Organization.findOne({ subdomain: TENANT_ID });
  if (!org) {
    org = await Organization.create({
      name: "Aupulens Technologies",
      subdomain: TENANT_ID,
      status: ORGANIZATION_STATUS.ACTIVE,
      tier: "enterprise",
      isActive: true,
      subscriptionStatus: "active",
      maxUsers: 200,
      aiCallsPerMonth: 5000,
      settings: {
        themeColor: "#3b82f6",
        timezone: "Asia/Kolkata",
        currency: "INR",
        country: "India",
        industry: "Technology & Manufacturing",
        isGstRegistered: true,
        enabledModules: ALL_MODULES,
      },
    });
    console.log(`Created Organization '${TENANT_ID}' with all modules enabled.`);
  } else {
    org.isActive = true;
    org.status = ORGANIZATION_STATUS.ACTIVE;
    org.tier = "enterprise";
    org.subscriptionStatus = "active";
    if (!org.settings) (org as any).settings = {};
    org.settings.enabledModules = ALL_MODULES;
    await org.save();
    console.log(`Updated Organization '${TENANT_ID}' to active enterprise with all modules:`, ALL_MODULES);
  }

  // 2. Ensure OrganizationEntitlement has all modules
  await OrganizationEntitlement.findOneAndUpdate(
    { tenantId: TENANT_ID },
    {
      $set: {
        tenantId: TENANT_ID,
        planKey: PLAN_KEY.ENTERPRISE,
        status: "active",
        effectiveAt: new Date(),
        assignedByActorId: "system-seed",
        assignedByActorRole: "global_super_admin",
        source: "direct_assignment",
        modules: ALL_MODULES,
        overrides: {
          modules: ALL_MODULES,
        },
      },
    },
    { upsert: true, new: true }
  );
  console.log(`Updated OrganizationEntitlement for '${TENANT_ID}' with all modules.`);

  // 3. Upsert Users in User collection (workspace / tenant login)
  for (const cred of CREDENTIALS_TO_SEED) {
    const normalizedEmail = cred.email.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(cred.passwordPlain, 10);

    const user = await User.findOneAndUpdate(
      { email: normalizedEmail, tenantId: TENANT_ID },
      {
        $set: {
          name: cred.name,
          email: normalizedEmail,
          password: hashedPassword,
          role: "admin",
          userRole: "admin",
          status: ENTITY_STATUS.ACTIVE,
          tenantId: TENANT_ID,
          phone: cred.phone,
          permissions: [],
        },
      },
      { upsert: true, new: true }
    );
    console.log(`[User] Upserted user: ${normalizedEmail} (ID: ${user._id}, Role: admin, Tenant: ${TENANT_ID})`);

    // Verify password match
    const isValid = await bcrypt.compare(cred.passwordPlain, user.password);
    console.log(`  -> Password verification for ${normalizedEmail}: ${isValid ? "PASSED" : "FAILED"}`);

    // 4. Also upsert in User collection for master-admin portal
    await User.findOneAndUpdate(
      { email: normalizedEmail, tenantId: "master" },
      {
        $set: {
          name: cred.name,
          email: normalizedEmail,
          password: hashedPassword,
          role: "master-admin",
          userRole: "admin",
          status: ENTITY_STATUS.ACTIVE,
          tenantId: "master",
          phone: cred.phone,
          permissions: [],
        },
      },
      { upsert: true, new: true }
    );
    console.log(`[User] Upserted master-admin: ${normalizedEmail}`);

    // 5. Also upsert in AdminUser collection (global admin platform login)
    await AdminUser.findOneAndUpdate(
      { email: normalizedEmail },
      {
        $set: {
          name: cred.name,
          email: normalizedEmail,
          passwordHash: hashedPassword,
          role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
          status: ADMIN_USER_STATUS.ACTIVE,
          mfaEnabled: false,
          failedLoginCount: 0,
        },
      },
      { upsert: true, new: true }
    );
    console.log(`[AdminUser] Upserted global admin: ${normalizedEmail}`);
  }

  console.log("\nAll credentials seeded and verified successfully!");
  await mongoose.disconnect();
}

seedCredentials().catch((err) => {
  console.error("Error seeding credentials:", err);
  process.exit(1);
});
