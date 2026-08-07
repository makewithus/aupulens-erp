/**
 * Generalized AI Command Center action registry.
 *
 * Mirrors lib/accounting/aiActions.ts (the Finance confirm gate) but for
 * cross-module actions. Every mutation the Command Center can perform is
 * declared here with THREE things:
 *   - `destructive`: whether it deletes / irreversibly changes data (drives the
 *     louder confirm UI),
 *   - `buildPreview()`: read-only — validates the target exists and returns a
 *     human-readable description of what WOULD happen. NEVER mutates.
 *   - `execute()`: performs the mutation AND writes an audit-log record.
 *
 * The two-phase split is the whole point: `POST /api/ai/command/actions` only
 * ever calls buildPreview (so a proposal is inert), and the mutation happens
 * exclusively inside the separate confirm route after an explicit human click.
 */
import connectDB from "@/lib/db";
import CrmLead from "@/models/crm/Lead";
import CrmTask from "@/models/crm/Task";
import CrmAuditLog from "@/models/crm/CrmAuditLog";

export class CommandActionError extends Error {}

const LEAD_STATUSES = ["New", "Attempting Contact", "Connected", "Qualified", "Nurture", "Disqualified", "Converted"];

/** The classifier phrases the task text a few different ways — accept them all. */
function taskTitleFrom(params: any): string {
  const t = params?.title || params?.taskDescription || params?.description || params?.task || params?.subject;
  return typeof t === "string" ? t.trim() : "";
}

/** Accept a numeric dueInDays; map common relative phrases; default to 3. */
function dueInDaysFrom(params: any): number {
  if (Number(params?.dueInDays) > 0) return Number(params.dueInDays);
  const phrase = String(params?.dueDate ?? params?.due ?? "").toLowerCase();
  if (/today/.test(phrase)) return 1;
  if (/tomorrow/.test(phrase)) return 1;
  if (/week/.test(phrase)) return 7;
  return 3;
}

export interface CommandActionDef {
  module: string;
  destructive: boolean;
  buildPreview: (params: any, tenantId: string) => Promise<{ summary: string; preview: Record<string, unknown> }>;
  execute: (params: any, tenantId: string, userId: string) => Promise<{ resultRef: string; result: unknown }>;
}

export const COMMAND_ACTIONS: Record<string, CommandActionDef> = {
  // ── CRM: create a follow-up task (non-destructive) ──────────────────────────
  create_task: {
    module: "crm",
    destructive: false,
    async buildPreview(params, _tenantId) {
      const title = taskTitleFrom(params);
      if (!title) throw new CommandActionError("A task title is required.");
      const dueInDays = dueInDaysFrom(params);
      return {
        summary: `Create a CRM task "${title}" due in ${dueInDays} day(s), assigned to you.`,
        preview: { title, category: params.category ?? "Follow Up", priority: params.priority ?? "Medium", dueInDays },
      };
    },
    async execute(params, tenantId, userId) {
      await connectDB();
      const title = taskTitleFrom(params);
      const dueInDays = dueInDaysFrom(params);
      const doc = await CrmTask.create({
        tenantId,
        title,
        category: params.category,
        priority: params.priority ?? "Medium",
        due_date: new Date(Date.now() + dueInDays * 86_400_000),
        assigned_to_id: userId,
        createdBy: userId,
        linked_lead_id: params.leadId || undefined,
      });
      await CrmAuditLog.create({ tenantId, user_id: userId, action: "created", record_type: "Task", record_id: doc._id, new_value: title });
      return { resultRef: String(doc._id), result: doc };
    },
  },

  // ── CRM: change a lead's status (mutation, non-destructive) ──────────────────
  update_lead_status: {
    module: "crm",
    destructive: false,
    async buildPreview(params, tenantId) {
      await connectDB();
      if (!LEAD_STATUSES.includes(params?.status)) throw new CommandActionError(`Invalid lead status. Must be one of: ${LEAD_STATUSES.join(", ")}.`);
      const lead = await CrmLead.findOne({ _id: params.leadId, tenantId }).select("lead_name status").lean<{ lead_name: string; status: string }>();
      if (!lead) throw new CommandActionError("Lead not found.");
      return {
        summary: `Change lead "${lead.lead_name}" status from "${lead.status}" to "${params.status}".`,
        preview: { leadName: lead.lead_name, from: lead.status, to: params.status },
      };
    },
    async execute(params, tenantId, userId) {
      await connectDB();
      const lead = await CrmLead.findOne({ _id: params.leadId, tenantId });
      if (!lead) throw new CommandActionError("Lead not found.");
      const from = lead.status;
      lead.status = params.status;
      await lead.save();
      await CrmAuditLog.create({ tenantId, user_id: userId, action: "status_changed", record_type: "Lead", record_id: lead._id, old_value: from, new_value: params.status });
      return { resultRef: String(lead._id), result: { from, to: params.status } };
    },
  },

  // ── CRM: DELETE a lead (DESTRUCTIVE — the confirm-gate demo) ─────────────────
  delete_lead: {
    module: "crm",
    destructive: true,
    async buildPreview(params, tenantId) {
      await connectDB();
      const lead = await CrmLead.findOne({ _id: params.leadId, tenantId }).select("lead_name company_name status").lean<{ lead_name: string; company_name?: string; status: string }>();
      if (!lead) throw new CommandActionError("Lead not found.");
      return {
        summary: `PERMANENTLY DELETE lead "${lead.lead_name}"${lead.company_name ? ` (${lead.company_name})` : ""}. This cannot be undone.`,
        preview: { leadName: lead.lead_name, company: lead.company_name, status: lead.status, irreversible: true },
      };
    },
    async execute(params, tenantId, userId) {
      await connectDB();
      const lead = await CrmLead.findOne({ _id: params.leadId, tenantId }).select("lead_name");
      if (!lead) throw new CommandActionError("Lead not found.");
      const name = lead.lead_name;
      // Audit BEFORE delete so the record_id is captured even though the row goes.
      await CrmAuditLog.create({ tenantId, user_id: userId, action: "deleted", record_type: "Lead", record_id: lead._id, old_value: name });
      await CrmLead.deleteOne({ _id: params.leadId, tenantId });
      return { resultRef: String(params.leadId), result: { deleted: true, leadName: name } };
    },
  },
};

export const COMMAND_ACTION_TYPES = Object.keys(COMMAND_ACTIONS);

export function isCommandAction(actionType: string): boolean {
  return Object.prototype.hasOwnProperty.call(COMMAND_ACTIONS, actionType);
}
