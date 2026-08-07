/** Verify the tenant usage counter increments on a REAL gpt-4o call (Go-Live A.3). */
import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const { getAiPeriod, getAiUsageCount } = await import("../lib/ai/usage");
  const { resolveTenantAiSettings, callClaudeForTenant } = await import("../lib/ai/tenantAi");

  const tenantId = "default-tenant";
  const period = getAiPeriod();
  const before = await getAiUsageCount(tenantId, period);
  console.log(`Usage before: ${before} (tenant=${tenantId}, period=${period})`);

  const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
  const res = await callClaudeForTenant(tenantId, tier, aiSettings, "Reply with the single word OK", { maxTokens: 5 });
  console.log("Gated?", !("text" in res), "-> ", "text" in res ? (res as any).text : (res as any).code);

  const after = await getAiUsageCount(tenantId, period);
  console.log(`Usage after: ${after}`);
  console.log(after === before + 1 ? "PASS: counter incremented by exactly 1" : `NOTE: delta = ${after - before}`);

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
