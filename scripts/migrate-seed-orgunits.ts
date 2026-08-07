/**
 * OPT-IN migration (6.8): seed the OrgUnit hierarchy for a tenant from its
 * existing Departments — creating a root Company node and a linked Department
 * node per existing Department (preserving Department parent relationships).
 * Existing Department/Employee data is untouched; OrgUnit is an additive
 * overlay. Idempotent per tenant (skips if the tenant already has OrgUnits).
 *
 * Run: npx tsx scripts/migrate-seed-orgunits.ts <tenantId>
 */
import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) { console.error("Usage: npx tsx scripts/migrate-seed-orgunits.ts <tenantId>"); process.exit(1); }

  await mongoose.connect(process.env.MONGODB_URI as string);
  const OrgUnit = (await import("../models/OrgUnit")).default;
  const Department = (await import("../models/Department")).default;
  const Organization = (await import("../models/Organization")).default;
  const User = (await import("../models/User")).default;

  const existing = await OrgUnit.countDocuments({ tenantId });
  if (existing > 0) { console.log(`Tenant ${tenantId} already has ${existing} OrgUnit(s) — skipping (idempotent).`); await mongoose.disconnect(); return; }

  const org = await Organization.findOne({ subdomain: tenantId }).lean<{ name?: string }>();
  const anyUser = await User.findOne({ tenantId }).select("_id").lean<{ _id: any }>();
  if (!anyUser) { console.error(`No user found for tenant ${tenantId}; cannot set createdBy.`); process.exit(1); }

  const company = await OrgUnit.create({
    tenantId, name: org?.name || "Company", level: "Company", parentId: null, path: [],
    localization: { currency: "INR", language: "en-IN", timezone: "Asia/Kolkata", taxRegime: "GST-IN" },
    createdBy: anyUser._id,
  });
  console.log(`Created root Company node: ${company.name} (${company._id})`);

  const depts = await Department.find({ tenantId }).lean<{ _id: any; name: string; code?: string; parentDepartmentId?: any }[]>();
  const deptNodeByDeptId = new Map<string, any>();

  // First pass: create a Department node per existing Department under the Company.
  for (const d of depts) {
    const node = await OrgUnit.create({
      tenantId, name: d.name, code: d.code, level: "Department",
      parentId: company._id, path: [company._id],
      localization: {}, linkedDepartmentId: d._id, createdBy: anyUser._id,
    });
    deptNodeByDeptId.set(String(d._id), node);
  }
  // Second pass: re-parent to mirror Department parent relationships where set.
  for (const d of depts) {
    if (!d.parentDepartmentId) continue;
    const child = deptNodeByDeptId.get(String(d._id));
    const parent = deptNodeByDeptId.get(String(d.parentDepartmentId));
    if (child && parent) {
      child.parentId = parent._id;
      child.path = [...(parent.path || []), parent._id];
      await child.save();
    }
  }

  console.log(`Seeded ${depts.length} Department node(s) linked to existing Departments.`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
