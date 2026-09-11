/**
 * Idempotent upsert of the source-doc §8 plan catalogue
 * (lib/platform/entitlements/planCatalog.ts — the single source of truth
 * both this script and scripts/seed-platform-demo.ts read from).
 *
 * Usage: npx tsx scripts/seed-platform-plans.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import { seedPlans } from "../lib/platform/entitlements/planCatalog";

async function main() {
  await connectDB();
  await seedPlans();
  console.log("Seeded all plans.");
  await mongoose.connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
