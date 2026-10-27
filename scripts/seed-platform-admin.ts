/**
 * Idempotent bootstrap of exactly one GLOBAL_SUPER_ADMIN AdminUser. Solves
 * the chicken-and-egg problem: the Global Admin control plane has no
 * self-service signup (by design — Part 2.2), so the very first admin
 * account cannot be created through the platform itself.
 *
 * MFA is deliberately left disabled here (mfaEnabled: false) — the account
 * is forced through the first-login MFA enrollment flow
 * (app/platform/login/mfa) before any session is ever usable, matching
 * source doc §25's "MFA is mandatory for admin login" for every account,
 * including this one.
 *
 * Requires PLATFORM_BOOTSTRAP_ADMIN_EMAIL and PLATFORM_BOOTSTRAP_ADMIN_PASSWORD
 * env vars. If an AdminUser with that email already exists, this is a no-op
 * (never resets an existing password) — safe to re-run.
 *
 * Usage: npx tsx scripts/seed-platform-admin.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "../lib/db";
import AdminUser from "../models/platform/AdminUser";
import { ADMIN_ROLE, ADMIN_USER_STATUS } from "../lib/constants/statuses";

async function main() {
  const email = process.env.PLATFORM_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_BOOTSTRAP_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      "Set PLATFORM_BOOTSTRAP_ADMIN_EMAIL and PLATFORM_BOOTSTRAP_ADMIN_PASSWORD before running this script.",
    );
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("PLATFORM_BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }

  await connectDB();

  const existing = await AdminUser.findOne({ email });
  if (existing) {
    console.log(`AdminUser ${email} already exists (role: ${existing.role}) — no changes made.`);
    await mongoose.connection.close();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await AdminUser.create({
    name: "Platform Bootstrap Admin",
    email,
    passwordHash,
    role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
    status: ADMIN_USER_STATUS.ACTIVE,
    mfaEnabled: false,
  });

  console.log(`Created GLOBAL_SUPER_ADMIN AdminUser ${email} (id: ${admin._id}).`);
  console.log("Sign in at /platform/login — you will be required to enroll MFA immediately.");
  await mongoose.connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
