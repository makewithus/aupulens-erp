import connectDB from "@/lib/db";
import mongoose from "mongoose";
import SaleOrder from "@/models/sales/SaleOrder";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import Customer from "@/models/sales/Customer";
import Account from "@/models/finance/Account";
import AiSchedule, { AI_SCHEDULE_TYPE, AI_SCHEDULE_PERIOD_STATUS } from "@/models/ai/AiSchedule";
import { scheduleBelongsTo } from "@/lib/aiRuntime/schedules/ownership";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY, Q2C_STATUS, SALES_ORDER_SHIPMENT_STATUS, SALES_INVOICE_STATUS } from "@/lib/constants/statuses";
import type {
  WorkflowDefinition,
  ObservedResult,
  ReasonResult,
  ActResult,
  VerifyResult,
} from "@/lib/aiRuntime/workflows/types";

/**
 * AI-09 — Revenue recognition intelligence (docs/ai/BRIEF-03-BATCH-B.md, "build last"). **A.2
 * investigation, answered**: `SaleOrder.revenueRecognition.recognizedAt`/`.recognizedBy` are set
 * in exactly one place, `app/api/sales/sale-orders/[id]/route.ts`, on a `q2cStatus` transition —
 * a human action, not an engine. `.amount`/`.method` are never written anywhere in the codebase;
 * they are dead sub-fields (same class of finding as `Invoice.invoiceLines[].taxIds`, Part 0.2).
 * Where a human HAS stated `.method`, per A.2/algorithm step 1 that is human intent and wins over
 * anything this workflow would otherwise infer.
 *
 * **A.2's boundary, structurally enforced**: this file reads `SaleOrder`/`SalesInvoice`/
 * `Customer` freely, tenant-scoped, and never imports a write path for any `models/sales/**`
 * model — recognition entries are Finance-side `draft_journal` calls only. Proven by a
 * source-grep test in tests/ai/aiRuntime/ai09RevenueRecognition.test.ts, in the style of the
 * existing safety.test.ts.
 *
 * **Milestone basis is never auto-anything**: with no milestone-tracking data anywhere in this
 * codebase, a human-stated `method: "milestone"` order is read-only reporting for this workflow —
 * never a schedule, never a draft — satisfying "nothing recognised before the milestone" by
 * construction rather than by guessing when a milestone was hit.
 *
 * **Two trigger modes**: `ai.sweep.hourly` scans every SaleOrder past `q2cStatus: sales_order`,
 * classifying the four-quantity divergence and drafting a point-in-time recognition journal or an
 * over-time `deferred_revenue` AiSchedule where warranted; `schedule.due` drafts (never posts —
 * "Autonomy: DRAFT always this batch. Nothing about revenue recognition auto-posts," overriding
 * `ctx.policy.autoPostSchedules` unconditionally) each due period of a schedule this workflow
 * owns (`sourceRef.model: "SaleOrder"`), no-opping on schedules AI-08/AI-10 own — same fan-out
 * guard those two workflows use.
 */

const SUBSCRIPTION_KEYWORDS = ["subscription", "annual", "retainer", "amc", "recurring"];
const RECOGNISED_ORDER_STAGES = [Q2C_STATUS.SALES_ORDER, Q2C_STATUS.FULFILLMENT, Q2C_STATUS.INVOICE_POSTED, Q2C_STATUS.REVENUE_RECOGNIZED];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface Ai09Raw {
  mode: "scan" | "schedule_run";
  actingUserId?: string;
  scheduleId?: string;
}

interface OrderDivergence {
  orderId: string;
  orderName: string;
  customerName: string;
  basis: "point_in_time" | "over_time" | "milestone";
  basisSource: "stated" | "proposed";
  contracted: number;
  billed: number;
  delivered: number;
  recognised: number;
  hasExistingSchedule: boolean;
}

interface Ai09ScanExtracted {
  mode: "scan";
  actingUserId?: string;
  orders: OrderDivergence[];
  revenueAccountId: string | null;
  unbilledRevenueAccountId: string | null;
  deferredRevenueAccountId: string | null;
}

interface Ai09ScheduleExtracted {
  mode: "schedule_run";
  actingUserId?: string;
  scheduleId: string;
  duePeriods: { periodKey: string; dueDate: Date; amount: number }[];
  schedule: { debitAccountId: string; creditAccountId: string };
}

type Ai09Extracted = Ai09ScanExtracted | Ai09ScheduleExtracted;

interface Ai09Proposal {
  mode: "scan" | "schedule_run";
  pointInTimeRecognitions: OrderDivergence[];
  newOverTimeSchedules: OrderDivergence[];
  duePeriods?: { periodKey: string; dueDate: Date; amount: number }[];
}

export const ai09RevenueRecognition: WorkflowDefinition<Ai09Raw, Ai09Extracted, Ai09Proposal> = {
  id: "AI-09",
  version: "1.0.0",
  eventKeys: ["ai.sweep.hourly", "schedule.due"],
  actionClass: "revenue_recognition",
  defaultAutonomy: AI_AUTONOMY_LEVEL.DRAFT,

  // `ai.sweep.hourly` is fan-out (shared with AI-03/AI-07) — always accepted. `schedule.due` is
  // real ownership: AI-09's deferred_revenue schedules are sourced from SaleOrder, distinct from
  // AI-08's own deferred_revenue schedules (sourced from Invoice) — docs/ai/BRIEF-04-BATCH-C.md
  // Part 0.2.
  async subscriptionFilter(event): Promise<boolean> {
    if (event.eventKey !== "schedule.due") return true;
    const scheduleId = event.payload.scheduleId ? String(event.payload.scheduleId) : "";
    if (!scheduleId) return false;
    return scheduleBelongsTo(event.tenantId, scheduleId, AI_SCHEDULE_TYPE.DEFERRED_REVENUE, "SaleOrder");
  },

  async observe(event): Promise<ObservedResult<Ai09Raw>> {
    const actingUserId = event.payload.actingUserId ? String(event.payload.actingUserId) : undefined;
    if (event.eventKey === "schedule.due") {
      const scheduleId = String(event.payload.scheduleId);
      return { entityId: scheduleId, subjectRef: { model: "AiSchedule", id: scheduleId }, raw: { mode: "schedule_run", scheduleId, actingUserId } };
    }
    return { entityId: event.tenantId, raw: { mode: "scan", actingUserId } };
  },

  async extract(observed, ctx): Promise<Ai09Extracted> {
    await connectDB();

    if (observed.raw.mode === "schedule_run") {
      const schedule = await AiSchedule.findById(observed.raw.scheduleId).lean();
      if (!schedule) throw new Error(`AiSchedule ${observed.raw.scheduleId} not found`);

      const owned = schedule.scheduleType === AI_SCHEDULE_TYPE.DEFERRED_REVENUE && schedule.sourceRef.model === "SaleOrder";
      const today = new Date();
      const duePeriods = owned
        ? (schedule.periods ?? [])
            .filter((p) => p.status === AI_SCHEDULE_PERIOD_STATUS.PENDING && p.dueDate.getTime() <= today.getTime())
            .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
            .map((p) => ({ periodKey: p.periodKey, dueDate: p.dueDate, amount: p.amount }))
        : [];

      return {
        mode: "schedule_run",
        actingUserId: observed.raw.actingUserId,
        scheduleId: observed.raw.scheduleId!,
        duePeriods,
        schedule: { debitAccountId: String(schedule.debitAccountId), creditAccountId: String(schedule.creditAccountId) },
      };
    }

    const saleOrders = await SaleOrder.find({ tenantId: ctx.tenantId, q2cStatus: { $in: RECOGNISED_ORDER_STAGES } }).lean();

    const orders: OrderDivergence[] = [];
    for (const order of saleOrders) {
      const customer = order.header?.partnerId ? await Customer.findById(order.header.partnerId).select("header.name").lean() : null;
      const customerName = (customer as { header?: { name?: string } } | null)?.header?.name ?? "";

      const contracted = order.totals?.amountTotal ?? 0;

      let billed = 0;
      if (order.salesInvoiceIds?.length) {
        // See lib/aiRuntime/tools/scheduleReadTools.ts's note on SalesInvoice's ambiguous
        // Model export type — same call-site workaround, not a model-file change.
        const invoices = await (SalesInvoice as unknown as mongoose.Model<Record<string, unknown>>)
          .find({
            _id: { $in: order.salesInvoiceIds },
            status: { $nin: [SALES_INVOICE_STATUS.DRAFT, SALES_INVOICE_STATUS.CANCELLED] },
          })
          .select("totalAmount")
          .lean();
        billed = round2(invoices.reduce((s, i) => s + ((i as { totalAmount?: number }).totalAmount ?? 0), 0));
      }

      const shipmentFulfilled = order.shipmentStatus === SALES_ORDER_SHIPMENT_STATUS.FULFILLED || Boolean(order.fulfillment?.triggeredAt);
      const delivered = shipmentFulfilled ? contracted : 0;

      const statedMethod = order.revenueRecognition?.method as "point_in_time" | "over_time" | "milestone" | undefined;
      const nameForKeywordCheck = `${order.header?.name ?? ""} ${(order.orderLines ?? []).map((l) => l.name).join(" ")}`.toLowerCase();
      const basis: OrderDivergence["basis"] = statedMethod ?? (SUBSCRIPTION_KEYWORDS.some((k) => nameForKeywordCheck.includes(k)) ? "over_time" : "point_in_time");
      const basisSource: "stated" | "proposed" = statedMethod ? "stated" : "proposed";

      const existingSchedule =
        basis === "over_time"
          ? await AiSchedule.findOne({ tenantId: ctx.tenantId, scheduleType: AI_SCHEDULE_TYPE.DEFERRED_REVENUE, "sourceRef.model": "SaleOrder", "sourceRef.id": String(order._id) }).lean()
          : null;

      let recognised = 0;
      if (basis === "point_in_time") {
        recognised = order.revenueRecognition?.recognizedAt ? contracted : 0;
      } else if (basis === "over_time" && existingSchedule) {
        recognised = round2(
          (existingSchedule.periods ?? [])
            .filter((p) => p.status === AI_SCHEDULE_PERIOD_STATUS.DRAFTED || p.status === AI_SCHEDULE_PERIOD_STATUS.POSTED)
            .reduce((s, p) => s + p.amount, 0),
        );
      }

      orders.push({
        orderId: String(order._id),
        orderName: order.header?.name ?? String(order._id),
        customerName,
        basis,
        basisSource,
        contracted,
        billed,
        delivered,
        recognised,
        hasExistingSchedule: Boolean(existingSchedule),
      });
    }

    const revenueAccount = await Account.findOne({ tenantId: ctx.tenantId, account_type: "income", isActive: { $ne: false }, isLocked: { $ne: true } }).lean();
    const unbilledRevenueAccount = await Account.findOne({ tenantId: ctx.tenantId, account_type: "asset_current", isActive: { $ne: false }, isLocked: { $ne: true } }).lean();
    const deferredRevenueAccount = await Account.findOne({ tenantId: ctx.tenantId, account_type: "liability_current", isActive: { $ne: false }, isLocked: { $ne: true } }).lean();

    return {
      mode: "scan",
      actingUserId: observed.raw.actingUserId,
      orders,
      revenueAccountId: revenueAccount ? String(revenueAccount._id) : null,
      unbilledRevenueAccountId: unbilledRevenueAccount ? String(unbilledRevenueAccount._id) : null,
      deferredRevenueAccountId: deferredRevenueAccount ? String(deferredRevenueAccount._id) : null,
    };
  },

  async reason(extracted): Promise<ReasonResult<Ai09Proposal>> {
    if (extracted.mode === "schedule_run") {
      return {
        proposal: { mode: "schedule_run", pointInTimeRecognitions: [], newOverTimeSchedules: [], duePeriods: extracted.duePeriods },
        confidence: extracted.duePeriods.length > 0 ? 1 : 0,
        findings: [],
        reasonChain: [`deferred-revenue schedule ${extracted.scheduleId}: ${extracted.duePeriods.length} period(s) due`],
        gateOverrides: { periodOpen: true, permissionOk: Boolean(extracted.actingUserId) },
      };
    }

    const reasonChain = [`scanned ${extracted.orders.length} sale order(s) past confirmation`];
    const findings: ReasonResult<Ai09Proposal>["findings"] = [];
    const pointInTimeRecognitions: OrderDivergence[] = [];
    const newOverTimeSchedules: OrderDivergence[] = [];

    for (const o of extracted.orders) {
      // Independent divergence classification (spec algorithm step 3) — every check fires on
      // its own signal, so a fully delivered/billed/recognised order trips none of them.
      if (round2(o.billed - o.recognised) > 0.01) {
        findings.push({
          id: `ai09-deferred-${o.orderId}`,
          type: AI_FINDING_TYPE.EXPLANATION,
          severity: AI_FINDING_SEVERITY.INFO,
          title: "Deferred revenue",
          detail: `${o.orderName}: billed ${o.billed} exceeds recognised ${o.recognised}`,
          amount: round2(o.billed - o.recognised),
          confidence: 1,
          subjectRefs: [{ model: "SaleOrder", id: o.orderId }],
          evidence: [],
          reasonChain: [],
        });
      }
      if (round2(o.recognised - o.billed) > 0.01) {
        findings.push({
          id: `ai09-unbilled-${o.orderId}`,
          type: AI_FINDING_TYPE.EXPLANATION,
          severity: AI_FINDING_SEVERITY.MEDIUM,
          title: "Unbilled / accrued revenue",
          detail: `${o.orderName}: recognised ${o.recognised} exceeds billed ${o.billed}`,
          amount: round2(o.recognised - o.billed),
          confidence: 1,
          subjectRefs: [{ model: "SaleOrder", id: o.orderId }],
          evidence: [],
          reasonChain: [],
        });
      }
      if (o.delivered > 0 && o.billed === 0) {
        findings.push({
          id: `ai09-leakage-${o.orderId}`,
          type: AI_FINDING_TYPE.ANOMALY,
          severity: AI_FINDING_SEVERITY.HIGH,
          title: `Revenue leakage — ${o.customerName || "unknown customer"} delivered but never billed`,
          detail: `${o.orderName}: delivered ${o.delivered} to ${o.customerName || "unknown customer"} with zero invoiced`,
          amount: o.delivered,
          confidence: 1,
          subjectRefs: [{ model: "SaleOrder", id: o.orderId }],
          evidence: [],
          reasonChain: [],
        });
      }
      if (o.billed > 0 && o.delivered === 0) {
        findings.push({
          id: `ai09-fulfilmentgap-${o.orderId}`,
          type: AI_FINDING_TYPE.EXCEPTION,
          severity: AI_FINDING_SEVERITY.MEDIUM,
          title: "Fulfilment gap",
          detail: `${o.orderName}: billed ${o.billed} but nothing delivered yet`,
          amount: o.billed,
          confidence: 1,
          subjectRefs: [{ model: "SaleOrder", id: o.orderId }],
          evidence: [],
          reasonChain: [],
        });
      }

      if (o.basis === "milestone") continue; // never auto-anything (see module doc comment)

      if (o.basis === "point_in_time" && o.delivered >= o.contracted && o.contracted > 0 && o.recognised === 0) {
        pointInTimeRecognitions.push(o);
      }
      if (o.basis === "over_time" && !o.hasExistingSchedule && o.contracted > 0) {
        newOverTimeSchedules.push(o);
      }
    }

    reasonChain.push(`${pointInTimeRecognitions.length} point-in-time recognition(s) ready, ${newOverTimeSchedules.length} new over-time schedule(s) to create`);

    return {
      proposal: { mode: "scan", pointInTimeRecognitions, newOverTimeSchedules },
      confidence: pointInTimeRecognitions.length + newOverTimeSchedules.length > 0 ? 1 : 0,
      findings,
      reasonChain,
      gateOverrides: { periodOpen: true, permissionOk: Boolean(extracted.actingUserId) },
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt, extracted): Promise<ActResult> {
    if (extracted.mode === "schedule_run") {
      // See ai-08's act() comment: decision.autonomyApplied must be checked explicitly —
      // callTool()'s maxAutonomyLevel check alone does not consult the gate's verdict.
      const actionsTaken: ActResult["actionsTaken"] = [];
      if (decision.autonomyApplied === AI_AUTONOMY_LEVEL.RECOMMEND) {
        return { findings: [], actionsTaken };
      }
      const overrideReasons: string[] = [];
      for (const period of reasoned.proposal.duePeriods ?? []) {
        const lineIds = [
          { accountId: extracted.schedule.debitAccountId, label: `Revenue recognition ${period.periodKey}`, debit: period.amount, credit: 0 },
          { accountId: extracted.schedule.creditAccountId, label: `Revenue recognition ${period.periodKey}`, debit: 0, credit: period.amount },
        ];
        // Never post_journal here — "Autonomy: DRAFT always this batch. Nothing about revenue
        // recognition auto-posts" overrides ctx.policy.autoPostSchedules unconditionally.
        // Deferred-revenue recognition offsets Income against the deferred-revenue Liability
        // account draining down — smart-rules.ts's income rule only whitelists Cash/Bank/Asset
        // offsets for Income, so this legitimate pairing needs the same audited override
        // AI-08/AI-10 use for their own asset/liability-offset schedule postings.
        const overrideReason = `AI-09 deferred-revenue recognition for period ${period.periodKey} — income offset against the deferred-revenue liability account by design.`;
        try {
          const drafted = await rt.callTool<{ journalEntryId: string }>(
            "draft_journal",
            {
              tenantId: ctx.tenantId,
              createdBy: extracted.actingUserId,
              header: { journalType: "sale" as const, date: period.dueDate },
              lineIds,
              allowNonStandard: true,
              overrideReason,
            },
            { requestedAutonomy: AI_AUTONOMY_LEVEL.DRAFT, idempotencyKey: `ai-09-draft:${extracted.scheduleId}:${period.periodKey}` },
          );
          await rt.callTool(
            "link_schedule_draft",
            { tenantId: ctx.tenantId, scheduleId: extracted.scheduleId, periodKey: period.periodKey, journalEntryId: drafted.journalEntryId },
            { requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS },
          );
          actionsTaken.push({ tool: "draft_journal", args: { scheduleId: extracted.scheduleId, periodKey: period.periodKey }, reversible: true });
          overrideReasons.push(overrideReason);
        } catch {
          // Locked period or no acting user — period stays pending, next sweep retries.
        }
      }
      return {
        findings: [],
        actionsTaken,
        metrics: { scanned: (reasoned.proposal.duePeriods ?? []).length, autoActioned: actionsTaken.length, policy_overrides: overrideReasons.length },
        reasonChain: overrideReasons,
      };
    }

    if (decision.autonomyApplied !== AI_AUTONOMY_LEVEL.DRAFT) {
      return { findings: [], actionsTaken: [] };
    }

    const actionsTaken: ActResult["actionsTaken"] = [];

    if (extracted.revenueAccountId && extracted.unbilledRevenueAccountId) {
      for (const o of reasoned.proposal.pointInTimeRecognitions) {
        try {
          await rt.callTool(
            "draft_journal",
            {
              tenantId: ctx.tenantId,
              createdBy: extracted.actingUserId,
              header: { journalType: "sale" as const, date: new Date(), ref: o.orderName },
              lineIds: [
                { accountId: extracted.unbilledRevenueAccountId, label: `Revenue recognition ${o.orderName}`, debit: o.contracted, credit: 0 },
                { accountId: extracted.revenueAccountId, label: `Revenue recognition ${o.orderName}`, debit: 0, credit: o.contracted },
              ],
            },
            { requestedAutonomy: AI_AUTONOMY_LEVEL.DRAFT, idempotencyKey: `ai-09-recognize:${o.orderId}` },
          );
          actionsTaken.push({ tool: "draft_journal", args: { orderId: o.orderId, amount: o.contracted }, reversible: true });
        } catch {
          // Smart-rules veto or no acting user — leave as a finding, no draft.
        }
      }
    }

    if (extracted.deferredRevenueAccountId && extracted.revenueAccountId) {
      for (const o of reasoned.proposal.newOverTimeSchedules) {
        const startDate = new Date();
        const endDate = new Date();
        endDate.setUTCMonth(endDate.getUTCMonth() + 12);
        try {
          await rt.callTool(
            "draft_prepaid_schedule",
            {
              tenantId: ctx.tenantId,
              createdByWorkflow: "AI-09",
              scheduleType: "deferred_revenue",
              sourceRef: { model: "SaleOrder", id: o.orderId },
              startDate,
              endDate,
              frequency: "monthly",
              totalAmount: o.contracted,
              debitAccountId: extracted.deferredRevenueAccountId,
              creditAccountId: extracted.revenueAccountId,
              // AiSchedule.basis ("stated"|"inferred") describes where the SERVICE PERIOD came
              // from, distinct from o.basisSource ("stated"|"proposed" — whether a human stated
              // the recognition METHOD). A human-stated method still means an inferred period
              // here, since nothing sets an explicit start/end date for over-time recognition.
              basis: "inferred",
            },
            { requestedAutonomy: AI_AUTONOMY_LEVEL.DRAFT, idempotencyKey: `ai-09-schedule:${o.orderId}` },
          );
          actionsTaken.push({ tool: "draft_prepaid_schedule", args: { orderId: o.orderId }, reversible: true });
        } catch {
          // No acting user, or the schedule sum invariant was violated — leave as a finding.
        }
      }
    }

    return { findings: [], actionsTaken, metrics: { scanned: extracted.orders?.length ?? 0, autoActioned: actionsTaken.length } };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
