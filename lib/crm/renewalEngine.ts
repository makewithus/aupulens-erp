/**
 * Renewal Engine
 *
 * Scans Active contracts approaching expiry and:
 *  - Creates renewal reminder tasks (90 / 60 / 30 / 7 days before end_date)
 *  - Creates renewal activities linked to the account
 *  - Updates contract status to "Renewal Due" or "Expiring"
 *  - Marks contracts as "Expired" when past end_date
 *  - Generates immutable audit log entries
 *
 * This function is designed to be called from:
 *  1. A cron/scheduled job (e.g. /api/crm/cron/renewal-engine)
 *  2. On-demand from the contracts admin dashboard
 */

import dbConnect from "@/lib/db";
import CrmContract from "@/models/crm/Contract";
import CrmTask from "@/models/crm/Task";
import CrmActivity from "@/models/crm/Activity";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import User from "@/models/User";

export interface RenewalEngineResult {
  processed: number;
  reminders90: number;
  reminders60: number;
  reminders30: number;
  reminders7: number;
  expired: number;
  tasksCreated: number;
  activitiesCreated: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

async function createRenewalTask({
  tenantId,
  title,
  description,
  accountId,
  contractId,
  ownerId,
  daysFromNow,
  priority,
  category,
}: {
  tenantId: string;
  title: string;
  description: string;
  accountId: any;
  contractId: any;
  ownerId: any;
  daysFromNow: number;
  priority: string;
  category: string;
}) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + daysFromNow);

  return CrmTask.create({
    tenantId,
    title,
    description,
    category,
    assigned_to_id: ownerId,
    due_date: dueDate,
    priority,
    status: "Pending",
    linked_account_id: accountId,
    // Store contract ref in description as CrmTask has no linked_contract_id field
    createdBy: ownerId,
  });
}

async function createRenewalActivity({
  tenantId,
  subject,
  description,
  accountId,
  ownerId,
}: {
  tenantId: string;
  subject: string;
  description: string;
  accountId: any;
  ownerId: any;
}) {
  return CrmActivity.create({
    tenantId,
    type: "Note",
    subject,
    description,
    performed_by_id: ownerId,
    activity_date: new Date(),
    linked_account_id: accountId,
    createdBy: ownerId,
  });
}

// ─── Main Engine ─────────────────────────────────────────────────────────────

export async function runRenewalEngine(tenantId: string): Promise<RenewalEngineResult> {
  await dbConnect();

  const result: RenewalEngineResult = {
    processed: 0,
    reminders90: 0,
    reminders60: 0,
    reminders30: 0,
    reminders7: 0,
    expired: 0,
    tasksCreated: 0,
    activitiesCreated: 0,
  };

  // Fetch all active / renewal-due contracts for tenant
  const contracts = await CrmContract.find({
    tenantId,
    status: { $in: ["Active", "Renewal Due", "Expiring", "Pending Signature"] },
  }).lean();

  // Find a system user / admin to assign system-generated tasks when owner is missing
  const systemUser = await User.findOne({ tenantId, role: { $in: ["Admin", "Manager"] } });
  const systemUserId = systemUser?._id;

  for (const contract of contracts) {
    result.processed++;
    const days = daysUntil(new Date(contract.end_date));
    const ownerId = contract.owner_id || systemUserId;

    if (!ownerId) continue; // No user to assign to

    // ── Expired ───────────────────────────────────────────────
    if (days <= 0 && contract.status !== "Expired" && contract.status !== "Renewed") {
      // A renewal that was actively "In Discussion" but never closed before
      // the contract lapsed is a lost renewal — nothing else in the app
      // ever resolved this, which left renewal_status stuck at
      // "In Discussion" forever and made the renewal-success-rate metric
      // permanently 0/0. Contracts still at "Not Started" are left alone —
      // that's a distinct "nobody ever engaged" signal the Action Required
      // widget (expiredActive) depends on, not a resolved win/loss.
      const renewalOutcome = contract.renewal_status === "In Discussion" ? "Lost" : contract.renewal_status;
      await CrmContract.findByIdAndUpdate(contract._id, { status: "Expired", renewal_status: renewalOutcome });
      await CrmAuditLog.create({
        tenantId,
        user_id: systemUserId || ownerId,
        action: "status_changed",
        record_type: "Contract",
        record_id: contract._id,
        old_value: contract.status,
        new_value: "Expired",
        timestamp: new Date(),
      });
      await createRenewalActivity({
        tenantId,
        subject: `Contract Expired: ${contract.contract_number}`,
        description: `Contract ${contract.contract_number} has expired. Renewal status: ${contract.renewal_status}. Immediate action required.`,
        accountId: contract.account_id,
        ownerId,
      });
      result.expired++;
      result.activitiesCreated++;
      continue;
    }

    // ── 7-day reminder ────────────────────────────────────────
    if (days <= 7 && days > 0 && !contract.reminder_7_sent) {
      await CrmContract.findByIdAndUpdate(contract._id, {
        reminder_7_sent: true,
        status: "Expiring",
      });
      const t = await createRenewalTask({
        tenantId,
        title: `URGENT: 7-Day Renewal — ${contract.contract_number}`,
        description: `Contract ${contract.contract_number} expires in ${days} day(s). Value: $${contract.contract_value?.toLocaleString()}. Immediate renewal action required.`,
        accountId: contract.account_id,
        contractId: contract._id,
        ownerId,
        daysFromNow: 1,
        priority: "Urgent",
        category: "Renew Contract",
      });
      const a = await createRenewalActivity({
        tenantId,
        subject: `URGENT: ${contract.contract_number} expires in ${days} days`,
        description: `Automatic 7-day renewal alert triggered. Escalate to account executive immediately.`,
        accountId: contract.account_id,
        ownerId,
      });
      await CrmAuditLog.create({
        tenantId,
        user_id: systemUserId || ownerId,
        action: "status_changed",
        record_type: "Contract",
        record_id: contract._id,
        old_value: contract.status,
        new_value: `Expiring: 7-day reminder triggered. ${days} days remaining.`,
        timestamp: new Date(),
      });
      result.reminders7++;
      result.tasksCreated++;
      result.activitiesCreated++;
    }

    // ── 30-day reminder ───────────────────────────────────────
    else if (days <= 30 && days > 7 && !contract.reminder_30_sent) {
      await CrmContract.findByIdAndUpdate(contract._id, {
        reminder_30_sent: true,
        status: "Renewal Due",
      });
      await createRenewalTask({
        tenantId,
        title: `Renewal Call: ${contract.contract_number} (30 days)`,
        description: `Contract expires in ${days} days. Schedule a renewal discussion call with the customer.`,
        accountId: contract.account_id,
        contractId: contract._id,
        ownerId,
        daysFromNow: 3,
        priority: "High",
        category: "Call Back",
      });
      await createRenewalTask({
        tenantId,
        title: `Prepare Renewal Proposal: ${contract.contract_number}`,
        description: `Prepare a renewal quote/proposal for ${contract.contract_number}. Current value: $${contract.contract_value?.toLocaleString()}.`,
        accountId: contract.account_id,
        contractId: contract._id,
        ownerId,
        daysFromNow: 7,
        priority: "High",
        category: "Renew Contract",
      });
      await createRenewalActivity({
        tenantId,
        subject: `30-day renewal reminder: ${contract.contract_number}`,
        description: `Automatic 30-day renewal alert. Contract value: $${contract.contract_value?.toLocaleString()}. End date: ${new Date(contract.end_date).toLocaleDateString()}.`,
        accountId: contract.account_id,
        ownerId,
      });
      result.reminders30++;
      result.tasksCreated += 2;
      result.activitiesCreated++;
    }

    // ── 60-day reminder ───────────────────────────────────────
    else if (days <= 60 && days > 30 && !contract.reminder_60_sent) {
      await CrmContract.findByIdAndUpdate(contract._id, { reminder_60_sent: true });
      await createRenewalTask({
        tenantId,
        title: `Executive Review: ${contract.contract_number} renewal (60 days)`,
        description: `Contract ${contract.contract_number} renews in ${days} days. Schedule executive review to assess renewal strategy.`,
        accountId: contract.account_id,
        contractId: contract._id,
        ownerId,
        daysFromNow: 14,
        priority: "Medium",
        category: "Prepare Meeting",
      });
      await createRenewalActivity({
        tenantId,
        subject: `60-day renewal planning: ${contract.contract_number}`,
        description: `Automatic 60-day renewal reminder. Begin renewal strategy planning.`,
        accountId: contract.account_id,
        ownerId,
      });
      result.reminders60++;
      result.tasksCreated++;
      result.activitiesCreated++;
    }

    // ── 90-day reminder ───────────────────────────────────────
    else if (days <= 90 && days > 60 && !contract.reminder_90_sent) {
      await CrmContract.findByIdAndUpdate(contract._id, { reminder_90_sent: true });
      await createRenewalTask({
        tenantId,
        title: `Renewal Planning: ${contract.contract_number} (90 days)`,
        description: `Contract ${contract.contract_number} is 90 days from expiry. Begin renewal planning: review usage, satisfaction, and pricing.`,
        accountId: contract.account_id,
        contractId: contract._id,
        ownerId,
        daysFromNow: 30,
        priority: "Low",
        category: "Renew Contract",
      });
      await createRenewalActivity({
        tenantId,
        subject: `90-day renewal alert: ${contract.contract_number}`,
        description: `Automatic 90-day renewal reminder. Contract value: $${contract.contract_value?.toLocaleString()}.`,
        accountId: contract.account_id,
        ownerId,
      });
      result.reminders90++;
      result.tasksCreated++;
      result.activitiesCreated++;
    }
  }

  return result;
}

// ─── Renewal risk summary ─────────────────────────────────────────────────────

export async function getRenewalRiskSummary(tenantId: string) {
  await dbConnect();
  const now = new Date();

  const [
    expiring7,
    expiring30,
    expiring60,
    expiring90,
    expiredActive,
    renewalPipeline,
  ] = await Promise.all([
    CrmContract.countDocuments({
      tenantId,
      status: { $in: ["Active", "Renewal Due", "Expiring"] },
      end_date: { $lte: addDays(now, 7) },
    }),
    CrmContract.countDocuments({
      tenantId,
      status: { $in: ["Active", "Renewal Due", "Expiring"] },
      end_date: { $lte: addDays(now, 30) },
    }),
    CrmContract.countDocuments({
      tenantId,
      status: { $in: ["Active", "Renewal Due", "Expiring"] },
      end_date: { $lte: addDays(now, 60) },
    }),
    CrmContract.countDocuments({
      tenantId,
      status: { $in: ["Active", "Renewal Due", "Expiring"] },
      end_date: { $lte: addDays(now, 90) },
    }),
    CrmContract.countDocuments({ tenantId, status: "Expired", renewal_status: "Not Started" }),
    CrmContract.aggregate([
      {
        $match: {
          tenantId,
          status: { $in: ["Active", "Renewal Due", "Expiring"] },
          end_date: { $lte: addDays(now, 90) },
        },
      },
      { $group: { _id: null, total: { $sum: "$contract_value" } } },
    ]),
  ]);

  return {
    expiring7,
    expiring30,
    expiring60,
    expiring90,
    expiredActive,
    renewalPipelineValue90Days: renewalPipeline[0]?.total || 0,
  };
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
