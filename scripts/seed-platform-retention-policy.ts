/**
 * Idempotent upsert of the platform default retention policy (source doc
 * §27's own 30d/90d/1y/3y/7y/custom list — 90 days is used as the default
 * baseline here, long enough for routine investigation, short of a full
 * year so storage doesn't grow unbounded by default). A tenant/org-type/
 * event-specific override is a separate RetentionPolicy row, created via
 * the admin UI or a targeted script — this script only ever touches the
 * single platform-default row (isDefault: true, no other filters set).
 *
 * Usage: npx tsx scripts/seed-platform-retention-policy.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import RetentionPolicy from "../models/platform/RetentionPolicy";

async function main() {
  await connectDB();
  await RetentionPolicy.findOneAndUpdate(
    { isDefault: true },
    { $set: { isDefault: true, retentionDays: 90 } },
    { upsert: true },
  );
  console.log("Seeded platform default RetentionPolicy (90 days)");
  await mongoose.connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
