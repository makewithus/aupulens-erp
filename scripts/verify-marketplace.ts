/**
 * Part 4 live verification: publish a workflow package from tenant A, install it
 * into tenant B, and confirm a REAL, tenant-B-owned automation rule was created
 * (and that the sanitized payload carried no tenant/user ids). Cleans up.
 *
 * Run: npx tsx scripts/verify-marketplace.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

const PUB = "zz-market-publisher";
const INSTALLER = "zz-market-installer";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const MarketplacePackage = (await import("../models/MarketplacePackage")).default;
  const CrmAutomationRule = (await import("../models/crm/AutomationRule")).default;
  const { sanitizeWorkflow, installPackage } = await import("../lib/marketplace/packages");
  const uid = new mongoose.Types.ObjectId();

  await Promise.all([
    MarketplacePackage.deleteMany({ publisherTenantId: PUB }),
    CrmAutomationRule.deleteMany({ tenantId: INSTALLER }),
  ]);

  // 1) Publish (sanitize a tenant-A rule → package).
  const rawRule = {
    _id: new mongoose.Types.ObjectId(), tenantId: PUB, createdBy: uid, enabled: true,
    name: "High-value lead → task", entity: "Lead", trigger: "record_created",
    conditions: [{ field: "priority", operator: "equals", value: "High" }],
    actions: [{ type: "create_task", payload: { title: "Call new high-value lead" } }],
  };
  const payload = sanitizeWorkflow(rawRule)!;
  const leaks = ["tenantId", "createdBy", "_id"].filter((k) => k in (payload as any));
  console.log(`1. Sanitized payload leaks tenant/user ids? ${leaks.length ? leaks.join(",") : "NO (clean)"}`);

  const pkg = await MarketplacePackage.create({
    publisherTenantId: PUB, publisherName: "Publisher Co", name: rawRule.name,
    description: "Auto-task for high-value leads", category: "workflow", payload, createdBy: uid,
  });
  console.log(`2. Published package "${pkg.name}" (${pkg._id}).`);

  // 2) Install into tenant B.
  const before = await CrmAutomationRule.countDocuments({ tenantId: INSTALLER });
  const result = await installPackage("workflow", pkg.payload, INSTALLER, String(uid));
  const after = await CrmAutomationRule.countDocuments({ tenantId: INSTALLER });
  const created = await CrmAutomationRule.findOne({ tenantId: INSTALLER }).lean<any>();
  console.log(`3. Installed into tenant B → rules ${before} → ${after}. ${result.message}`);
  console.log(`   created rule: name="${created?.name}" tenantId=${created?.tenantId} enabled=${created?.enabled}`);

  const pass = leaks.length === 0 && after === before + 1 && created?.tenantId === INSTALLER && created?.enabled === false;
  console.log(pass ? "PASS: publish sanitizes, install creates a tenant-B-owned disabled rule" : "FAIL");

  await Promise.all([
    MarketplacePackage.deleteMany({ publisherTenantId: PUB }),
    CrmAutomationRule.deleteMany({ tenantId: INSTALLER }),
  ]);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
