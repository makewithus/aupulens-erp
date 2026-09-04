import connectDB from "@/lib/db";
import Invoice from "@/models/finance/Invoice";
import JournalEntry from "@/models/finance/JournalEntry";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiToolCall, { AI_TOOL_CALL_STATUS } from "@/models/ai/AiToolCall";
import AiEvent from "@/models/ai/AiEvent";
import AiSchedule, { AI_SCHEDULE_STATUS } from "@/models/ai/AiSchedule";
import AiTaxTransaction from "@/models/ai/AiTaxTransaction";
import FxRate from "@/models/finance/FxRate";
import Integration, { INTEGRATION_STATUS } from "@/models/shared/Integration";
import { DOCUMENT_STATUS, AI_RUN_STATUS, AI_EVENT_STATUS } from "@/lib/constants/statuses";

/**
 * AI-30's real detectors (docs/ai/BRIEF-08a-BATCH-G.md, AI-30 detection set). Every function is a
 * pure read — no repair happens here (that's `repairGate.ts` + the tool layer's write handlers).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const STUCK_DRAFT_DAYS = 30;
const STUCK_APPROVAL_DAYS = 7;
const WORKFLOW_RUN_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const TOOL_CALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const SCHEDULE_OVERDUE_GRACE_DAYS = 1;
const FX_RATE_STALE_DAYS = 7;
const DUPLICATE_RUN_WINDOW_MS = 60 * 1000; // 1 minute

export interface StuckRecordIssue {
  model: string;
  id: string;
  detail: string;
  ageDays: number;
}

export async function findStuckDrafts(tenantId: string, now = new Date()): Promise<StuckRecordIssue[]> {
  await connectDB();
  const cutoff = new Date(now.getTime() - STUCK_DRAFT_DAYS * DAY_MS);
  const rows = await Invoice.find({ tenantId, state: DOCUMENT_STATUS.DRAFT, createdAt: { $lt: cutoff } }).select("name createdAt").lean();
  return rows.map((r) => ({ model: "Invoice", id: String(r._id), detail: `${r.name} stuck in draft`, ageDays: Math.floor((now.getTime() - new Date(r.createdAt).getTime()) / DAY_MS) }));
}

export async function findStuckPendingApprovalJournals(tenantId: string, now = new Date()): Promise<StuckRecordIssue[]> {
  await connectDB();
  const cutoff = new Date(now.getTime() - STUCK_APPROVAL_DAYS * DAY_MS);
  const rows = await JournalEntry.find({ tenantId, status: DOCUMENT_STATUS.PENDING_APPROVAL, approvedBy: { $exists: false }, createdAt: { $lt: cutoff } })
    .select("header createdAt")
    .lean();
  return rows.map((r) => ({ model: "JournalEntry", id: String(r._id), detail: `${r.header?.name ?? ""} pending approval with no approver`, ageDays: Math.floor((now.getTime() - new Date(r.createdAt).getTime()) / DAY_MS) }));
}

export async function findStuckWorkflowRuns(tenantId: string, now = new Date()): Promise<StuckRecordIssue[]> {
  await connectDB();
  const cutoff = new Date(now.getTime() - WORKFLOW_RUN_TIMEOUT_MS);
  const rows = await AiWorkflowRun.find({ tenantId, status: AI_RUN_STATUS.RUNNING, startedAt: { $lt: cutoff } }).select("workflowId startedAt").lean();
  return rows.map((r) => ({ model: "AiWorkflowRun", id: String(r._id), detail: `${r.workflowId} run past its timeout, still "running"`, ageDays: Math.floor((now.getTime() - new Date(r.startedAt).getTime()) / DAY_MS) }));
}

export async function findStuckToolCalls(tenantId: string, now = new Date()): Promise<StuckRecordIssue[]> {
  await connectDB();
  const cutoff = new Date(now.getTime() - TOOL_CALL_TIMEOUT_MS);
  const rows = await AiToolCall.find({ tenantId, status: AI_TOOL_CALL_STATUS.IN_FLIGHT, createdAt: { $lt: cutoff } }).select("toolName createdAt").lean();
  return rows.map((r) => ({ model: "AiToolCall", id: String(r._id), detail: `${r.toolName} call stuck in_flight past its timeout`, ageDays: Math.floor((now.getTime() - new Date(r.createdAt).getTime()) / DAY_MS) }));
}

export interface DeadLetterGroup {
  eventKey: string;
  count: number;
  eventIds: string[];
  sampleError: string | null;
}

export async function findDeadLetteredEvents(tenantId: string): Promise<DeadLetterGroup[]> {
  await connectDB();
  const rows = await AiEvent.find({ tenantId, status: AI_EVENT_STATUS.DEAD_LETTER }).select("eventKey lastError").lean();
  const groups = new Map<string, DeadLetterGroup>();
  for (const r of rows) {
    const g = groups.get(r.eventKey) ?? { eventKey: r.eventKey, count: 0, eventIds: [], sampleError: r.lastError ?? null };
    g.count++;
    g.eventIds.push(String(r._id));
    groups.set(r.eventKey, g);
  }
  return Array.from(groups.values());
}

export interface FailedIntegrationIssue {
  integrationId: string;
  connectorId: string;
  name: string;
  lastError: string | null;
}

export async function findFailedIntegrations(tenantId: string): Promise<FailedIntegrationIssue[]> {
  await connectDB();
  const integrations = await Integration.find({ tenantId, enabled: true }).select("connectorId name status lastError").lean();
  return integrations.filter((i) => i.status === INTEGRATION_STATUS.ERROR).map((i) => ({ integrationId: String(i._id), connectorId: i.connectorId, name: i.name, lastError: i.lastError ?? null }));
}

export interface StaleDataIssue {
  what: "tax_projection" | "fx_rate";
  key: string;
  lastUpdated: Date;
  detail: string;
}

export async function findStaleTaxProjections(tenantId: string): Promise<StaleDataIssue[]> {
  await connectDB();
  const periods = await AiTaxTransaction.distinct("periodKey", { tenantId });
  const issues: StaleDataIssue[] = [];
  for (const period of periods) {
    const latestProjection = await AiTaxTransaction.findOne({ tenantId, periodKey: period }).sort({ projectedAt: -1 }).select("projectedAt").lean();
    if (!latestProjection) continue;
    const periodStart = new Date(`${period}-01T00:00:00.000Z`);
    const periodEnd = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    const [latestInvoice] = await Invoice.find({ tenantId, invoiceDate: { $gte: periodStart, $lte: periodEnd } }).sort({ updatedAt: -1 }).select("updatedAt").limit(1).lean();
    if (latestInvoice && new Date(latestInvoice.updatedAt) > new Date(latestProjection.projectedAt)) {
      issues.push({ what: "tax_projection", key: period, lastUpdated: latestProjection.projectedAt, detail: `period ${period}'s tax projection predates newer source invoice activity` });
    }
  }
  return issues;
}

export async function findStaleFxRates(tenantId: string, now = new Date()): Promise<StaleDataIssue[]> {
  await connectDB();
  const pairs = await FxRate.aggregate([
    { $match: { tenantId } },
    { $group: { _id: { from: "$fromCurrency", to: "$toCurrency" }, latest: { $max: "$rateDate" } } },
  ]);
  const cutoff = now.getTime() - FX_RATE_STALE_DAYS * DAY_MS;
  return pairs
    .filter((p) => new Date(p.latest).getTime() < cutoff)
    .map((p) => ({ what: "fx_rate" as const, key: `${p._id.from}->${p._id.to}`, lastUpdated: p.latest, detail: `${p._id.from}->${p._id.to} FX rate is older than the ${FX_RATE_STALE_DAYS}-day policy window` }));
}

export interface OverdueScheduleIssue {
  scheduleId: string;
  createdByWorkflow: string;
  nextRunDate: Date;
  overdueDays: number;
}

export async function findOverdueSchedules(tenantId: string, now = new Date()): Promise<OverdueScheduleIssue[]> {
  await connectDB();
  const cutoff = new Date(now.getTime() - SCHEDULE_OVERDUE_GRACE_DAYS * DAY_MS);
  const rows = await AiSchedule.find({ tenantId, status: AI_SCHEDULE_STATUS.APPROVED, nextRunDate: { $lt: cutoff, $exists: true } }).select("createdByWorkflow nextRunDate").lean();
  return rows.map((r) => ({ scheduleId: String(r._id), createdByWorkflow: r.createdByWorkflow, nextRunDate: r.nextRunDate!, overdueDays: Math.floor((now.getTime() - new Date(r.nextRunDate!).getTime()) / DAY_MS) }));
}

export interface OrphanRunIssue {
  runId: string;
  workflowId: string;
  status: string;
}

/** An AiWorkflowRun that reached a terminal status but has no matching AiDecisionTrace — a
 *  real, detectable data-integrity gap. **Not auto-repaired**: there is no correct parent to
 *  relink it to (see relinkOrphan.ts's own doc comment) — reported so a human can investigate. */
export async function findOrphanWorkflowRuns(tenantId: string): Promise<OrphanRunIssue[]> {
  await connectDB();
  const terminalStatuses = [AI_RUN_STATUS.COMPLETED, AI_RUN_STATUS.ESCALATED, AI_RUN_STATUS.NO_ACTION];
  const runs = await AiWorkflowRun.find({ tenantId, status: { $in: terminalStatuses } }).select("workflowId status").lean();
  if (runs.length === 0) return [];
  const traceRunIds = new Set((await AiDecisionTrace.find({ tenantId, runId: { $in: runs.map((r) => r._id) } }).select("runId").lean()).map((t) => String(t.runId)));
  return runs.filter((r) => !traceRunIds.has(String(r._id))).map((r) => ({ runId: String(r._id), workflowId: r.workflowId, status: r.status }));
}

export interface DuplicateExecutionIssue {
  workflowId: string;
  entityId: string;
  runIds: string[];
}

export async function findDuplicateRunExecutions(tenantId: string): Promise<DuplicateExecutionIssue[]> {
  await connectDB();
  const runs = await AiWorkflowRun.find({ tenantId }).select("workflowId entityId startedAt").sort({ startedAt: 1 }).lean();
  const byKey = new Map<string, { id: string; startedAt: Date }[]>();
  for (const r of runs) {
    const key = `${r.workflowId}:${r.entityId}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push({ id: String(r._id), startedAt: new Date(r.startedAt) });
  }
  const issues: DuplicateExecutionIssue[] = [];
  for (const [key, list] of byKey.entries()) {
    if (list.length < 2) continue;
    for (let i = 1; i < list.length; i++) {
      if (list[i].startedAt.getTime() - list[i - 1].startedAt.getTime() <= DUPLICATE_RUN_WINDOW_MS) {
        const [workflowId, entityId] = key.split(":");
        issues.push({ workflowId, entityId, runIds: [list[i - 1].id, list[i].id] });
      }
    }
  }
  return issues;
}
