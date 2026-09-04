import connectDB from "@/lib/db";
import { subDays, subHours, differenceInCalendarDays } from "date-fns";
import JournalEntry from "@/models/finance/JournalEntry";
import AccountingSettings from "@/models/finance/AccountingSettings";
import AiAnomalySuppression from "@/models/ai/AiAnomalySuppression";
import AiDetectorHealth from "@/models/ai/AiDetectorHealth";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import { AI15_MIN_SAMPLE, AI15_PRECISION_FLOOR } from "@/lib/aiRuntime/tools/anomalyTools";
import { isManualJournalToSensitiveAccount, SENSITIVE_ACCOUNT_TYPES, SENSITIVE_GROUPS } from "@/lib/aiRuntime/journalPatterns/sensitiveAccountPattern";
import { isWeekendOrAfterHours, backdatedDays as computeBackdatedDays, BACKDATED_THRESHOLD_DAYS } from "@/lib/aiRuntime/journalPatterns/timingPatterns";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";

/**
 * AI-15 — Anomaly detection (docs/ai/BRIEF-05-BATCH-D.md). Continuously watches recently-posted
 * activity for things that don't fit the pattern. **Never accuses, never corrects** — every
 * output is an investigation (what was observed, what normal looks like, the deviation, and
 * suggested checks), never a proposed fix. No write tool exists anywhere that could act on a
 * financial document from this workflow.
 *
 * **A.5's precision machinery is the workflow, not garnish**: every detector below records
 * through `record_anomaly` (`models/ai/AiAnomaly.ts`, `models/ai/AiDetectorHealth.ts`), every
 * detector checks `AiAnomalySuppression` before raising, and every detector is skipped entirely
 * once its own `AiDetectorHealth.autoDisabled` flips true (a real, meaningful sample of human
 * review — `AI15_MIN_SAMPLE` reviewed anomalies — coming back below `AI15_PRECISION_FLOOR`
 * precision). **Every anomaly this chunk ships `silent: true`** — a freshly-built detector has
 * zero review history by construction, so it cannot yet have "cleared a minimum sample at
 * acceptable precision," and shipping loud from day one is exactly what the brief says loses the
 * user. Findings are still recorded (visible in the run's own audit trail); no attention item is
 * ever created for a silent anomaly.
 *
 * **Eleven detectors across all six families** (Amount, Counterparty, Account, Timing, Journal
 * pattern, Ratio/trend) — a deliberately smaller, real set rather than every named sub-example.
 * `vendor_shares_bank_or_address_with_employee` (docs/ai/BRIEF-08a-BATCH-G.md, AI-19 detection set
 * item 4) is implemented by reading AI-19's own `employeeCollisions` output (its most recent
 * `AiDecisionTrace`) rather than a second matching implementation here — `Customer` (the real AP
 * "vendor" model) has no bank-account or address field at all (confirmed, not assumed), so AI-19's
 * honest name/email-based collision check is what actually backs this detector's name.
 * `product_margin_step_change` reads AI-11's own trace the same way (docs/ai/BRIEF-08a-BATCH-G.md,
 * AI-11: "route it through AI-15's ratio/trend detector family rather than a new alert path").
 * Round-number clustering, reversal-of-reversal, novel-account-pairing and rare-poster checks are
 * still deferred (same "build the strongest version of fewer things" choice AI-07 made for
 * recurring-vendor pattern-matching, not silently dropped).
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const LOOKBACK_HOURS = 24;

interface Ai15Raw {
  actingUserId?: string;
}

interface RecentLine {
  entryId: string;
  entryName: string;
  journalType: string;
  date: Date;
  createdAt: Date;
  accountId: string;
  accountName: string;
  accountType: string;
  internalGroup: string;
  partnerId: string | null;
  partnerName: string | null;
  signedAmount: number;
  debit: number;
  credit: number;
}

interface HistoricalStat {
  count: number;
  mean: number;
  stddev: number;
}

interface RawAnomaly {
  detectorId: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  subjectRefs: { model: string; id: string }[];
  observed: string;
  expectedRange: string;
  deviation: string;
  historicalBasis: string;
  evidence: { kind: "record"; ref: string; label: string }[];
  suggestedChecks: string[];
  suppressionKey: string;
}

interface Ai15Extracted {
  actingUserId?: string;
  recentLines: RecentLine[];
  vendorAccountStats: Map<string, HistoricalStat>; // key: `${partnerId}:${accountId}`
  accountHistoricalCounts: Map<string, number>;
  vendorFirstSeen: Map<string, Date>;
  vendorLastSeenBeforeWindow: Map<string, Date>;
  firstTxnAmounts: number[];
  approvalThresholdAmount: number | null;
  autoDisabledDetectors: Set<string>;
  activeSuppressionKeys: Set<string>; // `${detectorId}:${suppressionKey}`
  ai14Comparisons: { line: string; accountId: string; variance: number; variancePct: number | null; unexplainedAmount: number; materialityVerdict: string }[];
  ai11MarginAlerts: { productId: string; productName: string; currentMarginPercent: number; priorMarginPercent: number }[];
  ai19EmployeeCollisions: { vendorId: string; employeeId: string; matchedOn: string[] }[];
  detectorHealth: { detectorId: string; raised: number; confirmed: number; dismissed: number; precision: number | null; sampleSize: number; autoDisabled: boolean }[];
}

// `vendor_shares_bank_or_address_with_employee` moved out of this array in Chunk 8a — AI-19 now
// supplies real matching for it (see this file's own doc comment). Nothing else is deferred as
// not_implemented at this time; kept as a typed array so a future gap has somewhere to go.
const NOT_IMPLEMENTED: { what: string; reason: string }[] = [];

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

type Ai15Proposal = { anomalies: RawAnomaly[]; detectorHealth: Ai15Extracted["detectorHealth"]; notImplemented: typeof NOT_IMPLEMENTED };

export const ai15AnomalyDetection: WorkflowDefinition<Ai15Raw, Ai15Extracted, Ai15Proposal> = {
  id: "AI-15",
  version: "1.0.0",
  eventKeys: ["ai.sweep.hourly"],
  actionClass: "anomaly_detection",
  defaultAutonomy: AI_AUTONOMY_LEVEL.OBSERVE,

  async subscriptionFilter(): Promise<boolean> {
    return true;
  },

  async observe(event): Promise<ObservedResult<Ai15Raw>> {
    return { entityId: event.tenantId, raw: { actingUserId: event.payload.actingUserId ? String(event.payload.actingUserId) : undefined } };
  },

  async extract(observed, ctx): Promise<Ai15Extracted> {
    await connectDB();
    const tenantId = ctx.tenantId;
    const now = new Date();
    const windowStart = subHours(now, LOOKBACK_HOURS);

    const recentEntries = await JournalEntry.find({ tenantId, status: "posted", createdAt: { $gte: windowStart } })
      .populate("lineIds.accountId")
      .populate("lineIds.partnerId")
      .lean();

    const recentLines: RecentLine[] = [];
    for (const entry of recentEntries) {
      for (const line of entry.lineIds || []) {
        const account = line.accountId as any;
        if (!account) continue;
        const partner = line.partnerId as any;
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        const internalGroup = account.internal_group || "off_balance";
        recentLines.push({
          entryId: String(entry._id),
          entryName: entry.header?.name || "",
          journalType: entry.header?.journalType || "general",
          date: new Date(entry.header?.date ?? entry.createdAt),
          createdAt: new Date(entry.createdAt),
          accountId: String(account._id),
          accountName: account.name || "",
          accountType: account.account_type || "",
          internalGroup,
          partnerId: partner?._id ? String(partner._id) : null,
          partnerName: partner?.header?.displayName || partner?.header?.name || null,
          signedAmount: internalGroup === "asset" || internalGroup === "expense" ? debit - credit : credit - debit,
          debit,
          credit,
        });
      }
    }

    // Historical baseline — everything posted BEFORE this window, up to 2 years back (bounded
    // for query cost; a longer baseline would only sharpen thresholds, never invalidate them).
    const historyStart = subDays(windowStart, 730);
    const historyEntries = await JournalEntry.find({ tenantId, status: "posted", createdAt: { $gte: historyStart, $lt: windowStart } })
      .populate("lineIds.accountId")
      .populate("lineIds.partnerId")
      .lean();

    const vendorAccountAmounts = new Map<string, number[]>();
    const accountHistoricalCounts = new Map<string, number>();
    const vendorFirstSeen = new Map<string, Date>();
    const vendorLastSeenBeforeWindow = new Map<string, Date>();
    const firstTxnAmounts: number[] = [];
    const vendorSeenAny = new Set<string>();

    for (const entry of historyEntries) {
      const entryDate = new Date(entry.header?.date ?? entry.createdAt);
      for (const line of entry.lineIds || []) {
        const account = line.accountId as any;
        if (!account) continue;
        const partner = line.partnerId as any;
        const accountId = String(account._id);
        accountHistoricalCounts.set(accountId, (accountHistoricalCounts.get(accountId) ?? 0) + 1);

        if (!partner?._id) continue;
        const partnerId = String(partner._id);
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        const internalGroup = account.internal_group || "off_balance";
        const signed = internalGroup === "asset" || internalGroup === "expense" ? debit - credit : credit - debit;

        const key = `${partnerId}:${accountId}`;
        const arr = vendorAccountAmounts.get(key) ?? [];
        arr.push(signed);
        vendorAccountAmounts.set(key, arr);

        const first = vendorFirstSeen.get(partnerId);
        if (!first || entryDate < first) vendorFirstSeen.set(partnerId, entryDate);
        const last = vendorLastSeenBeforeWindow.get(partnerId);
        if (!last || entryDate > last) vendorLastSeenBeforeWindow.set(partnerId, entryDate);

        if (!vendorSeenAny.has(partnerId)) {
          vendorSeenAny.add(partnerId);
          firstTxnAmounts.push(Math.abs(signed));
        }
      }
    }

    const vendorAccountStats = new Map<string, HistoricalStat>();
    for (const [key, amounts] of vendorAccountAmounts.entries()) {
      const count = amounts.length;
      const mean = amounts.reduce((s, a) => s + a, 0) / count;
      const variance = amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / count;
      vendorAccountStats.set(key, { count, mean, stddev: Math.sqrt(variance) });
    }

    const settings = await AccountingSettings.findOne({ tenantId }).lean();
    const approvalThresholdAmount = settings?.journals?.approvalThresholdAmount ?? null;

    const allHealthRows = await AiDetectorHealth.find({ tenantId }).lean();
    const autoDisabledDetectors = new Set(allHealthRows.filter((h) => h.autoDisabled).map((h) => h.detectorId));
    const detectorHealth = allHealthRows.map((h) => ({
      detectorId: h.detectorId,
      raised: h.raised,
      confirmed: h.confirmed,
      dismissed: h.dismissed,
      precision: h.precision,
      sampleSize: h.sampleSize,
      autoDisabled: h.autoDisabled,
    }));

    const activeSuppressions = await AiAnomalySuppression.find({ tenantId, suppressedUntil: { $gte: now } }).lean();
    const activeSuppressionKeys = new Set(activeSuppressions.map((s) => `${s.detectorId}:${s.suppressionKey}`));

    const ai14Trace = await AiDecisionTrace.findOne({ tenantId, workflowId: "AI-14" }).sort({ createdAt: -1 }).lean();
    const ai14Comparisons = ((ai14Trace?.rawProposal as { comparisons?: Ai15Extracted["ai14Comparisons"] } | undefined)?.comparisons ?? []);

    // AI-11's margin-by-product feeds this family directly — no separate alert path
    // (docs/ai/BRIEF-08a-BATCH-G.md, AI-11: "route it through AI-15's ratio/trend detector
    // family rather than a new alert path").
    const ai11Trace = await AiDecisionTrace.findOne({ tenantId, workflowId: "AI-11" }).sort({ createdAt: -1 }).lean();
    const ai11MarginAlertsRaw = ((ai11Trace?.rawProposal as { marginAlerts?: { productId: string; productName: string; currentMarginPercent: number | null; priorMarginPercent: number | null }[] } | undefined)?.marginAlerts ?? []);
    const ai11MarginAlerts = ai11MarginAlertsRaw.filter(
      (m): m is { productId: string; productName: string; currentMarginPercent: number; priorMarginPercent: number } => m.currentMarginPercent !== null && m.priorMarginPercent !== null,
    );

    // vendor_shares_bank_or_address_with_employee — reads AI-19's own employee-collision output
    // directly, never a second matching implementation (docs/ai/BRIEF-08a-BATCH-G.md, AI-19 item 4).
    const ai19Trace = await AiDecisionTrace.findOne({ tenantId, workflowId: "AI-19" }).sort({ createdAt: -1 }).lean();
    const ai19EmployeeCollisions = ((ai19Trace?.rawProposal as { employeeCollisions?: Ai15Extracted["ai19EmployeeCollisions"] } | undefined)?.employeeCollisions ?? []);

    return {
      actingUserId: observed.raw.actingUserId,
      recentLines,
      vendorAccountStats,
      accountHistoricalCounts,
      vendorFirstSeen,
      vendorLastSeenBeforeWindow,
      firstTxnAmounts,
      approvalThresholdAmount,
      autoDisabledDetectors,
      activeSuppressionKeys,
      ai14Comparisons,
      ai11MarginAlerts,
      ai19EmployeeCollisions,
      detectorHealth,
    };
  },

  async reason(extracted): Promise<ReasonResult<Ai15Proposal>> {
    const anomalies: RawAnomaly[] = [];
    const active = (detectorId: string) => !extracted.autoDisabledDetectors.has(detectorId);
    const suppressed = (detectorId: string, key: string) => extracted.activeSuppressionKeys.has(`${detectorId}:${key}`);
    const push = (a: RawAnomaly) => {
      if (!active(a.detectorId) || suppressed(a.detectorId, a.suppressionKey)) return;
      anomalies.push(a);
    };

    // ── Amount family ──
    for (const line of extracted.recentLines) {
      if (!line.partnerId) continue;
      const stat = extracted.vendorAccountStats.get(`${line.partnerId}:${line.accountId}`);
      if (stat && stat.count >= 5 && stat.stddev > 0.01) {
        const z = Math.abs(line.signedAmount - stat.mean) / stat.stddev;
        if (z >= 3) {
          push({
            detectorId: "amount_outlier",
            severity: z >= 6 ? "high" : "medium",
            subjectRefs: [{ model: "JournalEntry", id: line.entryId }],
            observed: `₹${round2(Math.abs(line.signedAmount))} on ${line.accountName} (${line.partnerName ?? "counterparty"})`,
            expectedRange: `₹${round2(stat.mean - 3 * stat.stddev)} to ₹${round2(stat.mean + 3 * stat.stddev)} (mean ${round2(stat.mean)}, ${stat.count} prior transactions)`,
            deviation: `${round2(z)} standard deviations from this vendor/account's history`,
            historicalBasis: `${stat.count} prior transactions for this vendor on this account`,
            evidence: [{ kind: "record", ref: line.entryId, label: line.entryName }],
            suggestedChecks: ["confirm the amount against the source document", "check for a data-entry error (extra digit)"],
            suppressionKey: `${line.partnerId}:${line.accountId}`,
          });
        }
      }
    }
    if (extracted.approvalThresholdAmount && extracted.approvalThresholdAmount > 0) {
      for (const line of extracted.recentLines) {
        const amt = Math.abs(line.signedAmount);
        if (amt >= extracted.approvalThresholdAmount * 0.9 && amt < extracted.approvalThresholdAmount) {
          push({
            detectorId: "amount_near_approval_threshold",
            severity: "low",
            subjectRefs: [{ model: "JournalEntry", id: line.entryId }],
            observed: `₹${round2(amt)} on ${line.accountName}`,
            expectedRange: `below ₹${extracted.approvalThresholdAmount} (the tenant's approval threshold)`,
            deviation: `${round2((amt / extracted.approvalThresholdAmount) * 100)}% of the approval threshold`,
            historicalBasis: "AccountingSettings.journals.approvalThresholdAmount",
            evidence: [{ kind: "record", ref: line.entryId, label: line.entryName }],
            suggestedChecks: ["confirm this wasn't split or sized to avoid triggering approval"],
            suppressionKey: `${line.accountId}`,
          });
        }
      }
    }

    // ── Counterparty family ──
    const medianFirstTxn = median(extracted.firstTxnAmounts);
    if (extracted.firstTxnAmounts.length >= 5) {
      const seenThisRun = new Set<string>();
      for (const line of extracted.recentLines) {
        if (!line.partnerId || seenThisRun.has(line.partnerId)) continue;
        if (extracted.vendorFirstSeen.has(line.partnerId)) continue; // not actually new
        seenThisRun.add(line.partnerId);
        const amt = Math.abs(line.signedAmount);
        if (medianFirstTxn > 0 && amt >= medianFirstTxn * 5) {
          push({
            detectorId: "new_vendor_large_first_txn",
            severity: "medium",
            subjectRefs: [{ model: "JournalEntry", id: line.entryId }],
            observed: `New counterparty ${line.partnerName ?? line.partnerId}'s first transaction is ₹${round2(amt)}`,
            expectedRange: `typical first transaction across all counterparties: ₹${round2(medianFirstTxn)}`,
            deviation: `${round2(amt / medianFirstTxn)}x the typical first-transaction size`,
            historicalBasis: `${extracted.firstTxnAmounts.length} counterparties' first transactions`,
            evidence: [{ kind: "record", ref: line.entryId, label: line.entryName }],
            suggestedChecks: ["verify this counterparty's identity and banking details before payment"],
            suppressionKey: line.partnerId,
          });
        }
      }
    }
    for (const line of extracted.recentLines) {
      if (!line.partnerId) continue;
      const lastSeen = extracted.vendorLastSeenBeforeWindow.get(line.partnerId);
      if (lastSeen && differenceInCalendarDays(line.date, lastSeen) >= 180) {
        push({
          detectorId: "dormant_vendor_reactivated",
          severity: "info",
          subjectRefs: [{ model: "JournalEntry", id: line.entryId }],
          observed: `${line.partnerName ?? line.partnerId} transacted again after ${differenceInCalendarDays(line.date, lastSeen)} days of inactivity`,
          expectedRange: "regular activity, no long gap",
          deviation: `${differenceInCalendarDays(line.date, lastSeen)} days since last activity`,
          historicalBasis: "this counterparty's own transaction history",
          evidence: [{ kind: "record", ref: line.entryId, label: line.entryName }],
          suggestedChecks: ["confirm this reactivation is expected"],
          suppressionKey: line.partnerId,
        });
      }
    }

    // ── Account family ──
    for (const line of extracted.recentLines) {
      const historicalCount = extracted.accountHistoricalCounts.get(line.accountId) ?? 0;
      if (historicalCount > 0 && historicalCount < 3) {
        push({
          detectorId: "rare_account_activity",
          severity: "low",
          subjectRefs: [{ model: "JournalEntry", id: line.entryId }],
          observed: `${line.accountName} received a posting — only ${historicalCount} prior posting(s) in the last 2 years`,
          expectedRange: "regular account usage",
          deviation: `rarely-used account (${historicalCount} prior posting(s))`,
          historicalBasis: "this account's own 2-year posting history",
          evidence: [{ kind: "record", ref: line.entryId, label: line.entryName }],
          suggestedChecks: ["confirm this account is the correct one for this transaction"],
          suppressionKey: line.accountId,
        });
      }
    }

    // ── Timing family — shared with AI-23 (lib/aiRuntime/journalPatterns/timingPatterns.ts) ──
    for (const line of extracted.recentLines) {
      const timing = isWeekendOrAfterHours(line.createdAt);
      if (timing.flagged) {
        const sensitive = SENSITIVE_ACCOUNT_TYPES.has(line.accountType) || SENSITIVE_GROUPS.has(line.internalGroup);
        push({
          detectorId: "weekend_or_after_hours_posting",
          severity: sensitive ? "high" : "low",
          subjectRefs: [{ model: "JournalEntry", id: line.entryId }],
          observed: `Posted ${timing.isWeekend ? "on a weekend" : "outside business hours"} to ${line.accountName}`,
          expectedRange: "weekday, business hours (07:00-21:00 UTC)",
          deviation: `${timing.isWeekend ? "weekend" : `${timing.hour}:00 UTC`} posting${sensitive ? " to a cash/revenue/equity account" : ""}`,
          historicalBasis: "posting timestamp (createdAt)",
          evidence: [{ kind: "record", ref: line.entryId, label: line.entryName }],
          suggestedChecks: ["confirm who posted this and why, outside normal hours"],
          suppressionKey: line.accountId,
        });
      }
      const backdatedDays = computeBackdatedDays(line.createdAt, line.date);
      if (backdatedDays >= BACKDATED_THRESHOLD_DAYS) {
        push({
          detectorId: "backdated_posting",
          severity: "medium",
          subjectRefs: [{ model: "JournalEntry", id: line.entryId }],
          observed: `Entry dated ${line.date.toISOString().slice(0, 10)} but posted ${backdatedDays} days later`,
          expectedRange: "posting date close to the entry's own date",
          deviation: `${backdatedDays} days backdated`,
          historicalBasis: "header.date vs createdAt (AI-28's confirmed correct pair for this comparison)",
          evidence: [{ kind: "record", ref: line.entryId, label: line.entryName }],
          suggestedChecks: ["confirm this backdating is legitimate (e.g. a genuine late-arriving document)"],
          suppressionKey: line.entryId,
        });
      }
    }

    // ── Journal pattern family — shared with AI-23 (lib/aiRuntime/journalPatterns/sensitiveAccountPattern.ts) ──
    for (const line of extracted.recentLines) {
      if (isManualJournalToSensitiveAccount(line.journalType, line.accountType, line.internalGroup)) {
        push({
          detectorId: "manual_journal_to_sensitive_account",
          severity: "high",
          subjectRefs: [{ model: "JournalEntry", id: line.entryId }],
          observed: `Manual (general) journal entry posted directly to ${line.accountName}`,
          expectedRange: "cash/revenue/equity accounts normally move only through business documents (sale/purchase/cash/bank journals)",
          deviation: "manual journal entry to a sensitive account",
          historicalBasis: "journalType classification",
          evidence: [{ kind: "record", ref: line.entryId, label: line.entryName }],
          suggestedChecks: ["confirm the business reason for a manual entry here instead of the normal document flow"],
          suppressionKey: line.accountId,
        });
      }
    }

    // ── Ratio/trend family — reads AI-14, never recomputes its variance logic ──
    for (const c of extracted.ai14Comparisons) {
      if (c.materialityVerdict !== "material") continue;
      if (c.variance === 0) continue;
      const unexplainedShare = Math.abs(c.unexplainedAmount) / Math.abs(c.variance);
      if (unexplainedShare >= 0.5) {
        push({
          detectorId: "ratio_trend_step_change",
          severity: "medium",
          subjectRefs: [{ model: "Account", id: c.accountId }],
          observed: `${c.line} moved by ${c.variance} (${c.variancePct ?? "n/a"}%) with ${round2(unexplainedShare * 100)}% left unexplained by AI-14`,
          expectedRange: "a material movement should be mostly explained by named drivers",
          deviation: `${round2(unexplainedShare * 100)}% of the variance has no identified driver`,
          historicalBasis: "AI-14's most recent flux analysis for this tenant",
          evidence: [{ kind: "record", ref: c.accountId, label: c.line }],
          suggestedChecks: ["review AI-14's decomposition for this account directly"],
          suppressionKey: c.accountId,
        });
      }
    }

    for (const m of extracted.ai11MarginAlerts) {
      const dropPoints = m.priorMarginPercent - m.currentMarginPercent;
      if (dropPoints < 10) continue;
      push({
        detectorId: "product_margin_step_change",
        severity: dropPoints >= 25 ? "high" : "medium",
        subjectRefs: [{ model: "Product", id: m.productId }],
        observed: `${m.productName}'s margin moved from ${m.priorMarginPercent}% to ${m.currentMarginPercent}%`,
        expectedRange: "a product's margin should stay broadly stable month over month",
        deviation: `${round2(dropPoints)} percentage-point drop`,
        historicalBasis: "AI-11's most recent inventory/COGS run for this tenant (estimated COGS via standard_price — see AI-11's own trace for the caveat)",
        evidence: [{ kind: "record", ref: m.productId, label: m.productName }],
        suggestedChecks: ["review AI-11's margin computation for this product directly", "confirm no costing or pricing error"],
        suppressionKey: m.productId,
      });
    }

    for (const c of extracted.ai19EmployeeCollisions) {
      push({
        detectorId: "vendor_shares_bank_or_address_with_employee",
        severity: "high",
        subjectRefs: [{ model: "Customer", id: c.vendorId }, { model: "Employee", id: c.employeeId }],
        observed: `Vendor ${c.vendorId} matches employee ${c.employeeId} on ${c.matchedOn.join(", ")}`,
        expectedRange: "no vendor record should resemble an employee (name/email)",
        deviation: `matched on: ${c.matchedOn.join(", ")}`,
        historicalBasis: "AI-19's most recent master-data sweep for this tenant",
        evidence: [{ kind: "record", ref: c.vendorId, label: "vendor" }, { kind: "record", ref: c.employeeId, label: "employee" }],
        suggestedChecks: ["confirm this vendor is not a shell entity tied to an employee (conflict of interest)"],
        suppressionKey: `${c.vendorId}:${c.employeeId}`,
      });
    }

    const findings: ReasonResult<Ai15Proposal>["findings"] = anomalies.map((a) => ({
      id: `ai15-${a.detectorId}-${a.suppressionKey}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: AI_FINDING_TYPE.ANOMALY,
      severity: a.severity === "critical" ? AI_FINDING_SEVERITY.CRITICAL : a.severity === "high" ? AI_FINDING_SEVERITY.HIGH : a.severity === "medium" ? AI_FINDING_SEVERITY.MEDIUM : a.severity === "low" ? AI_FINDING_SEVERITY.LOW : AI_FINDING_SEVERITY.INFO,
      title: `${a.detectorId}: ${a.observed}`,
      detail: a.deviation,
      confidence: 1,
      subjectRefs: a.subjectRefs,
      evidence: a.evidence,
      reasonChain: [],
    }));

    return {
      proposal: { anomalies, detectorHealth: extracted.detectorHealth, notImplemented: NOT_IMPLEMENTED },
      confidence: 1,
      findings,
      reasonChain: [`${extracted.recentLines.length} line(s) scanned in the last ${LOOKBACK_HOURS}h`, `${anomalies.length} anomaly(ies) raised (all silent this chunk — no detector has cleared review yet)`],
      gateOverrides: { periodOpen: true, permissionOk: true },
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt): Promise<ActResult> {
    const actionsTaken: ActResult["actionsTaken"] = [];
    for (const a of reasoned.proposal.anomalies) {
      try {
        await rt.callTool(
          "record_anomaly",
          {
            tenantId: ctx.tenantId,
            detectorId: a.detectorId,
            runId: rt.runId,
            severity: a.severity,
            subjectRefs: a.subjectRefs,
            observed: a.observed,
            expectedRange: a.expectedRange,
            deviation: a.deviation,
            historicalBasis: a.historicalBasis,
            evidence: a.evidence,
            suggestedChecks: a.suggestedChecks,
            suppressionKey: a.suppressionKey,
            silent: true, // A.5 — every detector ships silent until it has cleared review at acceptable precision
          },
          { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE, idempotencyKey: `ai-15-anomaly:${a.detectorId}:${a.subjectRefs[0]?.id ?? a.suppressionKey}:${Date.now()}` },
        );
        actionsTaken.push({ tool: "record_anomaly", args: { detectorId: a.detectorId }, reversible: true });
      } catch {
        // Best-effort — next sweep retries.
      }
    }
    return { findings: [], actionsTaken, metrics: { scanned: actionsTaken.length, matched: actionsTaken.length } };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};

export { AI15_MIN_SAMPLE, AI15_PRECISION_FLOOR };
