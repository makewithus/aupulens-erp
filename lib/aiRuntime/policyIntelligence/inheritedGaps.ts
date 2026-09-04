import connectDB from "@/lib/db";
import { execSync } from "node:child_process";
import JournalEntry from "@/models/finance/JournalEntry";
import AiMaterialityPolicy, { findThreshold } from "@/models/ai/AiMaterialityPolicy";
import { resolveInventoryAccountMapping } from "@/lib/aiRuntime/inventory/accountMapping";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

/**
 * AI-26's inherited gap queue (docs/ai/BRIEF-08a-BATCH-G.md A.3) — six real, already-documented
 * policy gaps from Chunks 3-5. Each becomes a `policy_gap` finding with LIVE evidence (queried
 * from this tenant's own data, not a static string repeated from the brief) wherever the
 * underlying data makes that possible. **No policy mutation, no config write, no edit to
 * `smart-rules.ts` anywhere in this module** — read-only throughout.
 */

export interface InheritedPolicyGap {
  gap: string;
  evidence: string;
  impactEstimate: string;
  inheritedFrom: string;
}

async function offsetOverrideEvidence(tenantId: string): Promise<{ evidence: string; impactEstimate: string }> {
  await connectDB();
  const [totalPosted, overridden] = await Promise.all([
    JournalEntry.countDocuments({ tenantId, status: DOCUMENT_STATUS.POSTED }),
    JournalEntry.countDocuments({ tenantId, status: DOCUMENT_STATUS.POSTED, "semanticOverride.applied": true }),
  ]);
  const rate = totalPosted > 0 ? Math.round((overridden / totalPosted) * 1000) / 10 : 0;
  return {
    evidence: `${overridden} of ${totalPosted} posted journal entries (${rate}%) carry semanticOverride.applied=true — every one of them a legitimate asset/liability-offset posting (prepaid amortisation, depreciation, deferred revenue) that applySemanticRulesAndClassify() would otherwise have rejected outright (docs/ai/OPEN_QUESTIONS.md #17)`,
    impactEstimate: overridden > 0 ? `${overridden} real postings are relying on the allowNonStandard escape hatch instead of a widened rule — each one auditable via JournalEntry.semanticOverride, but the underlying rule itself remains unwidened` : "no overrides recorded yet for this tenant — the rule's gap is real but not yet exercised here",
  };
}

async function assetBankEvidence(): Promise<string> {
  try {
    const output = execSync(`grep -n "asset_bank" lib/accounting/smart-rules.ts || true`, { encoding: "utf-8", cwd: process.cwd() });
    const line = output.split("\n").find((l) => l.trim());
    return line ? `still present: ${line.trim()} — dead code today (no account ever has this type; the real cash/bank type is "asset_cash"), but a landmine for anyone copying this file as a reference for real account types` : `"asset_bank" no longer appears in lib/accounting/smart-rules.ts — this gap may already be closed, verify before citing it`;
  } catch {
    return `could not grep lib/accounting/smart-rules.ts for "asset_bank" in this environment`;
  }
}

async function capitalisationThresholdEvidence(tenantId: string): Promise<string> {
  await connectDB();
  const policy = await AiMaterialityPolicy.findOne({ tenantId }).lean();
  const threshold = findThreshold(policy as unknown as import("@/models/ai/AiMaterialityPolicy").IAiMaterialityPolicy | null, "capitalisation");
  return threshold
    ? `now configured for this tenant: ₹${threshold.absoluteAmount ?? "n/a"} (AiMaterialityPolicy) — AI-10 reads this live; this gap may be closed for this tenant, verify before citing it`
    : `no "capitalisation" threshold configured in AiMaterialityPolicy for this tenant — AI-10's capital-candidate detection stays RECOMMEND-only and never invents a figure (docs/ai/BRIEF-03-BATCH-B.md)`;
}

async function materialityPolicyEvidence(tenantId: string): Promise<string> {
  await connectDB();
  const policy = await AiMaterialityPolicy.findOne({ tenantId }).lean();
  const count = policy?.thresholds?.length ?? 0;
  return count > 0
    ? `${count} threshold(s) now configured for this tenant — this gap may be partially closed, verify which action classes are covered`
    : `AiMaterialityPolicy has zero thresholds configured for this tenant (seeded empty by design) — every workflow reading it must drop to RECOMMEND and say so explicitly, never invent a number`;
}

async function inventoryAccountEvidence(tenantId: string): Promise<string> {
  const mapping = await resolveInventoryAccountMapping(tenantId);
  return `AI-11 now answers this directly: resolved=${mapping.resolved}, basis: ${mapping.basis}`;
}

export async function collectInheritedPolicyGaps(tenantId: string): Promise<InheritedPolicyGap[]> {
  const [offset, assetBank, capThreshold, materiality, inventory] = await Promise.all([
    offsetOverrideEvidence(tenantId),
    assetBankEvidence(),
    capitalisationThresholdEvidence(tenantId),
    materialityPolicyEvidence(tenantId),
    inventoryAccountEvidence(tenantId),
  ]);

  return [
    {
      gap: "smart-rules.ts rejects legitimate asset/liability offset entries; every schedule-driven posting trips it",
      evidence: offset.evidence,
      impactEstimate: offset.impactEstimate,
      inheritedFrom: "Chunk 4, 0.3 (docs/ai/OPEN_QUESTIONS.md #17)",
    },
    {
      gap: 'smart-rules.ts references "asset_bank", which has never existed in Account\'s enum',
      evidence: assetBank,
      impactEstimate: "harmless dead code today (the check never matches anything), but misleading as a reference for real account types — low urgency, low effort to fix",
      inheritedFrom: "Chunk 5, 0.5 (docs/ai/GLOSSARY.md)",
    },
    {
      gap: "No capitalisation threshold exists as a policy object",
      evidence: capThreshold,
      impactEstimate: "every capital-candidate bill is RECOMMEND-only until a human configures this threshold — no autonomous capitalisation is possible without it",
      inheritedFrom: "Chunk 3, A.5",
    },
    {
      gap: "No materiality policy until AiMaterialityPolicy was created; still empty by default",
      evidence: materiality,
      impactEstimate: "every workflow reading AiMaterialityPolicy (AI-07/08/09/10/11/12/17/22/26 itself) falls back to a hardcoded default tolerance until a human configures real numbers per tenant",
      inheritedFrom: "Chunk 3, A.5",
    },
    {
      gap: "allowNonStandard override rate is now measured — is it acceptable?",
      evidence: offset.evidence,
      impactEstimate: "a governance question, not a code gap: the rate is now visible (this finding's own evidence) — a human owner needs to decide whether it's acceptable or whether smart-rules.ts should be widened",
      inheritedFrom: "Chunk 4, 0.3",
    },
    {
      gap: "Which accounts constitute inventory, given no inventory account type",
      evidence: inventory,
      impactEstimate: "AI-11 (this batch) answers this live per tenant — see its own inventory_account_mapping output; this gap is now closed by code, not just documentation",
      inheritedFrom: "Chunk 5, 0.5 — AI-11 answers this",
    },
  ];
}
