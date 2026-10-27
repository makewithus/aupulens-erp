import "dotenv/config";
import mongoose, { Types } from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "../lib/db";
import Organization from "../models/admin/Organization";
import User from "../models/auth/User";
import Plan from "../models/platform/Plan";
import OrganizationEntitlement from "../models/platform/OrganizationEntitlement";
import { DocumentSettings } from "../models/sales/DocumentSettings";
import {
  ORGANIZATION_STATUS,
  ORGANIZATION_TYPE,
  PLAN_KEY,
  ENTITY_STATUS,
} from "../lib/constants/statuses";

const TENANT_ID = "default-tenant";
const ADMIN_USER_ID = new Types.ObjectId("6a215dc202e80e4219f412c0");
const SALES_USER_ID = new Types.ObjectId("6a1f1d9f90da1d224b7a84fc");

async function bootstrap() {
  await connectDB();
  console.log("Connected to MongoDB:", mongoose.connection.name);

  // 1. Ensure Organization
  let org = await Organization.findOne({ subdomain: TENANT_ID });
  if (!org) {
    org = await Organization.create({
      _id: new Types.ObjectId(),
      name: "Aupulens Technologies",
      subdomain: TENANT_ID,
      ownerUserId: ADMIN_USER_ID,
      status: ORGANIZATION_STATUS.ACTIVE,
      organizationType: ORGANIZATION_TYPE.ENTERPRISE,
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
        state: "Maharashtra",
        city: "Mumbai",
        pincode: "400051",
        addressLine1: "402, Trade Tower, Bandra Kurla Complex",
        addressLine2: "Bandra East",
        industry: "Technology & Manufacturing",
        isGstRegistered: true,
        gstin: "27AAAAA0000A1Z5",
        enabledModules: [
          "admin",
          "sales",
          "inventory",
          "finance",
          "manufacturing",
          "hr",
          "crm",
          "project",
        ],
      },
    });
    console.log("Created Organization for", TENANT_ID);
  } else {
    org.isActive = true;
    org.status = ORGANIZATION_STATUS.ACTIVE;
    org.tier = "enterprise";
    if (!org.settings) (org as any).settings = {};
    org.settings.enabledModules = [
      "admin",
      "sales",
      "inventory",
      "finance",
      "manufacturing",
      "hr",
      "crm",
      "project",
    ];
    await org.save();
    console.log("Updated Organization for", TENANT_ID);
  }

  // 2. Ensure Plan & OrganizationEntitlement
  const plan = await Plan.findOne({ key: PLAN_KEY.ENTERPRISE });
  if (!plan) {
    console.warn("Enterprise plan not found, checking existing plans...");
  }

  await OrganizationEntitlement.findOneAndUpdate(
    { tenantId: TENANT_ID },
    {
      $set: {
        tenantId: TENANT_ID,
        planKey: PLAN_KEY.ENTERPRISE,
        status: "active",
        effectiveAt: new Date(),
        assignedByActorId: "system-bootstrap",
        assignedByActorRole: "global_super_admin",
        source: "direct_assignment",
        modules: [
          "admin",
          "sales",
          "inventory",
          "finance",
          "manufacturing",
          "hr",
          "crm",
          "project",
        ],
      },
    },
    { upsert: true, new: true }
  );
  console.log("Ensured OrganizationEntitlement for", TENANT_ID);

  // 3. Ensure Admin User
  const adminPasswordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "Aupulens@2026", 10);
  await User.findOneAndUpdate(
    { email: (process.env.ADMIN_EMAIL || "admin@aupulens.com").toLowerCase().trim() },
    {
      $set: {
        name: process.env.ADMIN_NAME || "Aupulens Admin",
        email: (process.env.ADMIN_EMAIL || "admin@aupulens.com").toLowerCase().trim(),
        password: adminPasswordHash,
        role: "admin",
        status: ENTITY_STATUS.ACTIVE,
        tenantId: TENANT_ID,
        phone: process.env.ADMIN_PHONE || "+919999999999",
      },
      $setOnInsert: {
        _id: ADMIN_USER_ID,
      },
    },
    { upsert: true, new: true }
  );
  console.log("Ensured Admin User:", process.env.ADMIN_EMAIL || "admin@aupulens.com");

  // 4. Ensure Sales User David Davis
  const salesPasswordHash = await bcrypt.hash("Aupulens@2026", 10);
  await User.findOneAndUpdate(
    { email: "david@aupulens.com" },
    {
      $set: {
        name: "David Davis",
        email: "david@aupulens.com",
        password: salesPasswordHash,
        role: "sales",
        status: ENTITY_STATUS.ACTIVE,
        tenantId: TENANT_ID,
        phone: "+919876543210",
      },
      $setOnInsert: {
        _id: SALES_USER_ID,
      },
    },
    { upsert: true, new: true }
  );
  console.log("Ensured Sales User: david@aupulens.com");

  // 5. Ensure DocumentSettings
  let docSettings = await (DocumentSettings as any).findOne({ tenantId: TENANT_ID });
  if (!docSettings) {
    docSettings = new DocumentSettings({
      tenantId: TENANT_ID,
      display: {
        showHsnSummary: true,
        showDispatchAddress: true,
      },
      signatures: [
        {
          name: "Authorized Signatory",
          imageUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        },
      ],
    });
    await docSettings.save();
    console.log("Created DocumentSettings for", TENANT_ID);
  }

  console.log("Bootstrap complete!");
  await mongoose.disconnect();
}

bootstrap().catch((err) => {
  console.error("Bootstrap error:", err);
  process.exit(1);
});
