/**
 * Removes everything scripts/seed-platform-demo.ts creates, and only that —
 * matched by the `demo-` subdomain prefix and the demo admin's email, so a
 * real organisation or admin user created separately is never touched.
 * Testers must never have to invent data or manually clean up after
 * exploring the demo (source doc Part 5.4).
 *
 * Usage: npx tsx scripts/reset-platform-demo.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import Organization from "../models/admin/Organization";
import User from "../models/auth/User";
import Account from "../models/finance/Account";
import AdminUser from "../models/platform/AdminUser";
import OrganizationEntitlement from "../models/platform/OrganizationEntitlement";
import AiUsageRecord from "../models/platform/AiUsageRecord";
import AiUsageDaily from "../models/platform/AiUsageDaily";
import AiUsageMonthly from "../models/platform/AiUsageMonthly";
import SubscriptionEvent from "../models/admin/SubscriptionEvent";
import PlatformAlert from "../models/platform/PlatformAlert";

const DEMO_SUBDOMAIN_PREFIX = "demo-";
const DEMO_ADMIN_EMAIL = "demo-admin@aupulens.local";

async function main() {
  await connectDB();

  const demoOrgs = await Organization.find({ subdomain: { $regex: `^${DEMO_SUBDOMAIN_PREFIX}` } }).lean();
  const demoSubdomains = demoOrgs.map((o) => o.subdomain);

  if (demoSubdomains.length === 0) {
    console.log("No demo organisations found — nothing to reset.");
  } else {
    console.log(`Removing ${demoSubdomains.length} demo organisation(s): ${demoSubdomains.join(", ")}`);
    await User.deleteMany({ tenantId: { $in: demoSubdomains } });
    await Account.deleteMany({ tenantId: { $in: demoSubdomains } });
    await OrganizationEntitlement.deleteMany({ tenantId: { $in: demoSubdomains } });
    await AiUsageRecord.deleteMany({ tenantId: { $in: demoSubdomains } });
    await AiUsageDaily.deleteMany({ tenantId: { $in: demoSubdomains } });
    await AiUsageMonthly.deleteMany({ tenantId: { $in: demoSubdomains } });
    await SubscriptionEvent.deleteMany({ tenantId: { $in: demoSubdomains } });
    await PlatformAlert.deleteMany({ tenantId: { $in: demoSubdomains } });
    await Organization.deleteMany({ subdomain: { $in: demoSubdomains } });
  }

  const demoAdmin = await AdminUser.findOne({ email: DEMO_ADMIN_EMAIL });
  if (demoAdmin) {
    await AdminUser.deleteOne({ email: DEMO_ADMIN_EMAIL });
    console.log(`Removed demo AdminUser ${DEMO_ADMIN_EMAIL}.`);
  }

  console.log("Demo reset complete. PlatformAuditLog entries for demo activity are intentionally NOT deleted — audit history is append-only by design; run the retention sweep if you need them cleared.");
  await mongoose.connection.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
