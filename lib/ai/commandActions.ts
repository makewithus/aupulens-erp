import { validateQuoteInput } from "@/lib/sales/quoteValidation";
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
import Customer from "@/models/sales/Customer";
import Employee from "@/models/hr/Employee";
import "@/models/hr/Department";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import User from "@/models/auth/User";
import { getUserRoleOption, getUserRoleLabel, VALID_USER_ROLES, isRoleEnabledForModules } from "@/lib/admin/roleModules";
import { resolveEntitlements } from "@/lib/platform/entitlements/resolve";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import SalesQuotation from "@/models/sales/SalesQuotation";
import SaleOrder from "@/models/sales/SaleOrder";
import Subscription from "@/models/sales/Subscription";
import Payment from "@/models/sales/Payment";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import { generateInvoiceNumber } from "@/lib/sales/invoiceNumbering";
import { SALES_INVOICE_STATUS, DOCUMENT_STATUS } from "@/lib/constants/statuses";

export class CommandActionError extends Error {}

const LEAD_STATUSES = ["New", "Attempting Contact", "Connected", "Qualified", "Nurture", "Disqualified", "Converted"];
const LEAD_SOURCES = ["Organic Search", "Paid Ads", "Referral", "Event", "Social Media", "Direct Website", "Outbound Calling", "Partner Channel", "Repeat Customer", "Website Form", "WhatsApp", "Email Import", "CSV Import", "Chatbot", "Manual Entry", "Other"];
// Chart-of-accounts categories the AI may create, mapped to the model's
// account_type + internal_group so a created ledger is immediately usable.
const LEDGER_TYPES: Record<string, { account_type: string; internal_group: string }> = {
  asset: { account_type: "asset_current", internal_group: "asset" },
  bank: { account_type: "asset_cash", internal_group: "asset" },
  cash: { account_type: "asset_cash", internal_group: "asset" },
  receivable: { account_type: "asset_receivable", internal_group: "asset" },
  "fixed asset": { account_type: "asset_fixed", internal_group: "asset" },
  liability: { account_type: "liability_current", internal_group: "liability" },
  payable: { account_type: "liability_payable", internal_group: "liability" },
  equity: { account_type: "equity", internal_group: "equity" },
  income: { account_type: "income", internal_group: "income" },
  revenue: { account_type: "income", internal_group: "income" },
  expense: { account_type: "expense", internal_group: "expense" },
};
function resolveLedgerType(raw: any): { account_type: string; internal_group: string } {
  const key = String(raw ?? "").toLowerCase().trim();
  const resolved = LEDGER_TYPES[key];
  if (!resolved) throw new CommandActionError(`Unsupported ledger type "${key || "(empty)"}". Choose one of: ${Object.keys(LEDGER_TYPES).join(", ")}.`);
  return resolved;
}

async function resolveCustomerRecord(params: any, tenantId: string) {
  await connectDB();
  if (params?.customerId) {
    const customer = await Customer.findOne({ _id: params.customerId, tenantId }).lean();
    if (!customer) throw new CommandActionError("Customer not found.");
    return customer as any;
  }
  const name = String(params?.customerName || params?.name || params?.targetName || "").trim();
  if (!name) throw new CommandActionError("Tell me the exact customer name to update or delete.");
  const exact = new RegExp(`^${escapeRegex(name)}$`, "i");
  const matches = await Customer.find({ tenantId, $or: [{ "header.name": exact }, { "header.displayName": exact }, { "header.companyName": exact }] }).limit(2).lean();
  if (!matches.length) throw new CommandActionError(`No customer named "${name}" was found in this workspace.`);
  if (matches.length > 1) throw new CommandActionError(`More than one customer matches "${name}". Provide a more specific name.`);
  return matches[0] as any;
}

async function assertCustomerHasNoBusinessRecords(customerId: unknown, tenantId: string) {
  const [invoice, quotation, order, subscription, payment] = await Promise.all([
    SalesInvoice.exists({ tenantId, customerId }),
    SalesQuotation.exists({ tenantId, customerId }),
    SaleOrder.exists({ tenantId, "header.partnerId": customerId }),
    Subscription.exists({ tenantId, customerId }),
    Payment.exists({ tenantId, customerId }),
  ]);
  if (invoice || quotation || order || subscription || payment) {
    throw new CommandActionError("This customer has linked invoices, quotations, orders, subscriptions, or payments, so it cannot be deleted. Archive or retain the record to preserve financial history.");
  }
}

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

  // ── CRM: create a lead (non-destructive) ────────────────────────────────────
  create_lead: {
    module: "crm",
    destructive: false,
    async buildPreview(params) {
      const name = String(params?.lead_name || params?.leadName || params?.name || "").trim();
      if (!name) throw new CommandActionError("A lead name is required (the person or company to add).");
      return {
        summary: `Create a new CRM lead "${name}"${params?.company_name || params?.company ? ` at ${params.company_name || params.company}` : ""}, assigned to you.`,
        preview: { lead_name: name, company_name: params?.company_name || params?.company, email: params?.email, phone: params?.phone, source: LEAD_SOURCES.includes(params?.source) ? params.source : "Manual Entry" },
      };
    },
    async execute(params, tenantId, userId) {
      await connectDB();
      const name = String(params?.lead_name || params?.leadName || params?.name || "").trim();
      if (!name) throw new CommandActionError("A lead name is required.");
      const doc = await CrmLead.create({
        tenantId,
        lead_name: name,
        company_name: params?.company_name || params?.company || undefined,
        email: params?.email || undefined,
        phone: params?.phone || undefined,
        source: LEAD_SOURCES.includes(params?.source) ? params.source : "Manual Entry",
        status: "New",
        owner_id: userId,
        createdBy: userId,
        notes: params?.notes || undefined,
      });
      await CrmAuditLog.create({ tenantId, user_id: userId, action: "created", record_type: "Lead", record_id: doc._id, new_value: name });
      return { resultRef: String(doc._id), result: doc };
    },
  },

  // ── Sales/CRM: create a customer (non-destructive) ──────────────────────────
  create_customer: {
    module: "sales",
    destructive: false,
    async buildPreview(params, tenantId) {
      await connectDB();
      const name = String(params?.name || params?.customerName || params?.companyName || "").trim();
      if (!name) throw new CommandActionError("A customer name is required.");
      const duplicate = await Customer.findOne({ tenantId, "header.name": new RegExp(`^${escapeRegex(name)}$`, "i") }).lean();
      if (duplicate) throw new CommandActionError(`A customer named "${name}" already exists. I won't prepare a duplicate.`);
      const email = String(params?.email || "").trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CommandActionError("Enter a valid customer email address.");
      const phone = String(params?.phone || params?.mobile || "").trim();
      if (phone && !/^\+?[0-9() .-]{7,20}$/.test(phone)) throw new CommandActionError("Enter a valid customer phone number.");
      const isCompany = params?.is_company ?? Boolean(params?.companyName && !params?.firstName);
      return {
        summary: `Create a new ${isCompany ? "company" : "individual"} customer "${name}"${params?.email ? ` (${params.email})` : ""}.`,
        preview: { name, is_company: !!isCompany, email: params?.email, phone: params?.phone, gstin: params?.gstin, currency: params?.currency || "INR" },
      };
    },
    async execute(params, tenantId, userId) {
      await connectDB();
      const name = String(params?.name || params?.customerName || params?.companyName || "").trim();
      if (!name) throw new CommandActionError("A customer name is required.");
      const duplicate = await Customer.find({ tenantId, "header.name": new RegExp(`^${escapeRegex(name)}$`, "i") }).limit(1).lean();
      if (duplicate.length) throw new CommandActionError(`A customer named "${name}" already exists. I haven't created a duplicate.`);
      const isCompany = params?.is_company ?? Boolean(params?.companyName && !params?.firstName);
      const doc = await Customer.create({
        tenantId,
        createdBy: userId,
        header: {
          name,
          is_company: !!isCompany,
          displayName: name,
          companyName: params?.companyName || (isCompany ? name : undefined),
          firstName: params?.firstName || undefined,
          lastName: params?.lastName || undefined,
        },
        contact_details: {
          email: params?.email || undefined,
          phone: params?.phone || undefined,
          mobile: params?.mobile || undefined,
        },
        gstin: params?.gstin || undefined,
        pan: params?.pan || undefined,
        currency: params?.currency || "INR",
      });
      await CrmAuditLog.create({ tenantId, user_id: userId, action: "created", record_type: "Customer", record_id: doc._id, new_value: name });
      return { resultRef: String(doc._id), result: doc };
    },
  },

  update_customer: {
    module: "sales",
    destructive: false,
    async buildPreview(params, tenantId) {
      const customer = await resolveCustomerRecord(params, tenantId);
      const newName = String(params?.newName || params?.new_name || params?.updatedName || "").trim();
      if (!newName) throw new CommandActionError("Tell me the new customer name.");
      if (newName.length > 200) throw new CommandActionError("Customer names must be 200 characters or fewer.");
      const duplicate = await Customer.findOne({ tenantId, _id: { $ne: customer._id }, "header.name": new RegExp(`^${escapeRegex(newName)}$`, "i") }).lean();
      if (duplicate) throw new CommandActionError(`Another customer is already named "${newName}".`);
      return { summary: `Rename customer "${customer.header?.name}" to "${newName}".`, preview: { customerId: String(customer._id), from: customer.header?.name, to: newName } };
    },
    async execute(params, tenantId, userId) {
      const customer = await resolveCustomerRecord(params, tenantId);
      const newName = String(params?.newName || params?.new_name || params?.updatedName || "").trim();
      if (!newName || newName.length > 200) throw new CommandActionError("A valid new customer name (1–200 characters) is required.");
      const duplicate = await Customer.findOne({ tenantId, _id: { $ne: customer._id }, "header.name": new RegExp(`^${escapeRegex(newName)}$`, "i") }).lean();
      if (duplicate) throw new CommandActionError(`Another customer is already named "${newName}".`);
      const previousName = String(customer.header?.name || "");
      const update: Record<string, string> = { "header.name": newName, "header.displayName": newName };
      if (customer.header?.companyName === previousName) update["header.companyName"] = newName;
      const saved = await Customer.findOneAndUpdate({ _id: customer._id, tenantId }, { $set: update }, { new: true, runValidators: true });
      if (!saved) throw new CommandActionError("Customer was changed or removed before the rename could be completed. Please try again.");
      await CrmAuditLog.create({ tenantId, user_id: userId, action: "updated", record_type: "Customer", record_id: customer._id, field_name: "name", old_value: previousName, new_value: newName });
      return { resultRef: String(customer._id), result: { id: String(customer._id), oldName: previousName, name: newName } };
    },
  },

  delete_customer: {
    module: "sales",
    destructive: true,
    async buildPreview(params, tenantId) {
      const customer = await resolveCustomerRecord(params, tenantId);
      await assertCustomerHasNoBusinessRecords(customer._id, tenantId);
      return { summary: `Permanently delete customer "${customer.header?.name}". This cannot be undone.`, preview: { customerId: String(customer._id), name: customer.header?.name, irreversible: true } };
    },
    async execute(params, tenantId, userId) {
      const customer = await resolveCustomerRecord(params, tenantId);
      await assertCustomerHasNoBusinessRecords(customer._id, tenantId);
      const deleted = await Customer.findOneAndDelete({ _id: customer._id, tenantId });
      if (!deleted) throw new CommandActionError("Customer was changed or removed before deletion. Please try again.");
      await CrmAuditLog.create({ tenantId, user_id: userId, action: "deleted", record_type: "Customer", record_id: customer._id, old_value: customer.header?.name });
      return { resultRef: String(customer._id), result: { deleted: true, name: customer.header?.name } };
    },
  },

  // ── HR: create an employee (non-destructive) ────────────────────────────────
  create_employee: {
    module: "hr",
    destructive: false,
    async buildPreview(params) {
      const firstName = String(params?.firstName || params?.first_name || "").trim();
      const lastName = String(params?.lastName || params?.last_name || "").trim();
      const email = String(params?.email || "").trim();
      const phone = String(params?.phone || params?.mobile || "").trim();
      if (!firstName || !lastName) throw new CommandActionError("Both first name and last name are required for an employee.");
      if (!email) throw new CommandActionError("An email is required for an employee.");
      if (!phone) throw new CommandActionError("A phone number is required for an employee.");
      return {
        summary: `Create a new employee "${firstName} ${lastName}" (${email})${params?.designation ? `, ${params.designation}` : ""}.`,
        preview: { firstName, lastName, email, phone, designation: params?.designation, employmentType: params?.employmentType || "full-time" },
      };
    },
    async execute(params, tenantId, userId) {
      await connectDB();
      const firstName = String(params?.firstName || params?.first_name || "").trim();
      const lastName = String(params?.lastName || params?.last_name || "").trim();
      const email = String(params?.email || "").trim();
      const phone = String(params?.phone || params?.mobile || "").trim();
      if (!firstName || !lastName || !email || !phone) throw new CommandActionError("First name, last name, email and phone are all required.");
      // Auto-generate a unique-ish employee code (EMP-<count+1>) if not supplied.
      const count = await Employee.countDocuments({ tenantId });
      const employeeCode = String(params?.employeeCode || `EMP-${String(count + 1).padStart(4, "0")}`);
      const doc = await Employee.create({
        tenantId,
        employeeCode,
        firstName,
        lastName,
        email,
        phone,
        designation: params?.designation || undefined,
        employmentType: params?.employmentType || "full-time",
        dateOfJoining: params?.dateOfJoining ? new Date(params.dateOfJoining) : new Date(),
      });
      await CrmAuditLog.create({ tenantId, user_id: userId, action: "created", record_type: "Employee", record_id: doc._id, new_value: `${firstName} ${lastName}` });
      return { resultRef: String(doc._id), result: doc };
    },
  },

  // ── Finance: create a ledger / chart-of-accounts account (non-destructive) ──
  create_ledger: {
    module: "finance",
    destructive: false,
    async buildPreview(params) {
      const name = String(params?.name || params?.ledgerName || params?.accountName || "").trim();
      if (!name) throw new CommandActionError("A ledger name is required.");
      const { account_type, internal_group } = resolveLedgerType(params?.type || params?.category || params?.internal_group);
      return {
        summary: `Create a new ${internal_group} ledger "${name}" (type: ${account_type}).`,
        preview: { name, account_type, internal_group, code: params?.code },
      };
    },
    async execute(params, tenantId, userId) {
      await connectDB();
      const name = String(params?.name || params?.ledgerName || params?.accountName || "").trim();
      if (!name) throw new CommandActionError("A ledger name is required.");
      const { account_type, internal_group } = resolveLedgerType(params?.type || params?.category || params?.internal_group);
      const count = await Account.countDocuments({ tenantId });
      const code = String(params?.code || `${1000 + count + 1}`);
      const doc = await Account.create({
        tenantId,
        name,
        accountName: name,
        code,
        accountCode: code,
        account_type,
        internal_group,
        currency: params?.currency || "INR",
        isActive: true,
        status: "active",
        createdBy: userId,
      });
      await CrmAuditLog.create({ tenantId, user_id: userId, action: "created", record_type: "Account", record_id: doc._id, new_value: name });
      return { resultRef: String(doc._id), result: doc };
    },
  },

  // ── Finance: DELETE a ledger (DESTRUCTIVE — guarded) ────────────────────────
  delete_ledger: {
    module: "finance",
    destructive: true,
    async buildPreview(params, tenantId) {
      await connectDB();
      const acc = await resolveAccount(params, tenantId);
      if ((acc as any).isSystemSeeded) throw new CommandActionError(`"${(acc as any).name || (acc as any).accountName}" is a system ledger and cannot be deleted.`);
      if ((acc as any).isLocked) throw new CommandActionError(`"${(acc as any).name || (acc as any).accountName}" is locked and cannot be deleted.`);
      const inUse = await JournalEntry.exists({ tenantId, "lineIds.accountId": (acc as any)._id });
      if (inUse) throw new CommandActionError(`This ledger has posted transactions and cannot be deleted. Deactivate it instead.`);
      const label = (acc as any).name || (acc as any).accountName;
      return {
        summary: `PERMANENTLY DELETE the ledger "${label}". This cannot be undone.`,
        preview: { name: label, code: (acc as any).code || (acc as any).accountCode, irreversible: true },
      };
    },
    async execute(params, tenantId, userId) {
      await connectDB();
      const acc = await resolveAccount(params, tenantId);
      if ((acc as any).isSystemSeeded || (acc as any).isLocked) throw new CommandActionError("This ledger cannot be deleted.");
      const inUse = await JournalEntry.exists({ tenantId, "lineIds.accountId": (acc as any)._id });
      if (inUse) throw new CommandActionError("This ledger has posted transactions and cannot be deleted.");
      const label = (acc as any).name || (acc as any).accountName;
      await CrmAuditLog.create({ tenantId, user_id: userId, action: "deleted", record_type: "Account", record_id: (acc as any)._id, old_value: label });
      await Account.deleteOne({ _id: (acc as any)._id, tenantId });
      return { resultRef: String((acc as any)._id), result: { deleted: true, name: label } };
    },
  },

  // ── Sales/Finance: generate a customer invoice (created as DRAFT) ───────────
  // Reuses the SAME totals + numbering engine as the manual invoice form, so GST
  // and amounts are identical to a hand-entered invoice. Draft = nothing posts
  // to the ledger until the user reviews and saves it in the invoice screen.
  create_invoice: {
    module: "sales",
    destructive: false,
    async buildPreview(params, tenantId) {
      await connectDB();
      const customer = await resolveCustomer(params, tenantId);
      const lineItems = normalizeInvoiceLines(params);
      if (lineItems.length === 0) throw new CommandActionError("At least one line item is required (e.g. an item name, quantity and price).");
      const totals = computeInvoiceTotals({
        lineItems, itemLevelDiscountPercent: 0, additionalCharges: [],
        extraDiscount: 0, extraDiscountMode: "amount", roundOff: false,
        tdsRate: 0, tcsRate: 0,
      });
      return {
        summary: `Create a DRAFT invoice for "${(customer as any).__name}" with ${lineItems.length} line item(s), total ₹${totals.totalAmount.toLocaleString("en-IN")}. It will be saved as a draft for you to review.`,
        preview: {
          customer: (customer as any).__name,
          lineItems: lineItems.map((l) => ({ name: l.name, qty: l.qty, unitPrice: l.unitPrice, taxRate: l.taxRate })),
          taxableAmount: totals.taxableAmount,
          totalAmount: totals.totalAmount,
          status: "draft",
        },
      };
    },
    async execute(params, tenantId, userId) {
      await connectDB();
      const customer = await resolveCustomer(params, tenantId);
      const lineItems = normalizeInvoiceLines(params);
      if (lineItems.length === 0) throw new CommandActionError("At least one line item is required.");
      const totals = computeInvoiceTotals({
        lineItems, itemLevelDiscountPercent: 0, additionalCharges: [],
        extraDiscount: 0, extraDiscountMode: "amount", roundOff: false,
        tdsRate: 0, tcsRate: 0,
      });
      const { number } = await generateInvoiceNumber(tenantId);
      const lineItemsWithTotals = lineItems.map((li, i) => ({ ...li, lineTotal: totals.computedLines[i]?.lineTotal ?? 0 }));
      const doc = new SalesInvoice({
        tenantId,
        number,
        customerId: (customer as any)._id,
        invoiceDate: new Date(),
        dueDate: params?.dueDate ? new Date(params.dueDate) : new Date(),
        reference: params?.reference || undefined,
        lineItems: lineItemsWithTotals,
        additionalCharges: [],
        taxableAmount: totals.taxableAmount,
        totalDiscount: totals.totalDiscount,
        totalAmount: totals.totalAmount,
        taxes: { tds: 0, tcs: 0, gstBreakup: totals.gstBreakup },
        notes: params?.notes || undefined,
        status: SALES_INVOICE_STATUS.DRAFT,
        createdBy: userId,
      });
      await doc.save();
      await CrmAuditLog.create({ tenantId, user_id: userId, action: "created", record_type: "SalesInvoice", record_id: doc._id, new_value: `${number} (${(customer as any).__name})` });
      return { resultRef: String(doc._id), result: doc };
    },
  },

  // ── Finance: draft a balanced journal entry / financial record ──────────────
  // The AI proposes a balanced set of debit/credit lines against REAL ledgers;
  // the entry is created as a DRAFT for the user to review and post from the
  // Finance module (nothing hits the general ledger until they post it).
  create_journal_entry: {
    module: "finance",
    destructive: false,
    async buildPreview(params, tenantId) {
      await connectDB();
      const { lines, totalDebit } = await resolveJournalLines(params, tenantId);
      return {
        summary: `Create a DRAFT journal entry "${journalNarration(params)}" with ${lines.length} lines (₹${totalDebit.toLocaleString("en-IN")} balanced). Review and post it from Finance.`,
        preview: {
          narration: journalNarration(params),
          journalType: journalTypeFrom(params),
          lines: lines.map((l) => ({ account: l.__accountName, debit: l.debit, credit: l.credit, label: l.label })),
          totalDebit,
          status: "draft",
        },
      };
    },
    async execute(params, tenantId, userId) {
      await connectDB();
      const { lines, totalDebit } = await resolveJournalLines(params, tenantId);
      // header.name is unique per tenant — build a collision-safe AI name.
      const name = `AI-JV-${Date.now()}`;
      const doc = await JournalEntry.create({
        tenantId,
        header: { name, date: params?.date ? new Date(params.date) : new Date(), ref: journalNarration(params), journalType: journalTypeFrom(params) },
        lineIds: lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, label: l.label })),
        totals: { currencyId: "INR", amountUntaxed: totalDebit, amountTax: 0, amountTotal: totalDebit },
        status: DOCUMENT_STATUS.DRAFT,
        createdBy: userId,
      });
      await CrmAuditLog.create({ tenantId, user_id: userId, action: "created", record_type: "JournalEntry", record_id: doc._id, new_value: journalNarration(params) });
      return { resultRef: String(doc._id), result: doc };
    },
  },

  // ── Admin: change an employee or user's role (mutation, requires admin confirmation) ─────
  update_user_role: {
    module: "admin",
    destructive: true,
    async buildPreview(params, tenantId) {
      await connectDB();
      const userName = String(params?.userName || params?.name || params?.user || "").trim();
      const roleRaw = String(params?.role || params?.newRole || params?.targetRole || "").trim();

      if (!userName && !params?.userId && !params?.employeeId) {
        throw new CommandActionError("An employee name, employee ID, or user ID is required.");
      }
      if (!roleRaw) throw new CommandActionError("A new role is required (e.g. admin, sales-manager, hr-manager).");

      let employee: any = null;
      let user: any = null;

      // 1. If explicit employeeId or userId is provided
      if (params?.employeeId) {
        employee = await Employee.findOne({ _id: params.employeeId, tenantId }).populate("departmentId", "name code").lean();
        if (!employee) throw new CommandActionError("Employee not found.");
      } else if (params?.userId) {
        user = await User.findOne({ _id: params.userId, tenantId }).lean();
        if (!user) throw new CommandActionError("User not found.");
        // Try finding linked employee
        employee = await Employee.findOne({ $or: [{ userId: user._id }, { email: user.email.toLowerCase() }], tenantId }).populate("departmentId", "name code").lean();
      }

      // 2. Lookup by employee name/code first (since role changes are requested for employees)
      if (!employee && !user) {
        const rxExact = new RegExp(`^${escapeRegex(userName)}$`, "i");
        let employeeMatches = await Employee.find({
          tenantId,
          $or: [{ firstName: rxExact }, { lastName: rxExact }, { employeeCode: rxExact }, { email: rxExact }],
        }).populate("departmentId", "name code").lean();

        if (employeeMatches.length === 0) {
          const allEmployees = await Employee.find({ tenantId }).populate("departmentId", "name code").lean();
          employeeMatches = allEmployees.filter((emp: any) => {
            const fullName = `${emp.firstName || ""} ${emp.lastName || ""}`.trim().toLowerCase();
            const target = userName.toLowerCase();
            return fullName === target || fullName.includes(target) || (emp.firstName || "").toLowerCase() === target;
          });
        }

        if (employeeMatches.length > 1) {
          const disambig = employeeMatches
            .map((e: any) => `"${e.firstName} ${e.lastName}" (Code: ${e.employeeCode}, Current: ${e.designation || "None"}, Dept: ${e.departmentId?.name || "General"})`)
            .join("; ");
          throw new CommandActionError(`Multiple employees match "${userName}": ${disambig}. Please specify the employee code or full name to disambiguate.`);
        }

        if (employeeMatches.length === 1) {
          employee = employeeMatches[0];
          // Check for linked user
          if (employee.userId) {
            user = await User.findOne({ _id: employee.userId, tenantId }).lean();
          } else if (employee.email) {
            user = await User.findOne({ email: employee.email.toLowerCase(), tenantId }).lean();
          }
        }
      }

      // 3. Fallback to User collection if no Employee was found
      if (!employee && !user) {
        const rxExact = new RegExp(`^${escapeRegex(userName)}$`, "i");
        let matches = await User.find({
          tenantId,
          $or: [{ name: rxExact }, { email: rxExact }],
        }).lean();

        if (matches.length === 0) {
          const rxLoose = new RegExp(escapeRegex(userName), "i");
          matches = await User.find({ tenantId, name: rxLoose }).limit(5).lean();
        }

        if (matches.length === 0) {
          throw new CommandActionError(`Employee or user "${userName}" was not found in your accessible records.`);
        }
        if (matches.length > 1) {
          const disambig = matches.map((u: any) => `"${u.name}" (${u.email})`).join(", ");
          throw new CommandActionError(`Multiple users match "${userName}": ${disambig}. Please specify the full name or email.`);
        }
        user = matches[0];
      }

      // Target employee/user details
      const targetName = employee ? `${employee.firstName} ${employee.lastName}`.trim() : user.name;
      const targetEmail = employee ? employee.email : user.email;
      const employeeId = employee ? String(employee._id) : undefined;
      const employeeCode = employee ? employee.employeeCode : undefined;
      const departmentName = employee?.departmentId?.name || (user?.department || "General");

      // Current role / designation
      const currentRoleKey = employee?.designation || user?.userRole || user?.role || "Employee";
      const currentLabel = getUserRoleLabel(currentRoleKey);

      // Normalize role string: "sales manager" -> "sales-manager", "Sales Executive" -> "sales-executive", "Admin" -> "admin"
      const normalizedKey = roleRaw.toLowerCase().replace(/\s+/g, "-");
      const roleOption = getUserRoleOption(normalizedKey) || getUserRoleOption(roleRaw.toLowerCase());
      if (!roleOption || !VALID_USER_ROLES.includes(roleOption.value)) {
        throw new CommandActionError(`"${roleRaw}" is not a recognized role in the organization. Valid roles include: Admin, Sales Manager, HR Manager, Finance Manager, Inventory Manager, Production Manager, CRM Manager, etc.`);
      }

      try {
        const entitlements = await resolveEntitlements(tenantId);
        if (entitlements && entitlements.source !== "permissive_default") {
          if (!isRoleEnabledForModules(roleOption.value, entitlements.modules)) {
            throw new CommandActionError(`The ${roleOption.label} role is not available on this organization's current plan/modules.`);
          }
        }
      } catch {
        // Entitlements check falls through if resolveEntitlements is unavailable
      }

      if (currentRoleKey.toLowerCase() === roleOption.value.toLowerCase() || currentRoleKey.toLowerCase() === roleOption.label.toLowerCase()) {
        throw new CommandActionError(`"${targetName}" already has the role ${roleOption.label}.`);
      }

      const hasUserAccount = Boolean(user);
      const securityImpact = roleOption.value === "admin"
        ? "Grants full administrative access across all organizational modules and settings."
        : `Sets organization role to ${roleOption.label} (${roleOption.module} module access).`;

      return {
        summary: `Change role for ${employee ? `employee "${targetName}" (Code: ${employeeCode || "N/A"}, Dept: ${departmentName})` : `user "${targetName}"`} from ${currentLabel} to ${roleOption.label}. Explicit confirmation is required to update ${hasUserAccount ? "system permissions & HR records" : "HR employee designation"}.`,
        preview: {
          employeeId,
          employeeCode,
          department: departmentName,
          userId: user ? String(user._id) : undefined,
          userName: targetName,
          userEmail: targetEmail,
          currentRole: currentRoleKey,
          currentRoleLabel: currentLabel,
          proposedRole: roleOption.value,
          proposedRoleLabel: roleOption.label,
          targetModule: roleOption.module,
          hasUserAccount,
          securityImpact,
        },
      };
    },
    async execute(params, tenantId, userId) {
      await connectDB();
      const caller = await User.findOne({ _id: userId, tenantId }).lean();
      if (!caller || !["admin", "master-admin"].includes((caller as any).role)) {
        throw new CommandActionError("Unauthorized: Only administrators have permission to change employee and user roles.");
      }

      const targetEmployeeId = params.employeeId;
      const targetUserId = params.userId;
      if (!targetEmployeeId && !targetUserId) {
        throw new CommandActionError("Target employee ID or user ID is required for execution.");
      }

      const rawRole = params.proposedRole || params.role || params.newRole;
      const normalizedKey = String(rawRole || "").toLowerCase().replace(/\s+/g, "-");
      const roleOption = getUserRoleOption(normalizedKey) || getUserRoleOption(rawRole);
      if (!roleOption) throw new CommandActionError("Invalid target role.");

      let updatedEmployee: any = null;
      let updatedUser: any = null;
      let oldRole = params.currentRole || "";

      // 1. If employee is target
      if (targetEmployeeId) {
        const emp = await Employee.findOne({ _id: targetEmployeeId, tenantId });
        if (!emp) throw new CommandActionError("Employee record not found in current organization.");

        // Stale precondition check: verify current role in DB matches proposal's currentRole
        if (params.currentRole && emp.designation && emp.designation.toLowerCase() !== params.currentRole.toLowerCase()) {
          throw new CommandActionError(`Precondition failed: Employee's role/designation has changed to "${emp.designation}" since this proposal was prepared. Please prepare a new role change request.`);
        }

        oldRole = emp.designation || oldRole;
        emp.designation = roleOption.label;
        await emp.save();

        // Verify persistence in DB
        const verifiedEmp = await Employee.findOne({ _id: emp._id, tenantId }).lean();
        if (!verifiedEmp || verifiedEmp.designation !== roleOption.label) {
          throw new CommandActionError("Verification failed: Employee designation update was not persisted in database.");
        }
        updatedEmployee = verifiedEmp;

        // Also update linked User account if exists
        const linkedUserId = emp.userId || targetUserId;
        let linkedUser = linkedUserId ? await User.findOne({ _id: linkedUserId, tenantId }) : null;
        if (!linkedUser && emp.email) {
          linkedUser = await User.findOne({ email: emp.email.toLowerCase(), tenantId });
        }
        if (linkedUser) {
          linkedUser.role = roleOption.module as any;
          linkedUser.userRole = roleOption.value;
          linkedUser.designation = roleOption.label;
          await linkedUser.save();
          const verifiedUser = await User.findOne({ _id: linkedUser._id, tenantId }).lean();
          if (!verifiedUser || verifiedUser.userRole !== roleOption.value) {
            throw new CommandActionError("Verification failed: User account role update was not persisted in database.");
          }
          updatedUser = verifiedUser;
        }

        await CrmAuditLog.create({
          tenantId,
          user_id: userId,
          action: "updated",
          record_type: "Employee",
          record_id: emp._id,
          field_name: "designation",
          old_value: oldRole,
          new_value: roleOption.label,
        });
      } else if (targetUserId) {
        // User-only target
        const user = await User.findOne({ _id: targetUserId, tenantId });
        if (!user) throw new CommandActionError("User not found in current organization.");

        if (params.currentRole && (user.userRole || user.role) && (user.userRole || user.role) !== params.currentRole) {
          throw new CommandActionError(`Precondition failed: User's role has changed to "${user.userRole || user.role}" since this proposal was prepared.`);
        }

        oldRole = user.userRole || user.role;
        user.role = roleOption.module as any;
        user.userRole = roleOption.value;
        user.designation = roleOption.label;
        await user.save();

        const verifiedUser = await User.findOne({ _id: user._id, tenantId }).lean();
        if (!verifiedUser || verifiedUser.userRole !== roleOption.value) {
          throw new CommandActionError("Verification failed: role update was not persisted in database.");
        }
        updatedUser = verifiedUser;

        // Also update linked Employee if any
        const linkedEmp = await Employee.findOne({ $or: [{ userId: user._id }, { email: user.email.toLowerCase() }], tenantId });
        if (linkedEmp) {
          linkedEmp.designation = roleOption.label;
          await linkedEmp.save();
        }

        await CrmAuditLog.create({
          tenantId,
          user_id: userId,
          action: "updated",
          record_type: "User",
          record_id: user._id,
          field_name: "userRole",
          old_value: oldRole,
          new_value: roleOption.value,
        });
      }

      const resultName = updatedEmployee
        ? `${updatedEmployee.firstName} ${updatedEmployee.lastName}`.trim()
        : updatedUser?.name;

      return {
        resultRef: String(updatedEmployee?._id || updatedUser?._id),
        result: {
          employeeId: updatedEmployee ? String(updatedEmployee._id) : undefined,
          employeeCode: updatedEmployee?.employeeCode,
          userId: updatedUser ? String(updatedUser._id) : undefined,
          name: resultName,
          userName: resultName,
          oldRole,
          newRole: roleOption.value,
          newRoleLabel: roleOption.label,
        },
      };
    },
  },
};

// ── Invoice helpers ──────────────────────────────────────────────────────────
async function resolveCustomer(params: any, tenantId: string): Promise<Record<string, unknown>> {
  if (params?.customerId) {
    const byId = await Customer.findOne({ _id: params.customerId, tenantId }).lean();
    if (!byId) throw new CommandActionError("Customer not found.");
    return { ...(byId as any), __name: (byId as any).header?.name };
  }
  const nameQ = String(params?.customerName || params?.customer || params?.name || "").trim();
  if (!nameQ) throw new CommandActionError("A customer is required for an invoice. Tell me the customer name.");
  const rx = new RegExp(`^${escapeRegex(nameQ)}$`, "i");
  const matches = await Customer.find({
    tenantId,
    $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }],
  }).limit(2).lean();
  if (matches.length === 0) throw new CommandActionError(`No customer named "${nameQ}" found. Create the customer first, then try again.`);
  if (matches.length > 1) throw new CommandActionError(`Multiple customers match "${nameQ}". Please be more specific.`);
  return { ...(matches[0] as any), __name: (matches[0] as any).header?.name };
}

function normalizeInvoiceLines(params: any): { name: string; qty: number; unitPrice: number; discount: number; discountMode: "percent" | "amount"; taxRate: number; hsn?: string }[] {
  const raw = Array.isArray(params?.lineItems) ? params.lineItems : Array.isArray(params?.items) ? params.items : [];
  const lines = raw
    .map((li: any) => {
      const name = String(li?.name || li?.item || li?.description || "").trim();
      const qty = Number(li?.qty ?? li?.quantity ?? 1);
      const unitPrice = Number(li?.unitPrice ?? li?.price ?? li?.rate ?? 0);
      return {
        name, qty, unitPrice,
        discount: Number(li?.discount ?? 0),
        discountMode: (li?.discountMode === "amount" ? "amount" : "percent") as "percent" | "amount",
        taxRate: Number(li?.taxRate ?? li?.gst ?? 0),
        hsn: li?.hsn ? String(li.hsn) : undefined,
      };
    });
  const issues = validateQuoteInput({ lineItems: lines });
  if (issues.length) throw new CommandActionError(issues.join(" "));
  if (lines.some(line => line.qty < 1)) throw new CommandActionError("Invoice quantity must be at least 1.");
  return lines;
}

// ── Journal-entry helpers ────────────────────────────────────────────────────
const JOURNAL_TYPES = ["sale", "purchase", "cash", "bank", "general"];
function journalTypeFrom(params: any): string {
  const t = String(params?.journalType ?? "").toLowerCase();
  return JOURNAL_TYPES.includes(t) ? t : "general";
}
function journalNarration(params: any): string {
  const n = String(params?.narration || params?.name || params?.description || params?.memo || "").trim();
  return n || "Journal entry";
}

async function resolveJournalLines(params: any, tenantId: string) {
  const raw = Array.isArray(params?.lines) ? params.lines : [];
  if (raw.length < 2) throw new CommandActionError("A journal entry needs at least two lines (a debit and a credit).");

  const lines: { accountId: any; debit: number; credit: number; label?: string; __accountName: string }[] = [];
  for (const l of raw) {
    const accName = String(l?.account || l?.accountName || l?.ledger || "").trim();
    if (!accName) throw new CommandActionError("Every journal line needs a ledger/account name.");
    const acc = await resolveAccount({ name: accName }, tenantId);
    const debit = Math.round((Number(l?.debit ?? 0) || 0) * 100) / 100;
    const credit = Math.round((Number(l?.credit ?? 0) || 0) * 100) / 100;
    if (debit < 0 || credit < 0) throw new CommandActionError("Debit and credit amounts cannot be negative.");
    if (debit === 0 && credit === 0) throw new CommandActionError(`Line for "${accName}" has neither a debit nor a credit amount.`);
    if (debit > 0 && credit > 0) throw new CommandActionError(`Line for "${accName}" cannot be both a debit and a credit.`);
    lines.push({ accountId: (acc as any)._id, debit, credit, label: l?.label || undefined, __accountName: (acc as any).name || (acc as any).accountName || accName });
  }

  const totalDebit = Math.round(lines.reduce((s, l) => s + l.debit, 0) * 100) / 100;
  const totalCredit = Math.round(lines.reduce((s, l) => s + l.credit, 0) * 100) / 100;
  if (totalDebit <= 0) throw new CommandActionError("The journal entry total must be greater than zero.");
  if (totalDebit !== totalCredit) throw new CommandActionError(`The entry is not balanced: debits ₹${totalDebit} ≠ credits ₹${totalCredit}.`);
  return { lines, totalDebit };
}

/** Resolve a ledger/account by id or (fuzzy, unique) name for finance actions. */
async function resolveAccount(params: any, tenantId: string): Promise<Record<string, unknown>> {
  if (params?.accountId) {
    const byId = await Account.findOne({ _id: params.accountId, tenantId }).lean();
    if (!byId) throw new CommandActionError("Ledger not found.");
    return byId as any;
  }
  const nameQ = String(params?.name || params?.ledgerName || params?.accountName || "").trim();
  if (!nameQ) throw new CommandActionError("A ledger name is required.");
  const matches = await Account.find({
    tenantId,
    $or: [{ name: new RegExp(`^${escapeRegex(nameQ)}$`, "i") }, { accountName: new RegExp(`^${escapeRegex(nameQ)}$`, "i") }],
  }).limit(2).lean();
  if (matches.length === 0) throw new CommandActionError(`No ledger named "${nameQ}" found.`);
  if (matches.length > 1) throw new CommandActionError(`Multiple ledgers match "${nameQ}". Please be more specific.`);
  return matches[0] as any;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const COMMAND_ACTION_TYPES = Object.keys(COMMAND_ACTIONS);

export function isCommandAction(actionType: string): boolean {
  return Object.prototype.hasOwnProperty.call(COMMAND_ACTIONS, actionType);
}

export interface BatchStep {
  actionType: string;
  params: Record<string, unknown>;
}
export interface BatchStepResult {
  actionType: string;
  ok: boolean;
  resultRef?: string;
  error?: string;
}

/**
 * Execute a batch of confirmed actions in order. Steps run sequentially so a
 * later step can depend on an earlier one (e.g. create a customer, then an
 * invoice for that customer resolved by name). Stops at the first failure and
 * returns what completed — partial results are surfaced to the user rather than
 * silently swallowed. Each step's own execute() writes its own audit row.
 */
export async function executeCommandBatch(
  steps: BatchStep[],
  tenantId: string,
  userId: string,
): Promise<{ completed: number; total: number; results: BatchStepResult[]; failedIndex: number | null }> {
  const results: BatchStepResult[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!isCommandAction(step.actionType)) {
      results.push({ actionType: step.actionType, ok: false, error: "unknown action" });
      return { completed: i, total: steps.length, results, failedIndex: i };
    }
    try {
      const { resultRef } = await COMMAND_ACTIONS[step.actionType].execute(step.params, tenantId, userId);
      results.push({ actionType: step.actionType, ok: true, resultRef });
    } catch (err: any) {
      results.push({ actionType: step.actionType, ok: false, error: err?.message || "failed" });
      return { completed: i, total: steps.length, results, failedIndex: i };
    }
  }
  return { completed: steps.length, total: steps.length, results, failedIndex: null };
}
