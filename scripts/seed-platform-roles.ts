/**
 * Idempotent upsert of the Global Admin §30 permission matrix
 * (models/platform/AdminRole.ts). Safe to re-run any time the matrix
 * changes — each role's `capabilities` array is fully replaced, never
 * merged, so removing a capability here actually removes it.
 *
 * The matrix itself lives in lib/platform/auth/roleMatrix.ts — the single
 * source of truth both this script and tests/platform/permissionMatrix.test.ts
 * read from, so the seeded database and the test's assertions can never
 * silently drift apart. The exact capability set per role is this project's
 * own inferred default, not a quoted source-doc table — see
 * docs/admin/OPEN_QUESTIONS.md #6. Correcting it is a one-file change in
 * that shared module, never a code change, per Hard Rule 6.
 *
 * Usage: npx tsx scripts/seed-platform-roles.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import AdminRole from "../models/platform/AdminRole";
import { ROLE_MATRIX } from "../lib/platform/auth/roleMatrix";

async function main() {
  await connectDB();
  for (const [role, { capabilities, description }] of Object.entries(ROLE_MATRIX)) {
    await AdminRole.findOneAndUpdate(
      { role },
      { $set: { role, capabilities, description } },
      { upsert: true, new: true },
    );
    console.log(`Seeded AdminRole ${role} (${capabilities.length} capabilities)`);
  }
  await mongoose.connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
