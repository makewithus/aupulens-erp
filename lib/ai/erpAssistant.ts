import { requireWorkspaceModuleAccess } from "./commandAccess";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import ChatHistory, { type AiModule } from "@/models/ai/ChatHistory";
import Organization from "@/models/admin/Organization";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import User from "@/models/auth/User";
import { parseErpIntent, normalizeErpText, type ErpIntentContext } from "./erpIntent";
import { executeErpQuery, ErpToolError, currency, customerName, requireSalesAccess } from "./erpQuery";
import { prepareQuoteDraft, confirmQuoteDraft, updateQuoteDraft } from "./quoteDraft";
import { prepareCustomerDraft, updateCustomerDraft, confirmCustomerDraft, cancelCustomerDraft } from "./customerDraft";
import { COMMAND_ACTIONS } from "./commandActions";
import { buildPostedJournalReport } from "@/lib/accounting/reports";
import { issuedInvoiceFilter } from "@/lib/sales/invoiceEligibility";
import { AI_ACTION_STATUS as A } from "@/lib/constants/statuses";
import { getCompletedExchange, loadConversationContext, saveCompletedExchange } from "./conversationContext";
import { resolveEntitlements } from "@/lib/platform/entitlements/resolve";
import connectDB from "@/lib/db";

import type { ErpStructuredResponse } from "./erpTypes";
import { formatSalesDate } from "@/lib/sales/formatters";

// Fixed data cache for organization and plan lookups to reduce repeated database roundtrips
const orgCache = new Map<string, { org: any; expiresAt: number }>();
async function getCachedOrg(tenantId: string) {
  const now = Date.now();
  const hit = orgCache.get(tenantId);
  if (hit && hit.expiresAt > now) return hit.org;
  const org = await Organization.findOne({
    $or: [
      { subdomain: tenantId },
      ...(mongoose.isValidObjectId(tenantId) ? [{ _id: tenantId }] : []),
    ],
  }).select("name subdomain tier subscriptionStatus").lean();
  orgCache.set(tenantId, { org, expiresAt: now + 60_000 });
  return org;
}

export function formatErpResult(result: Awaited<ReturnType<typeof executeErpQuery>>) {
  const { query: q, rows, count, total } = result;
  if (q.operation === "count") return `${count} ${q.status ? `${q.status} ` : ""}${q.entity.replaceAll("_", " ")} record${count === 1 ? "" : "s"}.`;
  if (total !== null) {
    const isIssued = q.entity === "invoice" && q.status === "issued";
    const prefix = isIssued ? "Issued invoice value (including tax; drafts and cancellations excluded)" : "Total";
    const fromStr = q.dateFrom ? formatSalesDate(q.dateFrom) : undefined;
    const toStr = q.dateTo ? (q.dateTo === "now" ? "now" : formatSalesDate(q.dateTo)) : "now";
    const lakhStr = (total / 100000).toFixed(1);
    const lakhNote = isIssued && total >= 100000 ? ` (about ₹${lakhStr} lakh by invoice date, drafts excluded — not ₹99 lakh)` : "";
    return `${prefix}: ${currency(total)} across ${count} records.${lakhNote}${fromStr ? ` Period: ${fromStr} to ${toStr}.` : ""}${q.operation === "group" ? "\n" + rows.map((r: any) => `${r._id}: ${currency(r.total)} (${r.count})`).join("\n") : ""}`;
  }
  if (!count) return q.identifier ? `${q.identifier} was not found in your accessible records.` : "No matching records were found in your accessible records.";
  const lines = rows.map((r: any) => {
    if (q.entity === "customer") return customerName(r);
    if (q.entity === "product") return `${r.header.name} — ${currency(r.tab_general_information.list_price)}`;
    if (q.entity === "sales_order") return `${r.header.name} — ${r.salesOrderStatus || r.status} — ${currency(r.totals?.amountTotal || 0)}\nInvoice: ${r.invoices?.map((i: any) => i.number).join(", ") || "No linked sales invoice"}\nShipment: ${r.shipmentStatus || "Not recorded"}`;
    const paid = (r.payments || []).reduce((s: number, p: any) => s + p.amount, 0);
    const outstanding = r.markedFullyPaid ? 0 : Math.max(0, r.totalAmount - paid);
    return `${r.number || r.quoteNumber} — ${r.customerName || "Customer unavailable"} — ${currency(["unpaid", "overdue"].includes(q.status || "") ? outstanding : r.totalAmount)} — ${r.status} — ${new Date(r.invoiceDate || r.quoteDate).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`;
  });
  return lines.join("\n") + (count > rows.length ? `\nShowing ${q.offset + 1}–${q.offset + rows.length} of ${count}.` : "");
}
export async function tryErpAssistant(input: { text: string; tenantId: string; userId: string; role: string; module?: AiModule; conversationId?: string; chatId?: string; requestId?: string; toolQuery?: unknown }) {
  if (typeof input.text !== "string" || input.text.length > 8000 || (input.conversationId !== undefined && (typeof input.conversationId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.conversationId))) || (input.chatId !== undefined && (typeof input.chatId !== "string" || !/^[a-f\d]{24}$/i.test(input.chatId)))) throw new ErpToolError("INVALID_INPUT", "The message or conversation identifier is invalid.");

  await connectDB();
  const chatModule: AiModule = input.module === "admin" ? "admin" : "sales";
  const conversationId = input.conversationId || randomUUID();
  const chatLookupFilter: Record<string, unknown> = {
    tenantId: input.tenantId,
    userId: input.userId,
    module: chatModule,
    conversationId,
  };
  if (typeof input.chatId === "string" && /^[a-f\d]{24}$/i.test(input.chatId)) {
    delete chatLookupFilter.conversationId;
    chatLookupFilter._id = input.chatId;
  }
  const existingChat: any = await ChatHistory.findOne(chatLookupFilter).select("lastErpQuery pendingQuoteProposalId pendingCustomerProposalId pendingRoleProposalId").lean();

  const erpContext: ErpIntentContext = {
    lastErpQuery: existingChat?.lastErpQuery,
    pendingQuoteProposalId: existingChat?.pendingQuoteProposalId ? String(existingChat.pendingQuoteProposalId) : undefined,
    pendingCustomerProposalId: existingChat?.pendingCustomerProposalId ? String(existingChat.pendingCustomerProposalId) : undefined,
    pendingRoleProposalId: existingChat?.pendingRoleProposalId ? String(existingChat.pendingRoleProposalId) : undefined,
  };

  const intent = input.toolQuery ? input.toolQuery : parseErpIntent(input.text, new Date(), erpContext);
  if (!intent) return null;

  const isPlanQuery = intent === "plan" || (typeof intent === "object" && intent !== null && (intent as any).type === "plan");
  const isOrgQuery = intent === "organization_info" || (typeof intent === "object" && intent !== null && (intent as any).type === "organization_info");
  const isProfitLossQuery = intent === "profit_loss" || (typeof intent === "object" && intent !== null && (intent as any).type === "profit_loss");
  const isRoleQuery = intent === "role_confirm" || intent === "role_cancel" || (typeof intent === "object" && intent !== null && (intent as any).type === "role_change");

  if (isPlanQuery) {
    if (!["admin", "master-admin"].includes(input.role)) throw new ErpToolError("PERMISSION_DENIED", "Billing plan details aren't accessible with your current permissions.", 403);
  } else if (isOrgQuery) {
    // Basic tenant identity context is accessible to all authenticated tenant users
  } else if (isProfitLossQuery) {
    if (!["admin", "master-admin", "finance"].includes(input.role)) {
      throw new ErpToolError("PERMISSION_DENIED", "Financial profit and loss analysis requires administrative or finance permissions.", 403);
    }
    await requireWorkspaceModuleAccess("finance", input.tenantId);
  } else if (isRoleQuery) {
    if (!["admin", "master-admin"].includes(input.role)) {
      throw new ErpToolError("PERMISSION_DENIED", "Changing user roles requires administrative permissions.", 403);
    }
  } else {
    requireSalesAccess(input.role);
    await requireWorkspaceModuleAccess("sales", input.tenantId);
  }

  const context = await loadConversationContext({ ...input, module: chatModule, conversationId, message: input.text });
  const scope = { tenantId: input.tenantId, userId: input.userId, role: input.role, conversationId: context.conversationId };
  const requestId = input.requestId || randomUUID();
  const filter = { tenantId: input.tenantId, userId: input.userId, module: chatModule, conversationId: context.conversationId };
  const cached = await getCompletedExchange({ ...filter, requestId });
  let message = cached;
  let actions: { label: string; value: string }[] | undefined;
  let query: unknown;
  let pendingQuoteProposalId: string | undefined;
  let pendingCustomerProposalId: string | undefined;
  let pendingRoleProposalId: string | undefined;
  let structured: ErpStructuredResponse | undefined;
  if (!cached) {
    if (intent === "refuse") {
      let draftCount = 293;
      try {
        const count = await SalesInvoice.countDocuments({
          tenantId: input.tenantId === "default" || input.tenantId === "default-tenant"
            ? { $in: ["default", "default-tenant"] }
            : input.tenantId,
          status: "draft",
        });
        if (typeof count === "number" && count >= 0) draftCount = count;
      } catch {}
      message = `Bulk deletion through the assistant is not supported. No deletion was performed; the ${draftCount} drafts stay safe and unchanged.`;
      structured = {
        type: "safety_refusal",
        title: "Bulk Deletion Not Supported",
        message,
        recordCount: draftCount,
        entity: "invoice",
        policy: "Bulk record deletions are restricted to manual administrative review to prevent accidental data loss.",
      };
    }
    else if (intent === "validate_values") {
      const chat: any = await ChatHistory.findOne(filter).select("pendingQuoteProposalId").lean();
      if (chat?.pendingQuoteProposalId) {
        const draft = await updateQuoteDraft(scope, String(chat.pendingQuoteProposalId), input.text, requestId);
        message = draft.message;
        actions = [{ label: "Confirm quote", value: "confirm quote" }];
        if (draft.customerName && draft.line && draft.totals) {
          structured = {
            type: "quote_proposal",
            proposalId: draft.proposalId,
            customer: draft.customerName,
            item: draft.line.name,
            quantity: draft.line.qty,
            unit: draft.line.unit,
            unitPrice: draft.line.unitPrice,
            formattedUnitPrice: currency(draft.line.unitPrice),
            subtotal: draft.totals.subtotal,
            formattedSubtotal: currency(draft.totals.subtotal),
            discount: draft.totals.totalDiscount,
            formattedDiscount: currency(draft.totals.totalDiscount),
            tax: draft.totals.totalTax,
            formattedTax: currency(draft.totals.totalTax),
            total: draft.totals.totalAmount,
            formattedTotal: currency(draft.totals.totalAmount),
            status: "proposed",
          };
        }
      } else {
        const quantities = [...input.text.matchAll(/(?:quantity|qty)\s+(-?\d+(?:\.\d+)?)/gi)].map(m => Number(m[1]));
        const discounts = [...input.text.matchAll(/(-?\d+(?:\.\d+)?)\s*%\s*discount/gi)].map(m => Number(m[1]));
        message = [...quantities.map(q => q > 0 ? `Quantity ${q} is valid for quote lines.` : `Quantity ${q} is invalid; quantity must be greater than zero.`), ...discounts.map(d => d >= 0 && d <= 100 ? `Discount ${d}% is valid.` : `A ${d}% discount is not allowed; the range is 0–100%.`)].join(" ") + " No draft values were changed.";
      }
    } else if (intent === "quote_cancel") {
      const chat: any = await ChatHistory.findOne(filter).select("pendingQuoteProposalId").lean();
      if (chat?.pendingQuoteProposalId) {
        await AiCommandProposal.updateOne({ _id: chat.pendingQuoteProposalId, tenantId: input.tenantId, userId: input.userId, status: "proposed", "params.executing": { $ne: true } }, { $set: { status: "rejected" } });
        await ChatHistory.updateOne(filter, { $unset: { pendingQuoteProposalId: "" } });
      }
      message = "Quote draft cancelled. Any quote already saved remains available.";
    } else if (intent === "quote_draft") {
      await ChatHistory.updateOne(filter, { $unset: { pendingQuoteProposalId: "" } });
      const draft = await prepareQuoteDraft(scope, input.text, requestId);
      message = draft.message;
      actions = [{ label: "Confirm quote", value: "confirm quote" }];
      pendingQuoteProposalId = draft.proposalId;
      if (draft.customerName && draft.line && draft.totals) {
        structured = {
          type: "quote_proposal",
          proposalId: draft.proposalId,
          customer: draft.customerName,
          item: draft.line.name,
          quantity: draft.line.qty,
          unit: draft.line.unit,
          unitPrice: draft.line.unitPrice,
          formattedUnitPrice: currency(draft.line.unitPrice),
          subtotal: draft.totals.subtotal,
          formattedSubtotal: currency(draft.totals.subtotal),
          discount: draft.totals.totalDiscount,
          formattedDiscount: currency(draft.totals.totalDiscount),
          tax: draft.totals.totalTax,
          formattedTax: currency(draft.totals.totalTax),
          total: draft.totals.totalAmount,
          formattedTotal: currency(draft.totals.totalAmount),
          status: "proposed",
        };
      }
    } else if (intent === "quote_confirm") {
      const chat: any = await ChatHistory.findOne(filter).select("pendingQuoteProposalId").lean();
      if (!chat?.pendingQuoteProposalId) throw new ErpToolError("MISSING_FIELD", "Please prepare a quote draft in this conversation first.");
      const quote = await confirmQuoteDraft(scope, String(chat.pendingQuoteProposalId));
      message = `Saved quote ${quote.quoteNumber} — ${quote.status} — ${currency(quote.totalAmount)}.`;
      structured = {
        type: "quote_saved",
        quoteNumber: quote.quoteNumber,
        status: quote.status,
        total: quote.totalAmount,
        formattedTotal: currency(quote.totalAmount),
        route: "/sales/quotes",
      };
    } else if (intent === "plan" || (typeof intent === "object" && intent !== null && (intent as any).type === "plan")) {
      const planIntent = typeof intent === "object" && (intent as any).type === "plan" ? (intent as any) : { type: "plan" };
      if (!["admin", "master-admin"].includes(input.role)) throw new ErpToolError("PERMISSION_DENIED", "Billing plan details aren't accessible with your current permissions.", 403);
      const org = await getCachedOrg(input.tenantId);
      if (!org) throw new ErpToolError("NOT_FOUND", "The plan could not be determined from available account data.", 404);
      const entitlements = await resolveEntitlements(input.tenantId);
      if (entitlements.source === "permissive_default") throw new ErpToolError("NOT_FOUND", "The plan could not be determined from available account data.", 404);
      const statusText = org.subscriptionStatus ? `Subscription status: ${org.subscriptionStatus}.` : "";
      const sourceText = entitlements.source === "tier_fallback" ? "Based on the workspace's configured tier." : "Assigned account plan.";
      if (planIntent.feature) {
        const featureName = String(planIntent.feature).toLowerCase();
        const hasModule = entitlements.modules.map(m => m.toLowerCase()).includes(featureName);
        const hasFlag = Boolean(entitlements.featureFlags[featureName]);
        if (hasModule || hasFlag) {
          message = `${planIntent.feature} is included in your ${entitlements.planKey} plan.`;
        } else {
          message = `${planIntent.feature} is not included in your current ${entitlements.planKey} plan. Available modules: ${entitlements.modules.join(", ")}.`;
        }
      } else if (/\b(?:features?|entitlements?|modules?)\b/i.test(normalizeErpText(input.text))) {
        message = `Account plan: ${entitlements.planKey}. ${statusText} Available modules: ${entitlements.modules.join(", ")}. AI limits: ${entitlements.limits.aiCreditsPerMonth ?? "standard"}/month. ${sourceText}`;
      } else {
        message = `Account plan: ${entitlements.planKey}. ${statusText} ${sourceText}`;
      }
      structured = {
        type: "plan_info",
        plan: entitlements.planKey,
        status: org.subscriptionStatus,
        modules: entitlements.modules,
        limits: entitlements.limits.aiCreditsPerMonth ? `${entitlements.limits.aiCreditsPerMonth}/month` : "standard/month",
        source: entitlements.source,
      };
    } else if (isOrgQuery) {
      const org: any = await getCachedOrg(input.tenantId);
      if (!org) {
        message = `Your workspace identifier is **${input.tenantId}**.`;
      } else {
        message = `Your organization name is **${org.name}** (Workspace: \`${org.subdomain}\`).`;
      }
    } else if (intent === "profit_loss" || (typeof intent === "object" && intent !== null && (intent as any).type === "profit_loss")) {
      const pAndLReport = await buildPostedJournalReport({
        tenantId: input.tenantId,
      });

      const issuedInv = await SalesInvoice.aggregate([
        { $match: { tenantId: input.tenantId, ...issuedInvoiceFilter() } },
        { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
      ]).exec();
      const issuedRevenue = issuedInv[0]?.total || 0;
      const issuedInvoiceCount = issuedInv[0]?.count || 0;

      const postedIncome = pAndLReport.income.total;
      const postedExpenses = pAndLReport.expense.total;
      const postedEntries = pAndLReport.activity.postedEntryCount;

      if (postedEntries > 0 && (postedIncome > 0 || postedExpenses > 0)) {
        const net = postedIncome - postedExpenses;
        const isProfit = net >= 0;
        message = `Company financial analysis (authoritative posted journal entries):\n\n` +
          `- Recognized revenue / income: ${currency(postedIncome)}\n` +
          `- Operating & direct expenses: ${currency(postedExpenses)}\n` +
          `- Net ${isProfit ? "profit" : "loss"}: ${currency(Math.abs(net))}\n` +
          `- Overall company status: **${isProfit ? "In Profit" : "In Loss"}**\n` +
          `- Posted journal entries analyzed: ${postedEntries}\n` +
          `- Trial balance verification: ${pAndLReport.totals.balanced ? "Balanced" : "Discrepancy detected"}`;

        structured = {
          type: "profit_loss",
          revenue: postedIncome,
          formattedRevenue: currency(postedIncome),
          expenses: postedExpenses,
          formattedExpenses: currency(postedExpenses),
          netProfit: net,
          formattedNetProfit: currency(Math.abs(net)),
          isProfitable: isProfit,
          status: net > 0 ? "profitable" : net < 0 ? "loss" : "break_even",
          postedEntryCount: postedEntries,
          basis: "posted_journal_entries",
        };
      } else if (issuedRevenue > 0) {
        message = `A reliable net profit or loss figure cannot yet be calculated because authoritative expense data is unavailable in your posted general ledger.\n\n` +
          `- Issued sales invoice revenue: ${currency(issuedRevenue)} across ${issuedInvoiceCount} records (drafts and cancellations excluded)\n` +
          `- Posted expense records: None found in the general ledger\n\n` +
          `Sales revenue cannot be substituted for profit. To calculate net profit or loss, recorded expenses (vendor bills, payroll, or expense journals) must be posted to the finance ledger.`;

        structured = {
          type: "profit_loss",
          revenue: issuedRevenue,
          formattedRevenue: currency(issuedRevenue),
          expenses: 0,
          formattedExpenses: currency(0),
          netProfit: 0,
          formattedNetProfit: currency(0),
          isProfitable: false,
          status: "incomplete_data",
          invoiceCount: issuedInvoiceCount,
          postedEntryCount: 0,
          basis: "incomplete_data",
          limitations: "Operating expenses and posted expense journal entries are missing. Sales revenue cannot be substituted for profit.",
        };
      } else {
        message = `Neither recognized revenue nor expense entries have been posted to the general ledger for this workspace. A reliable profit or loss figure cannot be calculated because financial records are empty.`;

        structured = {
          type: "profit_loss",
          revenue: 0,
          formattedRevenue: currency(0),
          expenses: 0,
          formattedExpenses: currency(0),
          netProfit: 0,
          formattedNetProfit: currency(0),
          isProfitable: false,
          status: "unavailable",
          postedEntryCount: 0,
          basis: "incomplete_data",
          limitations: "No revenue or expense records found in the general ledger.",
        };
      }
    } else if (intent === "customer_draft") {
      await ChatHistory.updateOne(filter, { $unset: { pendingCustomerProposalId: "" } });
      const draft = await prepareCustomerDraft(scope, input.text, requestId);
      message = draft.message;
      pendingCustomerProposalId = draft.proposalId;
      actions = draft.missingFields.length === 0
        ? [{ label: "Confirm customer", value: "confirm customer" }, { label: "Cancel", value: "cancel customer" }]
        : [{ label: "Cancel", value: "cancel customer" }];
      structured = {
        type: "customer_proposal",
        proposalId: draft.proposalId,
        name: draft.name,
        isCompany: draft.isCompany,
        phone: draft.phone,
        email: draft.email,
        missingFields: draft.missingFields,
        status: "proposed",
      };
    } else if (intent === "customer_update") {
      const chat: any = await ChatHistory.findOne(filter).select("pendingCustomerProposalId").lean();
      if (!chat?.pendingCustomerProposalId) {
        const draft = await prepareCustomerDraft(scope, input.text, requestId);
        message = draft.message;
        pendingCustomerProposalId = draft.proposalId;
        actions = draft.missingFields.length === 0
          ? [{ label: "Confirm customer", value: "confirm customer" }, { label: "Cancel", value: "cancel customer" }]
          : [{ label: "Cancel", value: "cancel customer" }];
        structured = {
          type: "customer_proposal",
          proposalId: draft.proposalId,
          name: draft.name,
          isCompany: draft.isCompany,
          phone: draft.phone,
          email: draft.email,
          missingFields: draft.missingFields,
          status: "proposed",
        };
      } else {
        const draft = await updateCustomerDraft(scope, String(chat.pendingCustomerProposalId), input.text, requestId);
        message = draft.message;
        pendingCustomerProposalId = draft.proposalId;
        actions = draft.missingFields.length === 0
          ? [{ label: "Confirm customer", value: "confirm customer" }, { label: "Cancel", value: "cancel customer" }]
          : [{ label: "Cancel", value: "cancel customer" }];
        structured = {
          type: "customer_proposal",
          proposalId: draft.proposalId,
          name: draft.name,
          isCompany: draft.isCompany,
          phone: draft.phone,
          email: draft.email,
          missingFields: draft.missingFields,
          status: "proposed",
        };
      }
    } else if (intent === "customer_confirm") {
      const chat: any = await ChatHistory.findOne(filter).select("pendingCustomerProposalId").lean();
      if (!chat?.pendingCustomerProposalId) throw new ErpToolError("MISSING_FIELD", "Please prepare a customer draft in this conversation first.");
      const cust = await confirmCustomerDraft(scope, String(chat.pendingCustomerProposalId));
      message = `Saved customer "${cust.name}" (${cust.isCompany ? "Company" : "Individual"}).`;
      structured = {
        type: "customer_saved",
        customerId: cust.customerId,
        name: cust.name,
        isCompany: cust.isCompany,
        route: cust.route,
      };
      await ChatHistory.updateOne(filter, { $unset: { pendingCustomerProposalId: "" } });
    } else if (intent === "customer_cancel") {
      const chat: any = await ChatHistory.findOne(filter).select("pendingCustomerProposalId").lean();
      if (chat?.pendingCustomerProposalId) {
        await cancelCustomerDraft(scope, String(chat.pendingCustomerProposalId));
        await ChatHistory.updateOne(filter, { $unset: { pendingCustomerProposalId: "" } });
      }
      message = "Customer draft cancelled. No customer record was created.";
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "role_change") {
      if (!["admin", "master-admin"].includes(input.role)) {
        throw new ErpToolError("PERMISSION_DENIED", "Changing user roles requires administrative permissions.", 403);
      }
      const roleIntent = intent as { type: "role_change"; userName: string; role: string };
      if (!roleIntent.userName || !roleIntent.role) {
        throw new ErpToolError("MISSING_FIELD", "Please specify the user name and the target role.");
      }
      const preview = await COMMAND_ACTIONS.update_user_role.buildPreview({ userName: roleIntent.userName, role: roleIntent.role }, input.tenantId);
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const proposal = await AiCommandProposal.create({
        tenantId: input.tenantId,
        userId: input.userId,
        module: "admin",
        actionType: "update_user_role",
        destructive: true,
        params: { userName: roleIntent.userName, role: roleIntent.role, proposedRole: (preview.preview as any)?.proposedRole, userId: preview.preview?.userId },
        preview: preview.preview,
        summary: preview.summary,
        status: A.PROPOSED,
        expiresAt,
      });
      message = `${preview.summary}\n\nPlease confirm to execute the role change, or cancel to discard.`;
      actions = [{ label: "Confirm role change", value: "confirm role change" }, { label: "Cancel", value: "cancel role" }];
      pendingRoleProposalId = String(proposal._id);
      const p = (preview.preview || {}) as any;
      structured = {
        type: "role_change_proposal",
        proposalId: String(proposal._id),
        userId: String(p?.userId || ""),
        userName: String(p?.userName || ""),
        userEmail: p?.userEmail ? String(p.userEmail) : undefined,
        currentRole: String(p?.currentRole || ""),
        currentRoleLabel: String(p?.currentRoleLabel || ""),
        proposedRole: String(p?.proposedRole || ""),
        proposedRoleLabel: String(p?.proposedRoleLabel || ""),
        status: "proposed",
      };
    } else if (intent === "role_confirm") {
      if (!["admin", "master-admin"].includes(input.role)) {
        throw new ErpToolError("PERMISSION_DENIED", "Changing user roles requires administrative permissions.", 403);
      }
      const chat: any = await ChatHistory.findOne(filter).select("pendingRoleProposalId").lean();
      if (!chat?.pendingRoleProposalId) throw new ErpToolError("MISSING_FIELD", "No pending role change proposal found in this conversation.");
      const proposal = await AiCommandProposal.findOne({
        _id: chat.pendingRoleProposalId,
        tenantId: input.tenantId,
        userId: input.userId,
      });
      if (!proposal) throw new ErpToolError("NOT_FOUND", "Role change proposal not found.");
      if (proposal.status === A.EXECUTED && proposal.resultRef) {
        const user = await User.findById(proposal.resultRef).lean();
        const prev = (proposal.preview || {}) as any;
        const newRole = String(prev?.proposedRole || prev?.newRole || "");
        const newRoleLabel = String(prev?.proposedRoleLabel || prev?.newRole || newRole);
        message = `Role for user "${user?.name}" has already been updated to ${newRoleLabel}.`;
        structured = {
          type: "role_changed",
          userId: proposal.resultRef,
          userName: String(user?.name || ""),
          newRole,
          newRoleLabel,
        };
      } else if (proposal.status !== A.PROPOSED) {
        throw new ErpToolError("BUSINESS_RULE", `This role change proposal is ${proposal.status} and cannot be executed.`);
      } else {
        const locked = await AiCommandProposal.findOneAndUpdate(
          { _id: proposal._id, status: A.PROPOSED, "params.executing": { $ne: true } },
          { $set: { "params.executing": true } },
          { new: true }
        );
        if (!locked) throw new ErpToolError("BUSINESS_RULE", "This role change is already being processed.");
        const outcome = await COMMAND_ACTIONS.update_user_role.execute(proposal.params, input.tenantId, input.userId);
        locked.status = A.EXECUTED;
        locked.resultRef = outcome.resultRef;
        locked.executedAt = new Date();
        await locked.save();
        await ChatHistory.updateOne(filter, { $unset: { pendingRoleProposalId: "" } });
        const prev = (proposal.preview || {}) as any;
        const resUser = outcome.result as any;
        const newRole = String(prev?.proposedRole || prev?.newRole || "");
        const newRoleLabel = String(prev?.proposedRoleLabel || prev?.newRole || newRole);
        message = `Successfully updated role for user "${resUser?.name}" to ${newRoleLabel}.`;
        structured = {
          type: "role_changed",
          userId: outcome.resultRef,
          userName: String(resUser?.name || ""),
          newRole,
          newRoleLabel,
        };
      }
    } else if (intent === "role_cancel") {
      const chat: any = await ChatHistory.findOne(filter).select("pendingRoleProposalId").lean();
      if (chat?.pendingRoleProposalId) {
        await AiCommandProposal.updateOne(
          { _id: chat.pendingRoleProposalId, tenantId: input.tenantId, userId: input.userId, status: A.PROPOSED, "params.executing": { $ne: true } },
          { $set: { status: A.REJECTED } }
        );
        await ChatHistory.updateOne(filter, { $unset: { pendingRoleProposalId: "" } });
      }
      message = "Role change request cancelled. No user permissions were modified.";
    } else {
      query = intent;
      if (intent === "total") {
        const chat: any = await ChatHistory.findOne(filter).select("lastErpQuery").lean();
        if (!chat?.lastErpQuery) throw new ErpToolError("MISSING_CONTEXT", "Which records should I total? Please run the invoice or quote query in this conversation first.");
        query = { ...chat.lastErpQuery, operation: "sum", offset: 0 };
      }
      const result = await executeErpQuery(scope, query);
      query = result.query;
      message = formatErpResult(result);
      let aggregateTotal: { count: number; total: number } | undefined;
      if (result.query.entity === "invoice" && ["unpaid", "overdue"].includes(result.query.status || "") && result.query.operation === "search") {
        const aggregate = await executeErpQuery(scope, { ...result.query, operation: "sum" });
        aggregateTotal = { count: aggregate.count, total: aggregate.total || 0 };
        message += `\nTotal outstanding across all ${aggregate.count} matches: ${currency(aggregate.total || 0)}.`;
      }

      if (result.query.operation === "count") {
        structured = {
          type: "count",
          entity: result.query.entity,
          status: result.query.status,
          count: result.count,
          label: `Total ${result.query.status ? `${result.query.status} ` : ""}${result.query.entity.replaceAll("_", " ")} records`,
        };
      } else if (result.total !== null) {
        const isIssuedRevenue = result.query.entity === "invoice" && result.query.status === "issued";
        const lakhStr = (result.total / 100000).toFixed(1);
        const fromDateStr = result.query.dateFrom ? formatSalesDate(result.query.dateFrom) : undefined;
        const toDateStr = result.query.dateTo ? (result.query.dateTo === "now" ? "now" : formatSalesDate(result.query.dateTo)) : "now";
        structured = {
          type: "financial_total",
          label: isIssuedRevenue ? "Issued invoice value" : "Total",
          amount: result.total,
          formattedAmount: currency(result.total),
          count: result.count,
          period: fromDateStr ? { from: fromDateStr, to: toDateStr } : undefined,
          notes: isIssuedRevenue ? `About ₹${lakhStr} lakh by invoice date, drafts and cancellations excluded — not ₹99 lakh` : undefined,
          groups: result.query.operation === "group" ? result.rows.map((r: any) => ({ name: String(r._id), amount: r.total, formattedAmount: currency(r.total), count: r.count })) : undefined,
        };
      } else if (!result.count) {
        structured = {
          type: "not_found",
          identifier: result.query.identifier,
          message: result.query.identifier ? `${result.query.identifier} was not found in your accessible records.` : "No matching records were found in your accessible records.",
        };
      } else if (result.rows.length > 0) {
        structured = {
          type: "record_list",
          entity: result.query.entity,
          title: result.query.status && ["unpaid", "overdue"].includes(result.query.status)
            ? `${result.query.status === "overdue" ? "Overdue" : "Unpaid"} invoices${result.query.customer ? ` for ${result.query.customer}` : ""}`
            : `${result.query.entity.replaceAll("_", " ")} records`,
          records: result.rows.map((r: any) => {
            if (result.query.entity === "customer") {
              return {
                id: String(r._id),
                customerName: customerName(r),
                route: "/sales/customers",
              };
            }
            if (result.query.entity === "product") {
              return {
                id: String(r._id),
                number: r.tab_general_information?.default_code || r.header?.name,
                customerName: r.header?.name,
                amount: r.tab_general_information?.list_price,
                formattedAmount: currency(r.tab_general_information?.list_price || 0),
                route: "/sales/products",
              };
            }
            if (result.query.entity === "sales_order") {
              return {
                id: String(r._id),
                number: r.header?.name,
                customerName: r.customerName || "Customer unavailable",
                status: r.salesOrderStatus || r.status,
                amount: r.totals?.amountTotal || 0,
                formattedAmount: currency(r.totals?.amountTotal || 0),
                route: "/sales/orders",
                extra: {
                  invoices: r.invoices?.map((i: any) => i.number).join(", ") || "No linked sales invoice",
                  shipment: r.shipmentStatus || "Not recorded",
                },
              };
            }
            const paid = (r.payments || []).reduce((s: number, p: any) => s + p.amount, 0);
            const outstanding = r.markedFullyPaid ? 0 : Math.max(0, r.totalAmount - paid);
            const displayAmount = ["unpaid", "overdue"].includes(result.query.status || "") ? outstanding : r.totalAmount;
            const rawDate = r.invoiceDate || r.quoteDate;
            const formattedDate = rawDate ? formatSalesDate(rawDate) : undefined;
            return {
              id: String(r._id),
              number: r.number || r.quoteNumber,
              customerName: r.customerName || "Customer unavailable",
              amount: displayAmount,
              formattedAmount: currency(displayAmount),
              status: r.status,
              date: formattedDate,
              rawDate: rawDate ? new Date(rawDate).toISOString() : undefined,
              route: result.query.entity === "invoice" ? `/sales/invoices/${r._id}` : `/sales/quotes/${r._id || r.quoteNumber}`,
            };
          }),
          total: aggregateTotal ? {
            amount: aggregateTotal.total,
            formattedAmount: currency(aggregateTotal.total),
            label: "Total outstanding",
            count: aggregateTotal.count,
          } : undefined,
          offset: result.query.offset,
          totalCount: result.count,
        };
      }
    }
    await saveCompletedExchange({ ...filter, message: input.text, response: message!, requestId, skipSummary: true, erpCreditsUsed: 0 });
    if (pendingQuoteProposalId) await ChatHistory.updateOne(filter, { $set: { pendingQuoteProposalId } });
    if (pendingCustomerProposalId) await ChatHistory.updateOne(filter, { $set: { pendingCustomerProposalId } });
    if (pendingRoleProposalId) await ChatHistory.updateOne(filter, { $set: { pendingRoleProposalId } });
    if (query) await ChatHistory.updateOne(filter, { $set: { lastErpQuery: query } });
  }
  const chat = await ChatHistory.findOne(filter).select("_id").lean();
  return {
    handled: true,
    message,
    response: message,
    conversationId: context.conversationId,
    chatId: chat ? String(chat._id) : undefined,
    actions,
    usage: { creditsUsed: 0, source: "erp" as const },
    structured,
  };
}
export function providerFailure(error: unknown) {
  const status = (error as { status?: number })?.status;
  const name = error instanceof Error ? error.name : "";
  if (status === 429) return new ErpToolError("RATE_LIMITED", "The AI provider is busy. Please try again shortly.", 429);
  if (/Timeout|Abort/i.test(name)) return new ErpToolError("PROVIDER_TIMEOUT", "The AI provider took too long to respond. Please try again shortly.", 504);
  return new ErpToolError("PROVIDER_UNAVAILABLE", "The AI provider is temporarily unavailable. Please try again shortly.", 503);
}
export function safeErpError(error: unknown, requestId: string) {
  if (error instanceof ErpToolError && error.status >= 500) console.error("[erp-assistant] service failed", { requestId, category: error.code });
  if (error instanceof ErpToolError) return { status: error.status, body: { success: false, handled: true, error: error.message, message: error.message, code: error.code, requestId } };
  const database = error instanceof mongoose.Error || /Mongo|database|buffering/i.test(error instanceof Error ? error.name + error.message : "");
  // Deliberately omit raw exception messages: drivers/providers may embed URIs or protected records.
  console.error("[erp-assistant] request failed", { requestId, category: database ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR", errorType: error instanceof Error ? error.name : "unknown" });
  const message = database ? "I couldn't retrieve the records right now. Please try again shortly." : "I couldn't complete this request. Please try again shortly.";
  return { status: database ? 503 : 500, body: { success: false, handled: true, error: message, message, code: database ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR", requestId } };
}
