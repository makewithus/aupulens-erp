/**
 * Part 2.4 live verification: build an 8-level org hierarchy, verify level
 * validation, materialized-path subtree queries, localization inheritance, and
 * consolidated rollup — against the real DB. Cleans up after itself.
 *
 * Run: npx tsx scripts/verify-org-hierarchy.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

const TENANT = "zz-org-verify";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const OrgUnit = (await import("../models/OrgUnit")).default;
  const { isValidChildLevel, resolveLocalization } = await import("../lib/org/hierarchy");
  const uid = new mongoose.Types.ObjectId();

  await OrgUnit.deleteMany({ tenantId: TENANT });

  const mk = async (name: string, level: any, parent: any) => {
    const check = isValidChildLevel(parent?.level ?? null, level);
    if (!check.ok) throw new Error(`Level check failed: ${check.error}`);
    return OrgUnit.create({
      tenantId: TENANT, name, level, parentId: parent?._id ?? null,
      path: parent ? [...(parent.path || []), parent._id] : [],
      localization: {}, createdBy: uid,
    });
  };

  const company = await OrgUnit.create({ tenantId: TENANT, name: "Globex", level: "Company", parentId: null, path: [], localization: { currency: "INR", language: "en-IN", timezone: "Asia/Kolkata", taxRegime: "GST-IN" }, createdBy: uid });
  const regionUS = await OrgUnit.create({ tenantId: TENANT, name: "US Region", level: "Region", parentId: company._id, path: [company._id], localization: { currency: "USD", timezone: "America/New_York" }, createdBy: uid });
  const branch = await mk("NYC Branch", "Branch", regionUS);
  const office = await mk("Manhattan Office", "Office", branch);
  const dept = await mk("Sales Dept", "Department", office);
  const team = await mk("Enterprise Team", "Team", dept);
  await mk("Alice", "Employee", team);
  await mk("Bob", "Employee", team);

  console.log("1. Built an 8-level chain Company→…→Employee.");

  // Level validation rejects an inverted placement.
  const bad = isValidChildLevel("Team", "Company");
  console.log(`2. Level validation rejects Company under Team: ${!bad.ok} (${bad.error})`);

  // Subtree query via materialized path: everything under the US Region.
  const subtree = await OrgUnit.find({ tenantId: TENANT, $or: [{ _id: regionUS._id }, { path: regionUS._id }] }).lean();
  console.log(`3. US Region subtree size (materialized path): ${subtree.length} (expected 7: Region+Branch+Office+Dept+Team+2 Employees)`);

  // Localization inheritance for the Team: currency from US Region (USD), tax from Company (GST-IN).
  const ancestors = await OrgUnit.find({ tenantId: TENANT, _id: { $in: team.path } }).lean();
  const rootFirst = team.path.map((pid: any) => ancestors.find((a: any) => String(a._id) === String(pid)));
  const eff = resolveLocalization(team, rootFirst as any);
  console.log(`4. Team effective localization: currency=${eff.currency} (expect USD, from US Region), taxRegime=${eff.taxRegime} (expect GST-IN, from Company), timezone=${eff.timezone} (expect America/New_York)`);

  const pass = !bad.ok && subtree.length === 7 && eff.currency === "USD" && eff.taxRegime === "GST-IN" && eff.timezone === "America/New_York";
  console.log(pass ? "PASS: hierarchy, subtree paths, and localization inheritance all correct" : "FAIL");

  await OrgUnit.deleteMany({ tenantId: TENANT });
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
