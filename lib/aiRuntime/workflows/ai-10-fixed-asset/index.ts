import connectDB from "@/lib/db";
import Invoice from "@/models/finance/Invoice";
import Account from "@/models/finance/Account";
import Asset from "@/models/finance/Asset";
import AiSchedule, { AI_SCHEDULE_TYPE, AI_SCHEDULE_PERIOD_STATUS, AI_SCHEDULE_STATUS } from "@/models/ai/AiSchedule";
import AiMaterialityPolicy, { findThreshold } from "@/models/ai/AiMaterialityPolicy";
import { computeAssetRegisterToGl, type AssetAccountTieOut } from "@/lib/accounting/registerToGl";
import { scheduleBelongsTo } from "@/lib/aiRuntime/schedules/ownership";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY, DOCUMENT_STATUS } from "@/lib/constants/statuses";
import type {
  WorkflowDefinition,
  ObservedResult,
  ReasonResult,
  ActResult,
  VerifyResult,
} from "@/lib/aiRuntime/workflows/types";

/**
 * AI-10 — Fixed asset intelligence (docs/ai/BRIEF-03-BATCH-B.md). "Three additions to a working
 * feature, not a rebuild": `models/finance/Asset.ts` and the compute endpoint already exist.
 *
 * Three trigger modes:
 * - `bill.created` → **capital-check**: is this bill's line a capitalisation candidate?
 *   Asset creation is judgement (RECOMMEND per spec) — this mode never writes, only raises a
 *   finding/attention item for a human to act on.
 * - `asset.created` (new one-line emission added to app/api/finance/assets/route.ts, same
 *   pattern as every other Batch A/B trigger wiring) → **schedule-init**: a human just posted a
 *   real Asset; if it has no depreciation AiSchedule yet, create one (CONTROLLED_AUTONOMOUS,
 *   mechanical once the asset itself exists — same precedent as draft_accrual's reversal
 *   schedule).
 * - `schedule.due` → **depreciation-run**: process due periods via the same
 *   draft_journal+link_schedule_draft / post_journal split AI-08 uses, then run the
 *   register-to-GL tie-out and report any difference as a finding.
 */

const ASSET_LIKE_KEYWORDS = ["equipment", "machinery", "vehicle", "furniture", "computer", "laptop", "server", "building", "plant", "fixture", "asset"];
const RELATED_COST_KEYWORDS = ["installation", "freight", "duty", "shipping", "commissioning"];

interface Ai10Raw {
  mode: "capital_check" | "schedule_init" | "depreciation_run";
  invoiceId?: string;
  assetId?: string;
  scheduleId?: string;
  actingUserId?: string;
}

interface Ai10CapitalExtracted {
  mode: "capital_check";
  actingUserId?: string;
  invoiceId: string;
  moveType: string;
  lines: { name: string; amount: number; accountType: string | null }[];
  currency: string;
  thresholdAmount: number | null;
  thresholdConfigured: boolean;
  sameClassAsset: { durationYears: number; method: string; salvageValue: number } | null;
}

interface Ai10ScheduleInitExtracted {
  mode: "schedule_init";
  actingUserId?: string;
  assetId: string;
  assetStatus: string;
  hasExistingSchedule: boolean;
}

interface Ai10DepreciationExtracted {
  mode: "depreciation_run";
  actingUserId?: string;
  scheduleId: string;
  assetId: string;
  assetActive: boolean;
  duePeriods: { periodKey: string; dueDate: Date; amount: number }[];
  schedule: { debitAccountId: string; creditAccountId: string };
  assetAccountId: string;
  fullyDepreciatedButActive: boolean;
}

type Ai10Extracted = Ai10CapitalExtracted | Ai10ScheduleInitExtracted | Ai10DepreciationExtracted;

interface Ai10Proposal {
  mode: "capital_check" | "schedule_init" | "depreciation_run";
  capitalCandidate?: { totalAmount: number; relatedLines: number; thresholdConfigured: boolean };
  createSchedule?: boolean;
  periodsToRun?: { periodKey: string; dueDate: Date; amount: number }[];
  tieOut?: AssetAccountTieOut;
}

export const ai10FixedAsset: WorkflowDefinition<Ai10Raw, Ai10Extracted, Ai10Proposal> = {
  id: "AI-10",
  version: "1.0.0",
  eventKeys: ["bill.created", "asset.created", "schedule.due"],
  actionClass: "capitalisation",
  defaultAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,

  // `bill.created` is fan-out (shared with AI-02/07/08) — always accepted. `asset.created` is
  // solo (no filter consulted). `schedule.due` is real ownership: only AI-10's own "depreciation"
  // schedules on an Asset (docs/ai/BRIEF-04-BATCH-C.md Part 0.2).
  async subscriptionFilter(event): Promise<boolean> {
    if (event.eventKey !== "schedule.due") return true;
    const scheduleId = event.payload.scheduleId ? String(event.payload.scheduleId) : "";
    if (!scheduleId) return false;
    return scheduleBelongsTo(event.tenantId, scheduleId, AI_SCHEDULE_TYPE.DEPRECIATION, "Asset");
  },

  async observe(event): Promise<ObservedResult<Ai10Raw>> {
    const actingUserId = event.payload.actingUserId ? String(event.payload.actingUserId) : undefined;
    if (event.eventKey === "asset.created") {
      const assetId = String(event.payload.assetId);
      return { entityId: assetId, subjectRef: { model: "Asset", id: assetId }, raw: { mode: "schedule_init", assetId, actingUserId } };
    }
    if (event.eventKey === "schedule.due") {
      const scheduleId = String(event.payload.scheduleId);
      return { entityId: scheduleId, subjectRef: { model: "AiSchedule", id: scheduleId }, raw: { mode: "depreciation_run", scheduleId, actingUserId } };
    }
    const invoiceId = String(event.payload.invoiceId);
    return { entityId: invoiceId, subjectRef: { model: "Invoice", id: invoiceId }, raw: { mode: "capital_check", invoiceId, actingUserId } };
  },

  async extract(observed, ctx): Promise<Ai10Extracted> {
    await connectDB();

    if (observed.raw.mode === "schedule_init") {
      const asset = await Asset.findById(observed.raw.assetId).lean();
      if (!asset) throw new Error(`Asset ${observed.raw.assetId} not found`);
      const existing = await AiSchedule.findOne({
        tenantId: ctx.tenantId,
        scheduleType: AI_SCHEDULE_TYPE.DEPRECIATION,
        "sourceRef.model": "Asset",
        "sourceRef.id": observed.raw.assetId,
      }).lean();
      return {
        mode: "schedule_init",
        actingUserId: observed.raw.actingUserId,
        assetId: observed.raw.assetId!,
        assetStatus: asset.status,
        hasExistingSchedule: Boolean(existing),
      };
    }

    if (observed.raw.mode === "depreciation_run") {
      const schedule = await AiSchedule.findById(observed.raw.scheduleId).lean();
      if (!schedule) throw new Error(`AiSchedule ${observed.raw.scheduleId} not found`);

      // `schedule.due` fans out to every workflow registered on this eventKey — AI-10 only
      // owns depreciation schedules on Assets; anything else no-ops rather than racing AI-08/09.
      const owned = schedule.scheduleType === AI_SCHEDULE_TYPE.DEPRECIATION && schedule.sourceRef.model === "Asset";
      const asset = owned ? await Asset.findById(schedule.sourceRef.id).lean() : null;

      const today = new Date();
      const duePeriods = owned
        ? (schedule.periods ?? [])
            .filter((p) => p.status === AI_SCHEDULE_PERIOD_STATUS.PENDING && p.dueDate.getTime() <= today.getTime())
            .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
            .map((p) => ({ periodKey: p.periodKey, dueDate: p.dueDate, amount: p.amount }))
        : [];

      const fullyDepreciatedButActive = owned && schedule.status === AI_SCHEDULE_STATUS.COMPLETED && asset?.status === DOCUMENT_STATUS.POSTED;

      return {
        mode: "depreciation_run",
        actingUserId: observed.raw.actingUserId,
        scheduleId: observed.raw.scheduleId!,
        assetId: String(schedule.sourceRef.id),
        assetActive: asset?.status === DOCUMENT_STATUS.POSTED,
        duePeriods,
        schedule: { debitAccountId: String(schedule.debitAccountId), creditAccountId: String(schedule.creditAccountId) },
        assetAccountId: String(schedule.creditAccountId),
        fullyDepreciatedButActive,
      };
    }

    const invoice = await Invoice.findById(observed.raw.invoiceId).lean();
    if (!invoice) throw new Error(`Invoice ${observed.raw.invoiceId} not found`);
    const invoiceLines = (invoice as { invoiceLines?: { name?: string; priceSubtotal?: number; accountId?: unknown }[] }).invoiceLines ?? [];

    const lines = await Promise.all(
      invoiceLines.map(async (l) => {
        let accountType: string | null = null;
        if (l.accountId) {
          const acc = await Account.findById(l.accountId).lean();
          accountType = acc?.account_type ?? null;
        }
        return { name: l.name ?? "", amount: l.priceSubtotal ?? 0, accountType };
      }),
    );

    const materialityPolicy = await AiMaterialityPolicy.findOne({ tenantId: ctx.tenantId }).lean();
    const threshold = findThreshold(materialityPolicy as unknown as import("@/models/ai/AiMaterialityPolicy").IAiMaterialityPolicy | null, "capitalisation");

    // "same class" = keyword-matched to an existing posted asset's name — a coarse but honest
    // proxy given no formal asset-class taxonomy exists in this codebase (SYSTEM_INVENTORY.md).
    let sameClassAsset: Ai10CapitalExtracted["sameClassAsset"] = null;
    const candidateLine = lines.find((l) => ASSET_LIKE_KEYWORDS.some((k) => l.name.toLowerCase().includes(k)) || l.accountType === "asset_fixed");
    if (candidateLine) {
      const keyword = ASSET_LIKE_KEYWORDS.find((k) => candidateLine.name.toLowerCase().includes(k));
      if (keyword) {
        const match = await Asset.findOne({ tenantId: ctx.tenantId, status: DOCUMENT_STATUS.POSTED, name: { $regex: keyword, $options: "i" } }).lean();
        if (match) sameClassAsset = { durationYears: match.durationYears, method: match.method, salvageValue: match.salvageValue };
      }
    }

    return {
      mode: "capital_check",
      actingUserId: observed.raw.actingUserId,
      invoiceId: observed.raw.invoiceId!,
      moveType: (invoice as { moveType?: string }).moveType ?? "",
      lines,
      currency: (invoice as { currencyId?: string }).currencyId ?? "INR",
      thresholdAmount: threshold?.absoluteAmount ?? null,
      thresholdConfigured: Boolean(threshold),
      sameClassAsset,
    };
  },

  async reason(extracted): Promise<ReasonResult<Ai10Proposal>> {
    if (extracted.mode === "schedule_init") {
      if (extracted.assetStatus !== DOCUMENT_STATUS.POSTED || extracted.hasExistingSchedule) {
        return {
          proposal: { mode: "schedule_init", createSchedule: false },
          confidence: 0,
          findings: [],
          reasonChain: [extracted.hasExistingSchedule ? "depreciation schedule already exists" : "asset not yet posted"],
        };
      }
      return {
        proposal: { mode: "schedule_init", createSchedule: true },
        confidence: 1,
        findings: [],
        reasonChain: ["posted asset with no depreciation schedule — creating one"],
        gateOverrides: { periodOpen: true, permissionOk: Boolean(extracted.actingUserId) },
      };
    }

    if (extracted.mode === "depreciation_run") {
      const reasonChain = [`asset ${extracted.assetId}: ${extracted.duePeriods.length} depreciation period(s) due`];
      const findings: ReasonResult<Ai10Proposal>["findings"] = [];

      if (extracted.fullyDepreciatedButActive) {
        findings.push({
          id: `ai10-fully-dep-${extracted.assetId}`,
          type: AI_FINDING_TYPE.EXCEPTION,
          severity: AI_FINDING_SEVERITY.LOW,
          title: "Asset fully depreciated but still active",
          detail: `Asset ${extracted.assetId}'s depreciation schedule is complete but the asset is still posted/in-use — consider disposal or a residual-value review`,
          confidence: 1,
          subjectRefs: [{ model: "Asset", id: extracted.assetId }],
          evidence: [],
          reasonChain: [],
        });
      }

      if (!extracted.assetActive) {
        reasonChain.push("asset is not active — skipping run, not posting to a disposed/cancelled asset");
        return { proposal: { mode: "depreciation_run", periodsToRun: [] }, confidence: 0, findings, reasonChain };
      }

      return {
        proposal: { mode: "depreciation_run", periodsToRun: extracted.duePeriods },
        confidence: extracted.duePeriods.length > 0 ? 1 : 0,
        findings,
        reasonChain,
        gateOverrides: { periodOpen: true, permissionOk: Boolean(extracted.actingUserId) },
      };
    }

    // capital_check
    const reasonChain: string[] = [];
    if (extracted.moveType !== "in_invoice") {
      return { proposal: { mode: "capital_check" }, confidence: 0, findings: [], reasonChain: ["not a vendor bill"] };
    }
    if (extracted.currency !== "INR") {
      return {
        proposal: { mode: "capital_check" },
        confidence: 0,
        findings: [
          {
            id: `ai10-fx-${extracted.invoiceId}`,
            type: AI_FINDING_TYPE.EXCEPTION,
            severity: AI_FINDING_SEVERITY.MEDIUM,
            title: "Non-INR bill — fx_unsupported",
            detail: "Batch B is INR-only (A.1) — capital-candidate detection deferred for this bill until Chunk 4's FX work lands",
            confidence: 0,
            subjectRefs: [{ model: "Invoice", id: extracted.invoiceId }],
            evidence: [],
            reasonChain: [],
          },
        ],
        reasonChain: ["fx_unsupported — non-INR currency"],
      };
    }

    const assetLikeLines = extracted.lines.filter((l) => ASSET_LIKE_KEYWORDS.some((k) => l.name.toLowerCase().includes(k)) || l.accountType === "asset_fixed");
    if (assetLikeLines.length === 0) {
      reasonChain.push("no asset-like line or capex-coded account on this bill");
      return { proposal: { mode: "capital_check" }, confidence: 0, findings: [], reasonChain };
    }

    const relatedLines = extracted.lines.filter((l) => RELATED_COST_KEYWORDS.some((k) => l.name.toLowerCase().includes(k)));
    const totalAmount = assetLikeLines.reduce((s, l) => s + l.amount, 0) + relatedLines.reduce((s, l) => s + l.amount, 0);

    if (extracted.thresholdConfigured && extracted.thresholdAmount !== null && totalAmount < extracted.thresholdAmount) {
      reasonChain.push(`amount ${totalAmount} below configured capitalisation threshold ${extracted.thresholdAmount} — expensed, not a candidate`);
      return { proposal: { mode: "capital_check" }, confidence: 0, findings: [], reasonChain };
    }

    if (!extracted.thresholdConfigured) {
      reasonChain.push("no capitalisation threshold configured — RECOMMEND only, never an invented figure");
    }
    if (!extracted.sameClassAsset) {
      reasonChain.push("cannot derive useful life/method from an existing asset of the same class — will not default");
    }

    return {
      proposal: { mode: "capital_check", capitalCandidate: { totalAmount, relatedLines: relatedLines.length, thresholdConfigured: extracted.thresholdConfigured } },
      confidence: extracted.thresholdConfigured && extracted.sameClassAsset ? 0.6 : 0.3,
      findings: [
        {
          id: `ai10-candidate-${extracted.invoiceId}`,
          type: AI_FINDING_TYPE.PROPOSAL,
          severity: AI_FINDING_SEVERITY.MEDIUM,
          title: "Capital-expenditure candidate",
          detail: `Bill has ${assetLikeLines.length} asset-like line(s) plus ${relatedLines.length} related cost line(s), total ${totalAmount}. threshold_configured=${extracted.thresholdConfigured}${extracted.sameClassAsset ? "" : ", no matching asset class found — useful life/method needs a human decision"}`,
          amount: totalAmount,
          confidence: extracted.thresholdConfigured ? 0.6 : 0.3,
          subjectRefs: [{ model: "Invoice", id: extracted.invoiceId }],
          evidence: [],
          reasonChain: [],
        },
      ],
      reasonChain,
      // Asset creation is judgement (spec: "RECOMMEND — capital vs expense is judgement") —
      // forced below the historical-stability bar unconditionally so this action class never
      // reaches an autonomous tier no matter how confidence tuning evolves later.
      gateOverrides: { amount: totalAmount, historicalStability: 0, periodOpen: true, permissionOk: Boolean(extracted.actingUserId) },
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt, extracted): Promise<ActResult> {
    if (extracted.mode === "schedule_init") {
      // See ai-08's act() comment: decision.autonomyApplied must be checked explicitly —
      // callTool()'s maxAutonomyLevel check alone does not consult the gate's verdict.
      if (!reasoned.proposal.createSchedule || decision.autonomyApplied === AI_AUTONOMY_LEVEL.RECOMMEND) {
        return { findings: [], actionsTaken: [] };
      }
      try {
        const result = await rt.callTool<{ scheduleId: string }>(
          "draft_depreciation_schedule",
          { tenantId: ctx.tenantId, createdByWorkflow: "AI-10", assetId: extracted.assetId },
          { requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS, idempotencyKey: `ai-10-dep-schedule:${extracted.assetId}` },
        );
        return { findings: [], actionsTaken: [{ tool: "draft_depreciation_schedule", args: { scheduleId: result.scheduleId }, reversible: true }], metrics: { scanned: 1, autoActioned: 1 } };
      } catch {
        return { findings: [], actionsTaken: [] };
      }
    }

    if (extracted.mode === "depreciation_run") {
      const gateOpen = decision.autonomyApplied !== AI_AUTONOMY_LEVEL.RECOMMEND;
      const periods = gateOpen ? (reasoned.proposal.periodsToRun ?? []) : [];
      const actionsTaken: ActResult["actionsTaken"] = [];
      const overrideReasons: string[] = [];
      for (const period of periods) {
        const lineIds = [
          { accountId: extracted.schedule.debitAccountId, label: `Depreciation ${period.periodKey}`, debit: period.amount, credit: 0 },
          { accountId: extracted.schedule.creditAccountId, label: `Depreciation ${period.periodKey}`, debit: 0, credit: period.amount },
        ];
        const header = { journalType: "general" as const, date: period.dueDate };
        // Depreciation is an expense leg offset against the fixed-asset account drawing down —
        // the same non-cash/bank/liability pairing AI-08 hit (see that workflow's act() comment
        // for the full explanation). smart-rules.ts stays authoritative; allowNonStandard just
        // converts its veto into an audited warning instead of a silent bypass.
        const overrideReason = `AI-10 depreciation for period ${period.periodKey} — expense offset against the asset account by design.`;
        try {
          if (ctx.policy.autoPostSchedules) {
            await rt.callTool(
              "post_journal",
              { tenantId: ctx.tenantId, createdBy: extracted.actingUserId, scheduleId: extracted.scheduleId, periodKey: period.periodKey, header, lineIds, allowNonStandard: true, overrideReason },
              { requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS, idempotencyKey: `${extracted.scheduleId}:${period.periodKey}` },
            );
            actionsTaken.push({ tool: "post_journal", args: { scheduleId: extracted.scheduleId, periodKey: period.periodKey }, reversible: false });
          } else {
            const drafted = await rt.callTool<{ journalEntryId: string }>(
              "draft_journal",
              { tenantId: ctx.tenantId, createdBy: extracted.actingUserId, header, lineIds, allowNonStandard: true, overrideReason },
              { requestedAutonomy: AI_AUTONOMY_LEVEL.DRAFT, idempotencyKey: `ai-10-draft:${extracted.scheduleId}:${period.periodKey}` },
            );
            await rt.callTool(
              "link_schedule_draft",
              { tenantId: ctx.tenantId, scheduleId: extracted.scheduleId, periodKey: period.periodKey, journalEntryId: drafted.journalEntryId },
              { requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS },
            );
            actionsTaken.push({ tool: "draft_journal", args: { scheduleId: extracted.scheduleId, periodKey: period.periodKey }, reversible: true });
          }
          overrideReasons.push(overrideReason);
        } catch {
          // Locked period or no acting user — period stays pending, next sweep retries (B.2).
        }
      }

      let tieOutFindings: ActResult["findings"] = [];
      try {
        const tieOut = await computeAssetRegisterToGl(ctx.tenantId, extracted.assetAccountId);
        if (Math.abs(tieOut.difference) > 0.01) {
          tieOutFindings = [
            {
              id: `ai10-tieout-${extracted.assetAccountId}`,
              type: AI_FINDING_TYPE.ANOMALY,
              severity: Math.abs(tieOut.difference) > 1000 ? AI_FINDING_SEVERITY.HIGH : AI_FINDING_SEVERITY.LOW,
              title: "Fixed asset register does not tie to GL",
              detail: `Register NBV ${tieOut.registerNbv} vs GL balance ${tieOut.glBalance} on account ${extracted.assetAccountId} — difference ${tieOut.difference}`,
              amount: tieOut.difference,
              confidence: 1,
              subjectRefs: [{ model: "Account", id: extracted.assetAccountId }],
              evidence: [],
              reasonChain: [],
            },
          ];
        }
      } catch {
        // Tie-out is best-effort reporting, not a gate on posting.
      }

      return {
        findings: tieOutFindings,
        actionsTaken,
        metrics: { scanned: periods.length, autoActioned: actionsTaken.length, policy_overrides: overrideReasons.length },
        reasonChain: overrideReasons,
      };
    }

    // capital_check never writes — asset creation is a human decision (spec: RECOMMEND).
    return { findings: [], actionsTaken: [] };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
