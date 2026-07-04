import mongoose from "mongoose";
import connectDB from "./lib/db";
import { seedNewChartOfAccounts } from "./lib/accounting/coa-feature-seeder";
import User from "./models/User";
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function run() {
  await connectDB();
  const user = await User.findOne({ role: "master-admin" });
  if (!user) {
    console.log("No user found");
    process.exit(1);
  }
  const tenantId = user.tenantId || "default-tenant";
  
  try {
    await seedNewChartOfAccounts(tenantId, user._id.toString());
  } catch (e: any) {
    console.error("Error during seeding:");
    if (e.writeErrors) {
      console.error(JSON.stringify(e.writeErrors[0], null, 2));
    } else {
      console.error(e);
    }
  }
  process.exit(0);
}

run();
