import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import CrmLead from "@/models/crm/Lead";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmContract from "@/models/crm/Contract";
import CrmTask from "@/models/crm/Task";
import CrmActivity from "@/models/crm/Activity";
import CrmCase from "@/models/crm/Case";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import AiSchedule, { AI_SCHEDULE_STATUS } from "@/models/ai/AiSchedule";
import { triggerAutomation } from "@/lib/crm/automationEngine";
import { sendCaseNotification } from "@/lib/crm/caseNotifications";
import { evaluateInvoiceReminders, evaluateBillReminders } from "@/lib/sales/reminderEngine";
import { runSubscriptionBilling } from "@/lib/sales/subscriptionBillingRunner";
import { processDunningRetries } from "@/lib/sales/dunningEngine";
import { generateBusinessHealthSummary } from "@/lib/ai/businessHealth";
import { bootstrapAiRuntime } from "@/lib/aiRuntime/bootstrap";
import { emitEvent, sweepPendingEvents } from "@/lib/aiRuntime/runtime/eventBus";
import { listWorkflows } from "@/lib/aiRuntime/runtime/registry";
import { computeAndPersistTenantMetrics } from "@/lib/aiRuntime/metrics/computeMetrics";
import { checkDrift } from "@/lib/aiRuntime/metrics/drift";
import { rollupAiUsageForDay } from "@/lib/platform/ai/rollup";
import { runRetentionSweep } from "@/lib/platform/audit/retention";
import AdminAccessRequest from "@/models/platform/AdminAccessRequest";
import { ADMIN_ACCESS_REQUEST_STATUS } from "@/lib/constants/statuses";
import { checkAiCostSpike } from "@/lib/platform/alerts/conditions";

export interface JobDefinition {
  jobId: string;
  description: string;
  owner: string;
  /** Matches the ORIGINAL vercel.json schedule this job had before the
   *  2026-09-05 deregistration (docs/admin/CRON_INCIDENT.md) — kept
   *  identical so restoring real Vercel Cron later (a plan upgrade) is a
   *  pure vercel.json change, nothing here needs to move. */
  scheduleLabel: string;
  intervalMinutes: number;
  handler: () => Promise<Record<string, unknown>>;
}

/**
 * Phase 10 Part 0.3: every job that used to run on a Vercel Cron schedule
 * this project's Vercel plan no longer supports (docs/admin/CRON_INCIDENT.md
 * Part 0.1 — the removal was deliberate, plan-driven, and correct). Each
 * handler below calls the SAME real library function its original cron
 * route already called — this registry does not re-implement any job's
 * logic, it only gives all twelve a place to be scheduled from without
 * Vercel Cron. The original routes (app/api/cron/**) are untouched and
 * still work if called directly (Hard Rule 1 — additive only).
 */
export const JOB_REGISTRY: JobDefinition[] = [
  {
    jobId: "crm-automations",
    description: "Process CRM time-based automation triggers (cold leads, stuck deals).",
    owner: "crm",
    scheduleLabel: "daily at 03:00 UTC",
    intervalMinutes: 24 * 60,
    handler: async () => {
      await connectDB();
      const results: string[] = [];
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const coldLeads = await CrmLead.find({
        status: { $in: ["New", "Attempting Contact"] },
        $or: [{ last_contact_date: { $lte: sevenDaysAgo } }, { last_contact_date: null }],
      }).lean();
      for (const lead of coldLeads) {
        await triggerAutomation(lead.tenantId, "no_activity", "Lead", String(lead._id), lead);
        results.push(`Triggered no_activity for Lead ${lead._id}`);
      }
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const stuckOpps = await CrmOpportunity.find({
        stage: "Negotiation",
        stage_entered_at: { $lte: fourteenDaysAgo },
      }).lean();
      for (const opp of stuckOpps) {
        await triggerAutomation(opp.tenantId, "no_activity", "Opportunity", String(opp._id), opp);
        results.push(`Triggered no_activity for Opportunity ${opp._id}`);
      }
      return { executed: results };
    },
  },
  {
    jobId: "crm-contract-check",
    description: "Create renewal tasks for contracts expiring in 90/60/30/7 days.",
    owner: "crm",
    scheduleLabel: "daily at 04:00 UTC",
    intervalMinutes: 24 * 60,
    handler: async () => {
      await connectDB();
      const now = new Date();
      const intervals = [90, 60, 30, 7];
      let tasksCreated = 0;
      for (const days of intervals) {
        const targetStart = new Date(now);
        targetStart.setDate(targetStart.getDate() + days);
        targetStart.setHours(0, 0, 0, 0);
        const targetEnd = new Date(targetStart);
        targetEnd.setHours(23, 59, 59, 999);
        const expiringContracts = await CrmContract.find({
          end_date: { $gte: targetStart, $lte: targetEnd },
          status: { $in: ["Active", "Expiring Soon"] },
          renewal_status: { $in: ["Not Started"] },
        });
        for (const contract of expiringContracts) {
          if (days <= 30 && contract.status === "Active") {
            contract.status = "Expiring Soon";
            await contract.save();
          }
          await CrmTask.create({
            tenantId: contract.tenantId,
            title: `Contract Expiring in ${days} Days: ${contract.contract_number}`,
            category: "Renew Contract",
            due_date: targetStart,
            assigned_to_id: contract.owner_id,
            linked_account_id: contract.account_id,
            linked_contract_id: contract._id,
            status: "Pending",
            priority: days <= 30 ? "High" : "Medium",
            createdBy: contract.createdBy,
          });
          await CrmActivity.create({
            tenantId: contract.tenantId,
            type: "Note",
            subject: `Automated Reminder: ${days} days until contract expiry.`,
            linked_account_id: contract.account_id,
            linked_contract_id: contract._id,
            performed_by_id: contract.owner_id,
            createdBy: contract.createdBy,
          });
          tasksCreated++;
        }
      }
      return { tasksCreated };
    },
  },
  {
    jobId: "crm-sla-check",
    description: "Escalate CRM cases that breached their SLA target.",
    owner: "crm",
    scheduleLabel: "hourly",
    intervalMinutes: 60,
    handler: async () => {
      await connectDB();
      const breachedCases = await CrmCase.find({
        sla_target_at: { $lt: new Date() },
        sla_breached: false,
        status: { $nin: ["Resolved", "Closed"] },
      });
      const updates: Promise<unknown>[] = [];
      for (const c of breachedCases) {
        c.sla_breached = true;
        const oldLevel = c.escalation_level || 0;
        c.escalation_level = Math.min(oldLevel + 1, 4);
        if (!c.escalation_history) c.escalation_history = [];
        c.escalation_history.push({
          level: c.escalation_level,
          previous_level: oldLevel,
          trigger: "SLA Breach Cron",
          user_id: c.createdBy,
          timestamp: new Date(),
        });
        await c.save();
        sendCaseNotification(c.tenantId, "Breached", c, c.createdBy.toString()).catch(() => {});
        updates.push(
          CrmActivity.create({
            tenantId: c.tenantId,
            type: "Note",
            subject: "SLA Breached & Escalated",
            description: `Case escalated to level ${c.escalation_level} due to SLA breach.`,
            linked_case_id: c._id,
            createdBy: c.createdBy,
            performed_by_id: c.createdBy,
          }),
        );
        updates.push(
          CrmAuditLog.create({
            tenantId: c.tenantId,
            user_id: c.createdBy,
            action: "updated",
            record_type: "Case",
            record_id: c._id,
            field_name: "sla_breached",
            new_value: "true",
            timestamp: new Date(),
          }),
        );
      }
      await Promise.all(updates);
      return { count: breachedCases.length };
    },
  },
  {
    jobId: "sales-reminders-evaluation",
    description: "Evaluate and send invoice/bill payment reminders for every tenant.",
    owner: "sales",
    scheduleLabel: "daily at 05:00 UTC",
    intervalMinutes: 24 * 60,
    handler: async () => {
      const startTime = Date.now();
      await connectDB();
      const orgs = await Organization.find({}, "subdomain").lean();
      const results: Array<{ tenantId: string; invoices: unknown; bills: unknown }> = [];
      for (const org of orgs) {
        if (Date.now() - startTime > 200000) break; // 3.3 mins
        const tenantId = (org as { subdomain: string }).subdomain;
        const invoices = await evaluateInvoiceReminders(tenantId);
        const bills = await evaluateBillReminders(tenantId);
        results.push({ tenantId, invoices, bills });
      }
      return { results };
    },
  },
  {
    jobId: "sales-subscriptions-billing",
    description: "Run due subscription billing cycles and dunning retries for every tenant.",
    owner: "sales",
    scheduleLabel: "daily at 06:00 UTC",
    intervalMinutes: 24 * 60,
    handler: async () => {
      const startTime = Date.now();
      await connectDB();
      const orgs = await Organization.find({}, "subdomain").lean();
      const results: Array<{ tenantId: string; billing: unknown; dunning: unknown }> = [];
      for (const org of orgs) {
        if (Date.now() - startTime > 200000) break; // 3.3 mins
        const tenantId = (org as { subdomain: string }).subdomain;
        const billing = await runSubscriptionBilling(tenantId);
        const dunning = await processDunningRetries(tenantId);
        results.push({ tenantId, billing, dunning });
      }
      return { results };
    },
  },
  {
    jobId: "business-health",
    description: "Generate the per-tenant AI business-health summary.",
    owner: "ai",
    scheduleLabel: "daily at 07:00 UTC",
    intervalMinutes: 24 * 60,
    handler: async () => {
      const startTime = Date.now();
      await connectDB();
      const orgs = await Organization.find({ isActive: true }, "subdomain").lean();
      const results = [];
      for (const org of orgs) {
        if (Date.now() - startTime > 200000) break; // 3.3 mins
        results.push(await generateBusinessHealthSummary((org as { subdomain: string }).subdomain));
      }
      return { results };
    },
  },
  {
    jobId: "ai-runtime-sweep",
    description: "Sweep pending AI-runtime events, emit hourly/period-horizon triggers, dispatch due schedules.",
    owner: "ai",
    scheduleLabel: "hourly",
    intervalMinutes: 60,
    handler: async () => {
      bootstrapAiRuntime();
      const result = await sweepPendingEvents();
      await connectDB();
      const orgs = await Organization.find({ isActive: true }, "subdomain").lean();
      const now = new Date();
      const hourKey = now.toISOString().substring(0, 13); // e.g., "2026-09-14T13"
      
      for (const org of orgs) {
        await emitEvent((org as { subdomain: string }).subdomain, "ai.sweep.hourly", {}, { dedupeKey: hourKey, dispatchInline: false });
      }
      const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const currentPeriodEnd = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59),
      ).toISOString();
      for (const org of orgs) {
        await emitEvent((org as { subdomain: string }).subdomain, "period.horizon.reached", {
          period: currentPeriod,
          periodEnd: currentPeriodEnd,
        }, { dedupeKey: hourKey, dispatchInline: false });
      }
      const dueSchedules = await AiSchedule.find({
        status: AI_SCHEDULE_STATUS.APPROVED,
        nextRunDate: { $lte: new Date() },
      })
        .select("_id tenantId")
        .lean();
      for (const schedule of dueSchedules) {
        await emitEvent(schedule.tenantId, "schedule.due", { scheduleId: String(schedule._id) }, { dispatchInline: false });
      }
      return { ...result, tenantsSwept: orgs.length, schedulesDue: dueSchedules.length };
    },
  },
  {
    jobId: "ai-metrics-snapshot",
    description: "Compute per-tenant AI workflow metrics and check for drift.",
    owner: "ai",
    scheduleLabel: "daily at 02:00 UTC",
    intervalMinutes: 24 * 60,
    handler: async () => {
      const startTime = Date.now();
      bootstrapAiRuntime();
      await connectDB();
      const orgs = await Organization.find({ isActive: true }, "subdomain").lean();
      const workflowIds = listWorkflows().map((w) => w.id);
      let tenantsProcessed = 0;
      let driftFindings = 0;
      for (const org of orgs) {
        if (Date.now() - startTime > 200000) break; // 3.3 mins
        const tenantId = (org as { subdomain: string }).subdomain;
        await computeAndPersistTenantMetrics(tenantId);
        for (const workflowId of workflowIds) {
          const findings = await checkDrift(tenantId, workflowId);
          driftFindings += findings.length;
        }
        tenantsProcessed++;
      }
      return { tenantsProcessed, workflowsPerTenant: workflowIds.length, driftFindings };
    },
  },
  {
    jobId: "platform-ai-usage-rollup",
    description: "Roll up yesterday's AiUsageRecord/AiWorkflowRun documents into AiUsageDaily/Monthly.",
    owner: "platform",
    scheduleLabel: "daily at 01:00 UTC",
    intervalMinutes: 24 * 60,
    handler: async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return await rollupAiUsageForDay(yesterday);
    },
  },
  {
    jobId: "platform-retention-sweep",
    description: "Delete audit records past their configured retention period (self-audited).",
    owner: "platform",
    scheduleLabel: "daily at 02:00 UTC",
    intervalMinutes: 24 * 60,
    handler: async () => await runRetentionSweep(),
  },
  {
    jobId: "platform-access-session-expiry",
    description: "Tidy the status field of expired organisation-access grants (reporting only — the live expiresAt check is the real boundary).",
    owner: "platform",
    scheduleLabel: "every 15 minutes",
    intervalMinutes: 15,
    handler: async () => {
      await connectDB();
      const result = await AdminAccessRequest.updateMany(
        { status: ADMIN_ACCESS_REQUEST_STATUS.APPROVED, expiresAt: { $lt: new Date() } },
        { $set: { status: ADMIN_ACCESS_REQUEST_STATUS.EXPIRED } },
      );
      return { expired: result.modifiedCount };
    },
  },
  {
    jobId: "platform-ai-cost-spike-check",
    description: "Compare today's platform-wide AI cost against the trailing average and alert on a spike.",
    owner: "platform",
    scheduleLabel: "daily at 00:30 UTC",
    intervalMinutes: 24 * 60,
    handler: async () => {
      await checkAiCostSpike();
      return {};
    },
  },
];

export function getJobDefinition(jobId: string): JobDefinition | undefined {
  return JOB_REGISTRY.find((j) => j.jobId === jobId);
}
