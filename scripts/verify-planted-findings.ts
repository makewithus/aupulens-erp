/**
 * Runs the real cron sweep route against the seeded AI demo tenant (scripts/seed-demo-tenant.ts)
 * and checks whether each of the 8 deliberately planted findings was actually caught — per
 * docs/ai/BRIEF-10-PRE-QA.md B.1's own instruction: "so you can verify the workflows actually
 * find it. If a planted finding isn't found, that is a bug." What each finding is and where it
 * lives is documented in docs/ai/PLANTED_FINDINGS.md.
 *
 * Usage: npx tsx scripts/verify-planted-findings.ts
 * Requires MONGODB_URI in .env and a tenant already seeded via seed-demo-tenant.ts.
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import { TENANT_ID } from "./seed-demo-tenant";

import AiWorkflowPolicy from "../models/ai/AiWorkflowPolicy";
import AiAttentionItem from "../models/ai/AiAttentionItem";
import AiAnomaly from "../models/ai/AiAnomaly";
import AiHold from "../models/ai/AiHold";
import AiWorkflowRun from "../models/ai/AiWorkflowRun";
import AiDecisionTrace from "../models/ai/AiDecisionTrace";

process.env.CRON_SECRET = process.env.CRON_SECRET || "verify-planted-findings-local";

async function ensureAllPoliciesOn() {
  const { listWorkflows } = await import("../lib/aiRuntime/runtime/registry");
  const { bootstrapAiRuntime } = await import("../lib/aiRuntime/bootstrap");
  bootstrapAiRuntime();
  for (const w of listWorkflows()) {
    await AiWorkflowPolicy.findOneAndUpdate(
      { tenantId: TENANT_ID, workflowId: w.id },
      { $set: { killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0 } },
      { upsert: true },
    );
  }
  console.log(`Every workflow's kill switch enabled, autonomy uncapped, for tenant "${TENANT_ID}".`);
}

async function runRealCronSweep() {
  const { POST } = await import("../app/api/cron/ai/runtime-sweep/route");
  const req = { headers: { get: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${process.env.CRON_SECRET}` : null) } } as unknown as Request;
  const res = await POST(req as never);
  const body = await (res as Response).json();
  console.log("Cron sweep result:", JSON.stringify(body));
}

interface CheckResult {
  n: number;
  name: string;
  workflow: string;
  found: boolean;
  detail: string;
}

async function checkFindings(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // #1 duplicate bill (AI-27)
  const dupBillHold = await AiHold.findOne({ tenantId: TENANT_ID, "subjectRefs.model": "Invoice", reason: { $regex: /duplicate/i } }).lean();
  const dupBillItem = await AiAttentionItem.findOne({ tenantId: TENANT_ID, workflowId: "AI-27" }).lean();
  results.push({ n: 1, name: "Duplicate bill", workflow: "AI-27", found: Boolean(dupBillHold || dupBillItem), detail: dupBillHold ? `AiHold: ${dupBillHold.reason}` : dupBillItem ? `AiAttentionItem: ${dupBillItem.what}` : "nothing found" });

  // #2 duplicate payment (AI-06 / AI-27) — matched on `what` (AI-27's literal finding title,
  // "Bill paid twice: ..."), not `why`: this tenant's `why` text mixes in ₹/em-dash characters
  // that made $regex against that specific field return no match even for a plain-ASCII
  // substring positioned after them, at both the Mongoose and raw driver level — a real quirk
  // worth being aware of when querying free-text fields on this data, not a workflow bug (the
  // finding itself is genuinely there, confirmed by matching on `what` and by direct inspection).
  const dupPayItem = await AiAttentionItem.findOne({ tenantId: TENANT_ID, what: { $regex: /paid twice|overpay/i } }).lean();
  results.push({ n: 2, name: "Duplicate payment (overpayment)", workflow: "AI-06/AI-27", found: Boolean(dupPayItem), detail: dupPayItem ? `${dupPayItem.workflowId}: ${dupPayItem.what}` : "nothing found" });

  // #3 genuine anomaly (AI-15) — specifically the amount_outlier detector, the one the SaaS
  // spike is actually built to trip; other detectors may also legitimately fire on this tenant's
  // data (e.g. weekend postings), which is fine, but isn't what this plant is checking for.
  const anomaly = await AiAnomaly.findOne({ tenantId: TENANT_ID, detectorId: "amount_outlier" }).sort({ createdAt: -1 }).lean();
  const anyAnomaly = await AiAnomaly.find({ tenantId: TENANT_ID }).select("detectorId").lean();
  results.push({ n: 3, name: "Genuine anomaly (SaaS vendor spike)", workflow: "AI-15", found: Boolean(anomaly), detail: anomaly ? `AiAnomaly: ${anomaly.detectorId} - ${(anomaly as any).detail ?? ""}` : `amount_outlier not found; other detectors fired: ${anyAnomaly.map((a) => a.detectorId).join(", ") || "none"}` });

  // #4 cut-off error (AI-28) — via AI-14/AI-28's own attention items or decision trace
  const cutoffTrace = await AiDecisionTrace.findOne({ tenantId: TENANT_ID, workflowId: "AI-28" }).sort({ finalizedAt: -1 }).lean();
  const cutoffFlagged = cutoffTrace && JSON.stringify(cutoffTrace.rawProposal ?? {}).match(/timing|cutoff|cut-off/i);
  results.push({ n: 4, name: "Cut-off error (late-recorded freight bill)", workflow: "AI-28", found: Boolean(cutoffFlagged), detail: cutoffTrace ? `AI-28 run found, proposal mentions timing/cutoff: ${Boolean(cutoffFlagged)}` : "no AI-28 run found" });

  // #5 unreconciled bank difference (AI-03 / AI-22)
  const bankItem = await AiAttentionItem.findOne({ tenantId: TENANT_ID, workflowId: { $in: ["AI-03", "AI-22"] } }).lean();
  results.push({ n: 5, name: "Unreconciled bank difference", workflow: "AI-03/AI-22", found: Boolean(bankItem), detail: bankItem ? `${bankItem.workflowId}: ${bankItem.what}` : "nothing found" });

  // #6 stale accrual (AI-07 / AI-13)
  const staleItem = await AiAttentionItem.findOne({ tenantId: TENANT_ID, what: { $regex: /stale|overdue/i } }).lean();
  results.push({ n: 6, name: "Stale accrual reversal", workflow: "AI-07/AI-13", found: Boolean(staleItem), detail: staleItem ? `${staleItem.workflowId}: ${staleItem.what}` : "nothing found" });

  // #7 related-party pair (AI-20) — the proposal's real field is `relatedParties`, not `matches`
  // (Ai20Proposal, lib/aiRuntime/workflows/ai-20-related-party-detection/index.ts); specifically
  // require a "certain" (shared GSTIN) classification, since this tenant's shared-address parties
  // also produce several unrelated "probable" matches that aren't what this plant checks for.
  const relatedTrace = await AiDecisionTrace.findOne({ tenantId: TENANT_ID, workflowId: "AI-20" }).sort({ finalizedAt: -1 }).lean();
  const relatedProposal = relatedTrace?.rawProposal as { relatedParties?: { classification: string }[] } | undefined;
  const certainMatches = (relatedProposal?.relatedParties ?? []).filter((m) => m.classification === "certain");
  results.push({ n: 7, name: "Related-party pair (shared GSTIN)", workflow: "AI-20", found: certainMatches.length > 0, detail: relatedTrace ? `AI-20 run found, ${relatedProposal?.relatedParties?.length ?? 0} total matches, ${certainMatches.length} certain (shared GSTIN)` : "no AI-20 run found" });

  // #8 policy inconsistency (AI-26)
  const policyTrace = await AiDecisionTrace.findOne({ tenantId: TENANT_ID, workflowId: "AI-26" }).sort({ finalizedAt: -1 }).lean();
  const policyProposal = policyTrace?.rawProposal as { inconsistencies?: unknown[] } | undefined;
  const policyFound = Boolean(policyProposal?.inconsistencies && Array.isArray(policyProposal.inconsistencies) && policyProposal.inconsistencies.length > 0);
  results.push({ n: 8, name: "Policy inconsistency (capitalisation)", workflow: "AI-26", found: policyFound, detail: policyTrace ? `AI-26 run found, inconsistencies: ${policyProposal?.inconsistencies?.length ?? 0}` : "no AI-26 run found" });

  return results;
}

async function main() {
  await connectDB();
  await ensureAllPoliciesOn();
  await runRealCronSweep();
  // schedule.due and period.horizon.reached workflows may need a moment for the inline dispatch
  // path to finish; the cron route awaits each emitEvent() call, so this should already be
  // synchronous, but a short settle avoids racing any deferred async work.
  await new Promise((r) => setTimeout(r, 500));

  const runCount = await AiWorkflowRun.countDocuments({ tenantId: TENANT_ID });
  console.log(`\n${runCount} AiWorkflowRun documents produced by the sweep.\n`);

  const results = await checkFindings();
  console.log("Planted finding verification:\n");
  for (const r of results) {
    console.log(`${r.found ? "✓ FOUND" : "✗ MISSING"}  #${r.n} ${r.name} (${r.workflow})`);
    console.log(`         ${r.detail}`);
  }
  const missing = results.filter((r) => !r.found);
  console.log(`\n${results.length - missing.length}/${results.length} planted findings confirmed found.`);
  if (missing.length > 0) {
    console.log(`MISSING: ${missing.map((m) => `#${m.n} ${m.name}`).join(", ")}`);
  }

  await mongoose.disconnect();
  process.exit(missing.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
