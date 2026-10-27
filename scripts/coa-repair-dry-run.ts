/** Usage: MONGODB_URI=<approved target> npx tsx scripts/coa-repair-dry-run.ts <tenant>
 * Read-only proposal; never prints URI or executes repairs. */
import mongoose from "mongoose";
import { planCoaRepair } from "../lib/accounting/coaRepair";
async function main() {
  const tenantId = process.argv[2];
  if (!tenantId || !process.env.MONGODB_URI) throw new Error("Explicit tenant and approved database target required");
  await mongoose.connect(process.env.MONGODB_URI);
  try { process.stdout.write(JSON.stringify(await planCoaRepair(tenantId), null, 2) + "\n"); }
  finally { await mongoose.disconnect(); }
}
main().catch(() => { process.stderr.write("COA dry-run failed; no repair was applied.\n"); process.exitCode = 1; });
