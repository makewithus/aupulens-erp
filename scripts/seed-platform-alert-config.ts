/**
 * Idempotent upsert of the singleton alert-threshold config (source doc
 * §28, Phase 9 Addendum C Part 3). Safe to re-run.
 *
 * Usage: npx tsx scripts/seed-platform-alert-config.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import PlatformAlertConfig from "../models/platform/PlatformAlertConfig";

async function main() {
  await connectDB();
  await PlatformAlertConfig.findOneAndUpdate(
    { singleton: true },
    {
      $setOnInsert: {
        singleton: true,
        failedLoginThreshold: 5,
        permissionFailureThreshold: 10,
        permissionFailureWindowMinutes: 60,
        largeDowngradeTierDrop: 2,
        aiCostSpikeMultiplier: 3,
        aiCostSpikeTrailingDays: 7,
      },
    },
    { upsert: true, new: true },
  );
  console.log("Seeded PlatformAlertConfig (defaults only if none existed — re-run does not overwrite an edited config).");
  await mongoose.connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
