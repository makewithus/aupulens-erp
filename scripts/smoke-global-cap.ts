/**
 * Live-verify the AI_GLOBAL_MONTHLY_CAP ceiling end-to-end against real Azure.
 * Temporarily forces the ceiling to the CURRENT platform count so the very next
 * call is blocked with AI_GLOBAL_LIMIT_REACHED — proving the backstop fires
 * before any spend. Restores nothing in the DB (no increment on a blocked call).
 *
 * Run: npx tsx scripts/smoke-global-cap.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const { getAiPeriod, getGlobalAiUsageCount } = await import("../lib/ai/usage");
  const { resolveTenantAiSettings, callClaudeForTenant } = await import("../lib/ai/tenantAi");

  const period = getAiPeriod();
  const globalNow = await getGlobalAiUsageCount(period);
  console.log(`Platform-wide usage this period (${period}): ${globalNow}`);

  const { tier, aiSettings } = await resolveTenantAiSettings("default-tenant");

  // 1) A real call under a generous ceiling should succeed AND bump the
  //    platform counter (globalNow -> globalNow+1).
  process.env.AI_GLOBAL_MONTHLY_CAP = "17000";
  const ok = await callClaudeForTenant("default-tenant", tier, aiSettings, "Reply with the single word OK", { maxTokens: 5 });
  console.log("With ceiling 17000, real Azure call:",
    "text" in ok ? `OK -> "${ok.text.trim()}"` : `gated ${(ok as any).code}`);
  const afterOk = await getGlobalAiUsageCount(period);
  console.log(`Platform counter after real call: ${afterOk} (was ${globalNow})`);

  // 2) Force the ceiling to the current count (positive) → next call blocked
  //    BEFORE any Azure spend.
  process.env.AI_GLOBAL_MONTHLY_CAP = String(afterOk); // count >= cap → blocked
  const blocked = await callClaudeForTenant("default-tenant", tier, aiSettings, "hi", { maxTokens: 5 });
  console.log(`With ceiling forced to ${afterOk}:`,
    "gated" in blocked && blocked.gated ? blocked.code : "NOT BLOCKED (unexpected)");
  const afterBlocked = await getGlobalAiUsageCount(period);
  console.log(afterBlocked === afterOk
    ? "PASS: blocked call did NOT increment the platform counter (no phantom spend)"
    : `FAIL: counter moved ${afterOk} -> ${afterBlocked} on a blocked call`);

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
