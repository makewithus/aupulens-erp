/**
 * ensure-admin.ts
 * ──────────────────────────────────────────────────────
 * Creates or updates the master admin account.
 * Safe to re-run: it won't duplicate the user.
 *
 * Usage:
 *   npm run ensure-admin
 *
 * Credentials are read from .env:
 *   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME,
 *   ADMIN_PHONE, ADMIN_TENANT
 *
 * Works the same in dev AND prod — just run it once
 * after deploying to a new environment.
 * ──────────────────────────────────────────────────────
 */

import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// ── Load .env manually (same pattern as seed.ts) ──
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)?\s*$/);
    if (match) {
      let [, key, value = ""] = match;
      if (value.startsWith('"') && value.endsWith('"'))
        value = value.slice(1, -1);
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

const {
  MONGODB_URI,
  ADMIN_EMAIL    = "admin@aupulens.com",
  ADMIN_PASSWORD = "Aupulens@2026",
  ADMIN_NAME     = "Aupulens Admin",
  ADMIN_PHONE    = "+919999999999",
  ADMIN_TENANT   = "default-tenant",
} = process.env;

if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI is not set in .env");
  process.exit(1);
}

// ── Minimal inline schemas (avoid import-map issues in tsx) ──
import User         from "../models/User";
import Organization from "../models/Organization";
import { ENTITY_STATUS } from "../lib/constants/statuses";
import { seedChartOfAccounts } from "../lib/accounting/coa-seeder";

async function ensureAdmin() {
  console.log("🔌  Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI!);
  console.log("✅  Connected.\n");

  const email    = ADMIN_EMAIL.toLowerCase().trim();
  const tenantId = ADMIN_TENANT.trim();

  // ── 1. Upsert user ──────────────────────────────────
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
  let user = await User.findOne({ email, tenantId });

  if (user) {
    // Update password + ensure role=admin
    user.password = hashedPassword;
    user.role     = "admin";
    user.name     = ADMIN_NAME;
    user.phone    = ADMIN_PHONE;
    user.status   = ENTITY_STATUS.ACTIVE;
    await user.save();
    console.log(`♻️   Updated existing user: ${email}`);
  } else {
    user = await User.create({
      name:          ADMIN_NAME,
      email,
      phone:         ADMIN_PHONE,
      password:      hashedPassword,
      role:          "admin",
      status:        ENTITY_STATUS.ACTIVE,
      tenantId,
      dateOfJoining: new Date(),
    });
    console.log(`✨  Created new admin user: ${email}`);
  }

  // ── 2. Ensure default-tenant organization exists ────
  let org = await Organization.findOne({ subdomain: tenantId });
  if (!org) {
    org = await Organization.create({
      name:        "Aupulens Corporate HQ",
      subdomain:   tenantId,
      ownerUserId: user._id,
      isActive:    true,
      trialEndDate: new Date("2099-12-31"),
      settings: { currency: "INR", themeColor: "#1565c0" },
    });
    console.log(`🏢  Created organization: ${org.name}`);
  } else if (String(org.ownerUserId) !== String(user._id)) {
    org.ownerUserId = user._id as mongoose.Types.ObjectId;
    await org.save();
    console.log(`🏢  Updated org owner → admin`);
  } else {
    console.log(`🏢  Organization already exists: ${org.name}`);
  }

  // ── 3. Seed Chart of Accounts (idempotent) ──────────
  try {
    await seedChartOfAccounts(tenantId, String(user._id));
    console.log(`📊  Chart of Accounts seeded for "${tenantId}"`);
  } catch (e: any) {
    // duplicate key is fine — already seeded
    if (e?.code === 11000) {
      console.log(`📊  Chart of Accounts already seeded (skipped)`);
    } else {
      console.warn(`⚠️   COA seed warning: ${e.message}`);
    }
  }

  console.log(`
╔══════════════════════════════════════════════════╗
║           ✅  Admin Ready — Both Dev + Prod       ║
╠══════════════════════════════════════════════════╣
║  URL      :  http://localhost:3000/auth/admin    ║
║  Email    :  ${ADMIN_EMAIL.padEnd(34)}║
║  Password :  ${ADMIN_PASSWORD.padEnd(34)}║
║  Tenant   :  ${ADMIN_TENANT.padEnd(34)}║
║                                                  ║
║  Sign-in page:  /onboarding/signin               ║
║  Leave "domain" field blank or enter:            ║
║  default-tenant                                  ║
╚══════════════════════════════════════════════════╝
`);

  await mongoose.disconnect();
  process.exit(0);
}

ensureAdmin().catch((err) => {
  console.error("❌  ensure-admin failed:", err);
  process.exit(1);
});
