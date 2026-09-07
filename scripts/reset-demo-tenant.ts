/**
 * Returns the AI demo tenant (scripts/seed-demo-tenant.ts) to a clean state — deletes every
 * document scoped to `ai-demo-tenant` across every model, then re-runs the seed. Safe to run
 * after a tester has broken something (docs/ai/BRIEF-10-PRE-QA.md Part B.1: "they will break
 * something; that is their job") or after any verification pass that changed the tenant's data.
 *
 * Deletes from two model sets:
 * 1. Every `models/ai/*.ts` model, dynamically imported by directory listing — every one of
 *    these is genuinely tenant-scoped AI-runtime state a workflow sweep against this tenant can
 *    write to, and importing by directory (not a hand-maintained list) means a future new Ai*
 *    model is swept automatically, the same registry-driven principle used elsewhere in this
 *    addendum (docs/ai/audits/COVERAGE_GAPS.md's learning-record sweep).
 * 2. The fixed list of "source" business models the seed script itself creates directly.
 *
 * Usage: npx tsx scripts/reset-demo-tenant.ts [--reseed]
 * Requires MONGODB_URI in .env (same as the running app). --reseed re-runs seed-demo-tenant.ts
 * immediately after clearing; without it, the tenant is left empty (re-seed separately).
 */
import "dotenv/config";
import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import connectDB from "../lib/db";
import { TENANT_ID } from "./seed-demo-tenant";

const SOURCE_MODEL_PATHS = [
  "../models/admin/Organization",
  "../models/auth/User",
  "../models/sales/Customer",
  "../models/finance/Account",
  "../models/finance/Invoice",
  "../models/finance/JournalEntry",
  "../models/finance/BankStatement",
  "../models/finance/Asset",
  "../models/finance/PurchaseOrder",
  "../models/inventory/Product",
  "../models/inventory/Stock",
  "../models/inventory/StockMove",
  "../models/hr/Payroll",
  "../models/hr/Employee",
];

async function clearTenant(): Promise<{ model: string; deleted: number }[]> {
  await connectDB();
  const results: { model: string; deleted: number }[] = [];

  const aiModelsDir = path.join(__dirname, "..", "models", "ai");
  const aiModelFiles = fs.readdirSync(aiModelsDir).filter((f) => f.endsWith(".ts"));

  for (const file of aiModelFiles) {
    const mod = await import(path.join(aiModelsDir, file));
    const Model = mod.default as mongoose.Model<unknown> | undefined;
    if (!Model?.deleteMany) continue;
    // Organization is matched by `subdomain`, not `tenantId` — everything else in this codebase
    // (including every models/ai/* model) is matched by `tenantId`.
    const res = await Model.deleteMany({ tenantId: TENANT_ID });
    if (res.deletedCount > 0) results.push({ model: `ai/${file.replace(".ts", "")}`, deleted: res.deletedCount });
  }

  for (const modelPath of SOURCE_MODEL_PATHS) {
    const mod = await import(modelPath);
    const Model = mod.default as mongoose.Model<unknown>;
    const filter = modelPath.includes("Organization") ? { subdomain: TENANT_ID } : { tenantId: TENANT_ID };
    const res = await Model.deleteMany(filter);
    if (res.deletedCount > 0) results.push({ model: modelPath.replace("../models/", ""), deleted: res.deletedCount });
  }

  return results;
}

async function main() {
  const results = await clearTenant();
  const total = results.reduce((s, r) => s + r.deleted, 0);
  console.log(`Cleared tenant "${TENANT_ID}": ${total} documents across ${results.length} collections.`);
  for (const r of results) console.log(`  ${r.model}: ${r.deleted}`);

  await mongoose.disconnect();

  if (process.argv.includes("--reseed")) {
    console.log("\nRe-seeding...\n");
    execSync("npx tsx scripts/seed-demo-tenant.ts", { stdio: "inherit", cwd: path.join(__dirname, "..") });
  } else {
    console.log(`\nTenant is now empty. Re-seed with: npx tsx scripts/seed-demo-tenant.ts`);
  }
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
