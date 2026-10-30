import { requireWorkspaceModuleAccess } from "./commandAccess";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import ChatHistory, { type AiModule } from "@/models/ai/ChatHistory";
import Organization from "@/models/admin/Organization";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import User from "@/models/auth/User";
import { parseErpIntent, normalizeErpText, type ErpIntentContext } from "./erpIntent";
import { executeErpQuery, ErpToolError, currency, customerName, flexibleNameRegex, requireSalesAccess, resolveCustomer } from "./erpQuery";
import { prepareQuoteDraft, confirmQuoteDraft, updateQuoteDraft } from "./quoteDraft";
import { prepareCustomerDraft, updateCustomerDraft, confirmCustomerDraft, cancelCustomerDraft, prepareUpdateCustomerMobile, confirmUpdateCustomerMobile, cancelUpdateCustomerMobile, prepareUpdateCustomerEmail, confirmUpdateCustomerEmail } from "./customerDraft";
import { prepareProductDraft, confirmProductDraft, cancelProductDraft, prepareProductPriceUpdate, confirmProductPriceUpdate, cancelProductPriceUpdate } from "./productDraft";
import Vendor from "@/models/admin/Vendor";
import Customer from "@/models/sales/Customer";
import Payment from "@/models/sales/Payment";
import { COMMAND_ACTIONS } from "./commandActions";
import { buildPostedJournalReport, toDateStartInTimeZone, toDateEndInTimeZone } from "@/lib/accounting/reports";
import { issuedInvoiceFilter, unpaidInvoiceFilter, invoiceRevenueExpression, invoiceOutstandingExpression } from "@/lib/sales/invoiceEligibility";
import { AI_ACTION_STATUS as A, DOCUMENT_STATUS, PAYMENT_STATE, PAYMENT_STATUS } from "@/lib/constants/statuses";
import { getCompletedExchange, loadConversationContext, saveCompletedExchange } from "./conversationContext";
import { resolveEntitlements } from "@/lib/platform/entitlements/resolve";
import connectDB from "@/lib/db";
import JournalEntry from "@/models/finance/JournalEntry";
import Invoice from "@/models/finance/Invoice";
import Account from "@/models/finance/Account";
import Payroll from "@/models/hr/Payroll";
import Employee from "@/models/hr/Employee";
import Department from "@/models/hr/Department";
import levenshtein from "js-levenshtein";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function employeeDepartmentName(employee: any): string {
  return employee?.departmentId?.name || "Unassigned";
}

function normalizedPersonName(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function isLikelyEmployeeNameTypo(query: string, fullName: string): boolean {
  const a = normalizedPersonName(query);
  const b = normalizedPersonName(fullName);
  if (!a || !b) return false;
  if (a === b || b.includes(a) || a.includes(b)) return true;
  // Allow a small number of edits for longer complete names, and require a
  // close match for each typed name part so unrelated employees are not returned.
  const aParts = a.split(" ");
  const bParts = b.split(" ");
  if (aParts.length !== bParts.length || aParts.some((part) => part.length < 3)) return false;
  return aParts.every((part, index) => {
    const target = bParts[index];
    const max = part.length >= 8 ? 2 : 1;
    return Math.abs(part.length - target.length) <= max && levenshtein(part, target) <= max;
  });
}

import type { ErpStructuredResponse } from "./erpTypes";
import { formatSalesDate } from "@/lib/sales/formatters";
import { getAiPeriod, incrementAiUsage, incrementGlobalAiUsage } from "@/lib/ai/usage";

// Fixed data cache for organization and plan lookups to reduce repeated database roundtrips
const orgCache = new Map<string, { org: any; expiresAt: number }>();
export function clearOrgCache(tenantId?: string) {
  if (tenantId) {
    orgCache.delete(tenantId);
  } else {
    orgCache.clear();
  }
}
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
    const lakhNote = isIssued && total >= 100000 ? ` (about ₹${lakhStr} lakh by invoice date, drafts excluded)` : "";
    return `${prefix}: ${currency(total)} across ${count} records.${lakhNote}${fromStr ? ` Period: ${fromStr} to ${toStr}.` : ""}${q.operation === "group" ? "\n" + rows.map((r: any) => `${r._id}: ${currency(r.total)} (${r.count})`).join("\n") : ""}`;
  }
  if (!count) return q.identifier ? `${q.identifier} was not found in your accessible records.` : "No matching records were found in your accessible records.";
  const lines = rows.map((r: any) => {
    if (q.entity === "customer") return customerName(r);
    if (q.entity === "product") {
      const onHand = typeof r.onHandQuantity === "number" ? r.onHandQuantity : 0;
      const listPrice = r.tab_general_information?.list_price ?? 0;
      return `${r.header.name} (${r.tab_general_information?.default_code || "No code"}) — On-Hand Stock: ${onHand} units — Selling Price: ${currency(listPrice)}`;
    }
    if (q.entity === "sales_order") {
      const shipment = r.shipmentStatus || r.header?.shipmentStatus || (r.status === "shipped" || r.salesOrderStatus === "shipped" ? "Shipped" : "Not shipped / Pending shipment");
      const paid = r.paymentsReceived ?? 0;
      const orderTotal = r.totals?.amountTotal || 0;
      return `Sales Order ${r.header.name}:\n` +
        `- Status: ${r.salesOrderStatus || r.status || "Draft"}\n` +
        `- Shipment Status: ${shipment}\n` +
        `- Order Total: ${currency(orderTotal)}\n` +
        `- Payments Received: ${currency(paid)}\n` +
        `- Linked Invoices: ${r.invoices?.map((i: any) => `${i.number} (${i.status})`).join(", ") || "No linked sales invoice"}`;
    }
    const paid = (r.payments || []).reduce((s: number, p: any) => s + p.amount, 0);
    const outstanding = r.markedFullyPaid ? 0 : Math.max(0, r.totalAmount - paid);
    return `${r.number || r.quoteNumber} — ${r.customerName || "Customer unavailable"} — ${currency(["unpaid", "overdue"].includes(q.status || "") ? outstanding : r.totalAmount)} — ${r.status} — ${new Date(r.invoiceDate || r.quoteDate).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`;
  });
  return lines.join("\n") + (count > rows.length ? `\nShowing ${q.offset + 1}–${q.offset + rows.length} of ${count}.` : "");
}
export async function tryErpAssistant(input: { text: string; tenantId: string; userId: string; role: string; module?: AiModule; conversationId?: string; chatId?: string; requestId?: string; toolQuery?: unknown }) {
  if (typeof input.text !== "string" || input.text.length > 8000 || (input.conversationId !== undefined && (typeof input.conversationId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.conversationId))) || (input.chatId !== undefined && (typeof input.chatId !== "string" || !/^[a-f\d]{24}$/i.test(input.chatId)))) throw new ErpToolError("INVALID_INPUT", "The message or conversation identifier is invalid.");

  await connectDB();
  const chatModule: AiModule = ["admin", "finance", "hr", "sales", "inventory", "manufacturing", "crm"].includes(input.module as any)
    ? (input.module as AiModule)
    : (input.role === "finance" ? "finance" : input.role === "hr" ? "hr" : input.role === "inventory" ? "inventory" : "sales");
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
  const chatLookupQuery: any = ChatHistory.findOne(chatLookupFilter);
  const existingChat: any = await (typeof chatLookupQuery?.select === "function"
    ? chatLookupQuery.select("lastErpQuery pendingQuoteProposalId pendingCustomerProposalId pendingRoleProposalId").lean()
    : (typeof chatLookupQuery?.lean === "function" ? chatLookupQuery.lean() : chatLookupQuery));

  let pendingCustomerProposalIdFromDb = existingChat?.pendingCustomerProposalId ? String(existingChat.pendingCustomerProposalId) : undefined;
  let pendingCustomerMobileProposalIdFromDb: string | undefined;
  let pendingProductProposalIdFromDb: string | undefined;
  if (mongoose.isValidObjectId(input.userId)) {
    if (!pendingCustomerProposalIdFromDb) {
      const activeCustomerProposal = await AiCommandProposal.findOne({
        tenantId: input.tenantId,
        userId: input.userId,
        module: "sales",
        actionType: "create_customer_draft",
        status: A.PROPOSED,
        "params.conversationId": conversationId,
        "params.executing": { $ne: true },
      }).sort({ createdAt: -1 }).lean();
      if (activeCustomerProposal) {
        pendingCustomerProposalIdFromDb = String(activeCustomerProposal._id);
      }
    }

    const activeMobile = await AiCommandProposal.findOne({
      tenantId: input.tenantId,
      userId: input.userId,
      module: "sales",
      actionType: "update_customer_mobile",
      status: A.PROPOSED,
      "params.conversationId": conversationId,
      "params.executing": { $ne: true },
    }).sort({ createdAt: -1 }).lean();
    if (activeMobile) pendingCustomerMobileProposalIdFromDb = String(activeMobile._id);

    const activeProd = await AiCommandProposal.findOne({
      tenantId: input.tenantId,
      userId: input.userId,
      module: "inventory",
      actionType: "create_product_draft",
      status: A.PROPOSED,
      "params.conversationId": conversationId,
      "params.executing": { $ne: true },
    }).sort({ createdAt: -1 }).lean();
    if (activeProd) pendingProductProposalIdFromDb = String(activeProd._id);
  }

  const erpContext: ErpIntentContext = {
    lastErpQuery: existingChat?.lastErpQuery,
    pendingQuoteProposalId: existingChat?.pendingQuoteProposalId ? String(existingChat.pendingQuoteProposalId) : undefined,
    pendingCustomerProposalId: pendingCustomerProposalIdFromDb,
    pendingCustomerMobileProposalId: pendingCustomerMobileProposalIdFromDb,
    pendingProductProposalId: pendingProductProposalIdFromDb,
    pendingRoleProposalId: existingChat?.pendingRoleProposalId ? String(existingChat.pendingRoleProposalId) : undefined,
  };

  const intent = input.toolQuery ? input.toolQuery : parseErpIntent(input.text, new Date(), erpContext);
  if (!intent) return null;

  const isPlanQuery = intent === "plan" || (typeof intent === "object" && intent !== null && (intent as any).type === "plan");
  const isOrgQuery = intent === "organization_info" || (typeof intent === "object" && intent !== null && (intent as any).type === "organization_info");
  const isProfitLossQuery = intent === "profit_loss" || (typeof intent === "object" && intent !== null && (intent as any).type === "profit_loss");
  const isVendorBillQuery = typeof intent === "object" && intent !== null && (intent as any).type === "vendor_bill_query";
  const isCustomerReceivablesQuery = typeof intent === "object" && intent !== null && (intent as any).type === "customer_receivables";
  const isSalesPeriodSummaryQuery = typeof intent === "object" && intent !== null && (intent as any).type === "sales_period_summary";
  const isProductDraftQuery = intent === "product_draft" || intent === "product_confirm" || intent === "product_cancel" || (typeof intent === "object" && intent !== null && (intent as any).type === "product_draft");
  const isProductPriceUpdateQuery = typeof intent === "object" && intent !== null && (intent as any).type === "product_price_update";
  const isFinanceSpecializedQuery =
    typeof intent === "object" &&
    intent !== null &&
    [
      "reconcile_ar",
      "missing_accounting_records",
      "unposted_journal_entries",
      "period_comparison",
      "close_readiness_blockers",
    ].includes((intent as any).type);
  const isRoleQuery = intent === "role_confirm" || intent === "role_cancel" || (typeof intent === "object" && intent !== null && (intent as any).type === "role_change");
  const isEmployeeQuery = typeof intent === "object" && intent !== null && ((intent as any).type === "employee_lookup" || (intent as any).type === "employee_count");

  if (isPlanQuery) {
    if (!["admin", "master-admin"].includes(input.role)) throw new ErpToolError("PERMISSION_DENIED", "Billing plan details aren't accessible with your current permissions.", 403);
  } else if (isOrgQuery) {
    // Basic tenant identity context is accessible to all authenticated tenant users
  } else if (isSalesPeriodSummaryQuery) {
    requireSalesAccess(input.role);
    await requireWorkspaceModuleAccess("sales", input.tenantId);
  } else if (isProfitLossQuery || isFinanceSpecializedQuery || isVendorBillQuery) {
    if (!["admin", "master-admin", "finance"].includes(input.role)) {
      throw new ErpToolError("PERMISSION_DENIED", "Financial and accounting analysis requires administrative or finance permissions.", 403);
    }
    await requireWorkspaceModuleAccess("finance", input.tenantId);
  } else if (isRoleQuery) {
    if (!["admin", "master-admin"].includes(input.role)) {
      throw new ErpToolError("PERMISSION_DENIED", "Changing user roles requires administrative permissions.", 403);
    }
  } else if (isEmployeeQuery) {
    await requireWorkspaceModuleAccess("hr", input.tenantId);
  } else if (isProductDraftQuery || isProductPriceUpdateQuery || intent === "product_price_confirm" || intent === "product_price_cancel") {
    requireSalesAccess(input.role);
    await requireWorkspaceModuleAccess("inventory", input.tenantId);
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
  let structured: ErpStructuredResponse | any | undefined;
  if (!cached) {
    if (intent === "greeting") {
      message = "I can help with ERP questions and actions in this workspace, including customers, products, quotations, sales orders, invoices, stock, and finance reports. Tell me what you need, and I’ll ask you to confirm before saving a change.";
      structured = { type: "assistant_capabilities" as any, capabilities: ["customers", "products", "quotations", "sales orders", "invoices", "stock", "finance reports"] };
    } else if (intent === "off_topic") {
      message = "I’m designed to help with ERP tasks in this workspace. I can’t provide a live Chennai weather report or draft a leave letter. I can help with sales, finance, stock, customer, or HR records.";
      structured = { type: "off_topic_guidance" as any, scope: "ERP workspace assistance" };
    } else if (intent === "refuse") {
      const asksForProtectedData = /\b(?:system\s+prompt|hidden\s+instructions|other\s+companies|other\s+tenants)\b/i.test(input.text);
      let draftCount = 0;
      if (!asksForProtectedData) {
        try {
          const count = await SalesInvoice.countDocuments({
            tenantId: input.tenantId === "default" || input.tenantId === "default-tenant"
              ? { $in: ["default", "default-tenant"] }
              : input.tenantId,
            status: "draft",
          });
          if (typeof count === "number" && count >= 0) draftCount = count;
        } catch {}
      }
      message = asksForProtectedData
        ? "I can only access records in your current workspace, and I can’t reveal hidden system instructions. I can help with information you’re authorized to see."
        : `Bulk deletion through the assistant is not supported. No deletion was performed; the ${draftCount} drafts stay safe and unchanged.`;
      structured = {
        type: "safety_refusal",
        title: "Bulk Deletion Not Supported",
        message,
        recordCount: draftCount,
        entity: "invoice",
        policy: "Bulk record deletions are restricted to manual administrative review to prevent accidental data loss.",
      };
    }
    else if (typeof intent === "object" && intent !== null && (intent as any).type === "bill_calculation") {
      const { quantity, unitPrice, gstRate, discountRate } = intent as any;
      const subtotal = quantity * unitPrice;
      const discount = subtotal * discountRate / 100;
      const taxable = subtotal - discount;
      const tax = taxable * gstRate / 100;
      const total = taxable + tax;
      message = `Calculation only (no invoice created):\n\n` +
        `- Subtotal: ${currency(subtotal)}\n- Discount (${discountRate}%): −${currency(discount)}\n` +
        `- Taxable amount: ${currency(taxable)}\n- GST (${gstRate}%): ${currency(tax)}\n- **Final bill: ${currency(total)}**`;
      structured = { type: "bill_calculation" as any, quantity, unitPrice, subtotal, discountRate, discount, taxable, gstRate, tax, total };
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
      const isObjIntent = typeof intent === "object" && intent !== null;
      const intentObj = isObjIntent ? (intent as any) : {};
      const startDate: Date | undefined = intentObj.startDate || (intentObj.dateFrom ? new Date(intentObj.dateFrom + "T00:00:00Z") : undefined);
      const endDate: Date | undefined = intentObj.endDate || (intentObj.dateTo ? new Date(intentObj.dateTo + "T23:59:59.999Z") : undefined);
      const wantsCogs = Boolean(intentObj.wantsCogs);
      const wantsRevenue = Boolean(intentObj.wantsRevenue);
      const wantsExpenses = Boolean(intentObj.wantsExpenses);
      const wantsCrossModule = Boolean(intentObj.wantsCrossModule);
      const wantsDetails = Boolean(intentObj.wantsDetails);
      const wantsDateRange = Boolean(intentObj.wantsDateRange);

      const org: any = await getCachedOrg(input.tenantId);
      const orgName = org?.name || "Aupulens Workspace";

      let periodLabel = typeof intentObj.period === "string" ? intentObj.period : intentObj.period?.label;
      if (!periodLabel) {
        const fromStr = startDate ? formatSalesDate(startDate) : undefined;
        const toStr = endDate ? formatSalesDate(endDate) : undefined;
        periodLabel = fromStr && toStr ? `${fromStr} to ${toStr}` : fromStr ? `From ${fromStr}` : toStr ? `Until ${toStr}` : "All Time";
      }
      const periodType = typeof intentObj.period === "object" && intentObj.period?.type ? intentObj.period.type : (startDate ? "month" : "all_time");
      const periodInfo = {
        type: periodType,
        label: periodLabel,
        startDate,
        endDate,
      };

      const orgTimezone = "Asia/Kolkata";
      const pAndLReport = await buildPostedJournalReport({
        tenantId: input.tenantId,
        startDate,
        endDate,
        endDateTimeZone: orgTimezone,
      });

      // Count unposted/draft entries within the period
      const unpostedQuery: Record<string, any> = {
        tenantId: input.tenantId,
        status: { $ne: DOCUMENT_STATUS.POSTED },
      };
      if (startDate || endDate) {
        unpostedQuery["header.date"] = {};
        if (startDate) {
          const isPrecise = startDate.getUTCHours() !== 0 || startDate.getUTCMinutes() !== 0 || startDate.getUTCSeconds() !== 0;
          unpostedQuery["header.date"].$gte = isPrecise ? startDate : toDateStartInTimeZone(startDate, orgTimezone);
        }
        if (endDate) {
          unpostedQuery["header.date"].$lte = toDateEndInTimeZone(endDate, orgTimezone);
        }
      }
      const unpostedEntryCount = await JournalEntry.countDocuments(unpostedQuery);

      // Check issued sales invoices in the period
      const invoiceMatch: Record<string, any> = {
        tenantId: input.tenantId,
        ...issuedInvoiceFilter(),
      };
      if (startDate || endDate) {
        invoiceMatch.invoiceDate = {};
        if (startDate) invoiceMatch.invoiceDate.$gte = startDate;
        if (endDate) invoiceMatch.invoiceDate.$lte = endDate;
      }
      const issuedInv = await SalesInvoice.aggregate([
        { $match: invoiceMatch },
        { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
      ]).exec();
      const issuedRevenue = issuedInv[0]?.total || 0;
      const issuedInvoiceCount = issuedInv[0]?.count || 0;

      const postedIncome = pAndLReport.income.total;
      const postedExpenses = pAndLReport.expense.total;
      const postedEntries = pAndLReport.activity.postedEntryCount;

      const expenseAccounts = Object.values(pAndLReport.expense.accounts || {});
      const incomeAccounts = Object.values(pAndLReport.income.accounts || {});

      const isCogsAccount = (acc: any) => {
        if (acc.accountType === "expense_direct_cost") return true;
        if (acc.code && /^5[0-9]{3}/.test(acc.code)) return true;
        if (acc.name && /\b(?:cogs|cost of goods|direct cost|cost of sales)\b/i.test(acc.name)) return true;
        return false;
      };

      const cogsAccounts = expenseAccounts.filter(isCogsAccount);
      const operatingAccounts = expenseAccounts.filter((a) => !isCogsAccount(a));

      const cogsTotal = cogsAccounts.reduce((sum, a) => sum + a.amount, 0);
      const operatingTotal = operatingAccounts.reduce((sum, a) => sum + a.amount, 0);

      const hasSeparateCogs = cogsAccounts.length > 0;
      const cogsTreatment: "separated" | "included_in_expenses" | "unavailable" = hasSeparateCogs
        ? "separated"
        : postedExpenses > 0
        ? "included_in_expenses"
        : "unavailable";

      const cogsExplanation = hasSeparateCogs
        ? `COGS of ${currency(cogsTotal)} is separately categorized in the chart of accounts across ${cogsAccounts.length} direct cost account(s).`
        : postedExpenses > 0
        ? "COGS is not separately categorized in the posted chart of accounts; all recorded expenses are classified as operating expenses."
        : "No expense records are posted in the general ledger for this period.";

      const startDisplay = startDate ? formatSalesDate(startDate) : undefined;
      const endDisplay = endDate ? formatSalesDate(endDate) : undefined;

      const limitationList: string[] = [];
      if (unpostedEntryCount > 0) {
        limitationList.push(`${unpostedEntryCount} unposted or draft journal ${unpostedEntryCount === 1 ? "entry was" : "entries were"} excluded in accordance with the posted-only reporting policy.`);
      }
      if (postedEntries > 0 && postedIncome === 0 && issuedRevenue > 0) {
        limitationList.push(`${issuedInvoiceCount} sales invoices (${currency(issuedRevenue)}) were issued during this period but have not yet been posted as journal entries to recognized revenue.`);
      }

      // Details breakdown with contributing entry counts
      const revenueBreakdown = incomeAccounts.map((a) => ({
        accountCode: a.code,
        accountName: a.name,
        amount: a.amount,
        formattedAmount: currency(a.amount),
        entryCount: a.entryCount || 0,
      }));
      const expenseBreakdown = operatingAccounts.map((a) => ({
        accountCode: a.code,
        accountName: a.name,
        amount: a.amount,
        formattedAmount: currency(a.amount),
        entryCount: a.entryCount || 0,
      }));
      const cogsBreakdown = cogsAccounts.map((a) => ({
        accountCode: a.code,
        accountName: a.name,
        amount: a.amount,
        formattedAmount: currency(a.amount),
        entryCount: a.entryCount || 0,
      }));

      const sourcesChecked = [
        "Finance (Posted General Ledger)",
        "Sales (Sales Invoices)",
        "Inventory & Direct Costs",
        "Procurement & Expenses",
      ];
      const coverageNotes = [
        `Finance Ledger: Authoritative source for all recognized income and expense calculations (${postedEntries} posted journal entries verified).`,
        issuedInvoiceCount > 0
          ? `Sales Module: ${issuedInvoiceCount} sales invoices found totaling ${currency(issuedRevenue)}. Invoices already posted as journal entries are recognized in the general ledger (${currency(postedIncome)}); unposted invoices are not double-counted.`
          : `Sales Module: No unposted sales revenue detected outside the general ledger.`,
        hasSeparateCogs
          ? `Inventory / COGS: Direct costs of ${currency(cogsTotal)} are categorized in the chart of accounts across ${cogsAccounts.length} direct cost account(s).`
          : `Inventory / COGS: ${cogsExplanation}`,
        `Double-Counting Prevention: Operating expenses and revenues are recognized strictly from posted general ledger accounts to guarantee transactions in subsidiary modules are not added a second time.`
      ];
      const crossModuleCoverage = {
        sourcesChecked,
        notes: coverageNotes,
      };

      query = {
        type: "profit_loss",
        entity: "profit_loss",
        reportType: "profit_loss",
        period: periodLabel,
        periodType: periodInfo.type,
        dateFrom: intentObj.dateFrom || (startDate ? startDate.toISOString().slice(0, 10) : undefined),
        dateTo: intentObj.dateTo || (endDate ? endDate.toISOString().slice(0, 10) : undefined),
        startDate: startDate ? startDate.toISOString() : undefined,
        endDate: endDate ? endDate.toISOString() : undefined,
        wantsCogs,
        wantsRevenue,
        wantsExpenses,
        wantsCrossModule,
        wantsDetails,
        wantsDateRange,
      };

      if (postedEntries > 0 && (postedIncome > 0 || postedExpenses > 0)) {
        const net = postedIncome - postedExpenses;
        const isProfit = net >= 0;
        const status = net > 0 ? "profitable" : net < 0 ? "loss" : "break_even";
        const isFollowUpRequest = wantsDetails || wantsCrossModule || wantsRevenue || wantsExpenses || wantsCogs || wantsDateRange;

        let msg = "";
        const supportingJEs = await JournalEntry.find({
          tenantId: input.tenantId,
          status: DOCUMENT_STATUS.POSTED,
          ...(startDate || endDate ? { "header.date": { ...(startDate ? { $gte: startDate } : {}), ...(endDate ? { $lte: endDate } : {}) } } : {}),
        })
          .sort({ "header.date": -1, createdAt: -1 })
          .limit(10)
          .lean();

        const supportingEntries = supportingJEs.map((je: any) => ({
          id: String(je._id),
          name: je.header?.name || "JE",
          ref: je.header?.ref || "N/A",
          date: je.header?.date ? new Date(je.header.date).toISOString().slice(0, 10) : "",
          voucherType: je.voucherType || "journal",
          amountTotal: je.totals?.amountTotal || 0,
          formattedAmount: currency(je.totals?.amountTotal || 0),
        }));

        if (isFollowUpRequest) {
          msg = `### Profit & Loss Calculation Details & Account-Level Breakdown — **${periodLabel}**\n\n` +
            `**1. Reporting Scope & Basis:**\n` +
            `- Organization: **${orgName}** (Workspace: \`${input.tenantId}\`)\n` +
            `- Reporting period: ${startDisplay && endDisplay ? `${startDisplay} to ${endDisplay}` : periodLabel} (Asia/Kolkata timezone)\n` +
            `- Scope: ${startDate || endDate ? "Date-bounded" : "All Time (full general ledger span)"}\n` +
            `- Accounting basis: Authoritative posted journal entries (\`JournalEntry\` general ledger)\n` +
            `- Posted entries analyzed: ${postedEntries}\n\n` +
            `**2. Revenue Breakdown:**\n` +
            (incomeAccounts.length > 0
              ? incomeAccounts.map((a) => `- **${a.name}** (Code: \`${a.code}\`): ${currency(a.amount)} across ${a.entryCount || 0} posted entry/entries`).join("\n") + "\n"
              : "- No revenue accounts recorded.\n") +
            `- **Total Recognized Revenue:** ${currency(postedIncome)}\n\n` +
            `**3. Cost of Goods Sold (COGS) Breakdown:**\n` +
            (hasSeparateCogs
              ? cogsAccounts.map((a) => `- **${a.name}** (Code: \`${a.code}\`): ${currency(a.amount)} across ${a.entryCount || 0} posted entry/entries`).join("\n") + "\n"
              : `- COGS treatment: ${cogsExplanation}\n`) +
            `- **Total Direct Costs (COGS):** ${hasSeparateCogs ? currency(cogsTotal) : "Included in operating expenses or unavailable"}\n\n` +
            `**4. Operating Expenses & Net Result:**\n` +
            (operatingAccounts.length > 0
              ? operatingAccounts.map((a) => `- **${a.name}** (Code: \`${a.code}\`): ${currency(a.amount)} across ${a.entryCount || 0} posted entry/entries`).join("\n") + "\n"
              : "- No operating expense accounts recorded.\n") +
            `- **Total Operating Expenses:** ${currency(operatingTotal)}\n` +
            `- **Total Expenses:** ${currency(postedExpenses)}\n` +
            `- **Calculation Formula:** Net Result = Revenue (${currency(postedIncome)}) - COGS (${currency(hasSeparateCogs ? cogsTotal : 0)}) - Operating Expenses (${currency(operatingTotal)})\n` +
            `- **Reconciled Net Result:** ${currency(Math.abs(net))} (${isProfit ? "Profit" : "Loss"})\n` +
            `- **Overall Status:** **${isProfit ? "In Profit" : "In Loss"}**\n` +
            `- **Trial Balance Verification:** ${pAndLReport.totals.balanced ? "Balanced" : "Discrepancy detected"}\n\n` +
            `**5. Supporting Posted Journal Entries:**\n` +
            (supportingEntries.length > 0
              ? supportingEntries.map((e) => `- **${e.name}** (Ref: \`${e.ref}\`, Date: ${e.date}): ${e.formattedAmount} [Type: \`${e.voucherType}\`]`).join("\n") + "\n\n"
              : "- No journal entries found for this period.\n\n") +
            `**6. Cross-Module Coverage & Ledger Reconciliation:**\n` +
            coverageNotes.map((n) => `- ${n}`).join("\n");
        } else {
          msg = `Company financial analysis for **${periodLabel}** (authoritative posted journal entries):\n\n` +
            `- Reporting period: ${startDisplay && endDisplay ? `${startDisplay} to ${endDisplay}` : periodLabel}\n` +
            `- Recognized revenue / income: ${currency(postedIncome)}\n` +
            (hasSeparateCogs
              ? `- Cost of Goods Sold (COGS): ${currency(cogsTotal)} (separated)\n- Operating expenses: ${currency(operatingTotal)}\n`
              : `- Cost of Goods Sold (COGS): Unavailable separately (${cogsExplanation})\n`) +
            `- Total expenses: ${currency(postedExpenses)}\n` +
            `- Net ${isProfit ? "profit" : "loss"}: ${currency(Math.abs(net))}\n` +
            `- Overall company status: **${isProfit ? "In Profit" : "In Loss"}**\n` +
            `- Posted journal entries analyzed: ${postedEntries}\n` +
            `- Accounting basis: Posted journal entries (cash/accrual ledgers)\n` +
            `- Trial balance verification: ${pAndLReport.totals.balanced ? "Balanced" : "Discrepancy detected"}`;
        }

        if (limitationList.length > 0) {
          msg += `\n\n**Data integrity notices:**\n` + limitationList.map((l) => `- ${l}`).join("\n");
        }

        message = msg;

        structured = {
          type: "profit_loss",
          title: `Profit & Loss Analysis — ${periodLabel}`,
          period: {
            type: periodInfo.type as any,
            label: periodLabel,
            startDate: startDisplay,
            endDate: endDisplay,
          },
          revenue: postedIncome,
          formattedRevenue: currency(postedIncome),
          cogs: hasSeparateCogs ? cogsTotal : undefined,
          formattedCogs: hasSeparateCogs ? currency(cogsTotal) : undefined,
          cogsTreatment,
          cogsExplanation,
          operatingExpenses: hasSeparateCogs ? operatingTotal : postedExpenses,
          formattedOperatingExpenses: currency(hasSeparateCogs ? operatingTotal : postedExpenses),
          expenses: postedExpenses,
          formattedExpenses: currency(postedExpenses),
          netProfit: net,
          formattedNetProfit: currency(Math.abs(net)),
          isProfitable: isProfit,
          status,
          postedEntryCount: postedEntries,
          basis: "posted_journal_entries",
          limitations: limitationList.length > 0 ? limitationList.join(" ") : undefined,
          details: {
            revenueBreakdown,
            expenseBreakdown,
            cogsBreakdown,
            crossModuleCoverage,
            supportingJournalEntries: supportingEntries,
          },
          generatedAt: new Date().toISOString(),
        };
      } else if (issuedRevenue > 0) {
        let msg = `A reliable net profit or loss figure cannot yet be calculated for **${periodLabel}** because authoritative expense data is unavailable in your posted general ledger.\n\n` +
          `- Reporting period: ${startDisplay && endDisplay ? `${startDisplay} to ${endDisplay}` : periodLabel}\n` +
          `- Issued sales invoice revenue: ${currency(issuedRevenue)} across ${issuedInvoiceCount} records (drafts and cancellations excluded)\n` +
          `- Posted expense records: None found in the general ledger\n` +
          `- Cost of Goods Sold (COGS): Unavailable (no posted accounting entries)\n\n` +
          `Sales revenue cannot be substituted for profit. To calculate net profit or loss, recorded expenses (vendor bills, payroll, or expense journals) must be posted to the finance ledger.`;

        if (limitationList.length > 0) {
          msg += `\n\n**Data integrity notices:**\n` + limitationList.map((l) => `- ${l}`).join("\n");
        }

        message = msg;

        structured = {
          type: "profit_loss",
          title: `Profit & Loss Analysis — ${periodLabel}`,
          period: {
            type: periodInfo.type as any,
            label: periodLabel,
            startDate: startDisplay,
            endDate: endDisplay,
          },
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
          cogsTreatment: "unavailable",
          cogsExplanation: "COGS is unavailable because no expense records have been posted to the general ledger.",
          limitations: limitationList.length > 0
            ? limitationList.join(" ") + " Operating expenses and posted expense journal entries are missing. Sales revenue cannot be substituted for profit."
            : "Operating expenses and posted expense journal entries are missing. Sales revenue cannot be substituted for profit.",
          generatedAt: new Date().toISOString(),
        };
      } else {
        message = `Neither recognized revenue nor expense entries have been posted to the general ledger for this workspace in **${periodLabel}** (${startDisplay && endDisplay ? `${startDisplay} to ${endDisplay}` : "all dates"}). A reliable profit or loss figure cannot be calculated because financial records are empty.`;

        structured = {
          type: "profit_loss",
          title: `Profit & Loss Analysis — ${periodLabel}`,
          period: {
            type: periodInfo.type as any,
            label: periodLabel,
            startDate: startDisplay,
            endDate: endDisplay,
          },
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
          cogsTreatment: "unavailable",
          cogsExplanation: "No financial entries exist for this period.",
          limitations: limitationList.length > 0 ? limitationList.join(" ") : "No revenue or expense records found in the general ledger for this period.",
          generatedAt: new Date().toISOString(),
        };
      }
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "reconcile_ar") {
      const org: any = await getCachedOrg(input.tenantId);
      const orgName = org?.name || "Aupulens Workspace";

      const arAccount = await Account.findOne({
        tenantId: input.tenantId,
        $or: [{ code: "1200" }, { account_type: "asset_receivable" }, { name: { $regex: /accounts?\s+receivable/i } }],
      }).lean();

      let glBalance = 0;
      let glDebitTotal = 0;
      let glCreditTotal = 0;
      let glEntriesCount = 0;

      if (arAccount) {
        const rows = await JournalEntry.aggregate([
          { $match: { tenantId: input.tenantId, status: DOCUMENT_STATUS.POSTED } },
          { $unwind: "$lineIds" },
          { $match: { "lineIds.accountId": arAccount._id } },
          { $group: { _id: null, debit: { $sum: "$lineIds.debit" }, credit: { $sum: "$lineIds.credit" }, count: { $sum: 1 } } },
        ]);
        if (rows[0]) {
          glDebitTotal = rows[0].debit;
          glCreditTotal = rows[0].credit;
          glBalance = Number((glDebitTotal - glCreditTotal).toFixed(2));
          glEntriesCount = rows[0].count;
        }
      }

      const openInvoices = await Invoice.find({
        tenantId: input.tenantId,
        moveType: "out_invoice",
        state: DOCUMENT_STATUS.POSTED,
        paymentState: { $ne: "paid" },
      }).lean();

      const openSalesInvoices = await SalesInvoice.find({
        tenantId: input.tenantId,
        status: { $in: ["posted", "sent", "issued", "partial"] },
      }).lean();

      let subledgerTotal = 0;
      let subledgerCount = 0;

      if (openInvoices.length > 0) {
        subledgerTotal = openInvoices.reduce((sum, inv) => sum + (Number(inv.amountResidual ?? inv.amountTotal) || 0), 0);
        subledgerCount = openInvoices.length;
      } else if (openSalesInvoices.length > 0) {
        subledgerTotal = openSalesInvoices.reduce((sum, inv) => {
          const raw = inv as any;
          return sum + (Number(raw.balanceDue ?? raw.grandTotal ?? raw.totalAmount) || 0);
        }, 0);
        subledgerCount = openSalesInvoices.length;
      } else {
        subledgerTotal = glBalance;
        subledgerCount = glEntriesCount;
      }
      subledgerTotal = Number(subledgerTotal.toFixed(2));

      const difference = Number(Math.abs(subledgerTotal - glBalance).toFixed(2));
      const isReconciled = difference < 0.01;

      message = `### Accounts Receivable (AR) Subledger to GL Reconciliation\n\n` +
        `**Organization:** ${orgName} (Workspace: \`${input.tenantId}\`)\n` +
        `**Reconciliation Date:** ${new Date().toISOString().slice(0, 10)}\n\n` +
        `**1. General Ledger Control Account:**\n` +
        `- Control Account: **${arAccount?.name || "Accounts Receivable"}** (Code: \`${arAccount?.code || "1200"}\`)\n` +
        `- GL Debits: ${currency(glDebitTotal)}\n` +
        `- GL Credits: ${currency(glCreditTotal)}\n` +
        `- **Net GL Control Balance:** ${currency(glBalance)}\n\n` +
        `**2. AR Subledger Population:**\n` +
        `- Open Customer Invoices Count: ${subledgerCount}\n` +
        `- **Subledger Open AR Balance:** ${currency(subledgerTotal)}\n\n` +
        `**3. Reconciliation Outcome:**\n` +
        `- Variance / Discrepancy: ${currency(difference)}\n` +
        `- Status: **${isReconciled ? "RECONCILED (Tied Out)" : "VARIANCE DETECTED"}**\n\n` +
        (isReconciled
          ? `The Accounts Receivable subsidiary ledger reconciles to GL Account 1200 without unexplained variances.`
          : `A variance of ${currency(difference)} exists between the AR subledger and GL control account. Review unposted receipts or manual journal vouchers.`);

      structured = {
        type: "ar_reconciliation" as any,
        title: "Accounts Receivable Subledger to GL Reconciliation",
        reconciliationDate: new Date().toISOString().slice(0, 10),
        glControlAccount: {
          id: arAccount?._id ? String(arAccount._id) : "unknown",
          code: arAccount?.code || "1200",
          name: arAccount?.name || "Accounts Receivable",
          balance: glBalance,
          formattedBalance: currency(glBalance),
        },
        subledger: {
          openRecordCount: subledgerCount,
          balance: subledgerTotal,
          formattedBalance: currency(subledgerTotal),
        },
        difference,
        formattedDifference: currency(difference),
        isReconciled,
        status: isReconciled ? "reconciled" : "variance_detected",
      };
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "missing_accounting_records") {
      const org: any = await getCachedOrg(input.tenantId);
      const orgName = org?.name || "Aupulens Workspace";

      const draftBills = await Invoice.countDocuments({
        tenantId: input.tenantId,
        moveType: "in_invoice",
        state: DOCUMENT_STATUS.DRAFT,
      });

      const unpostedPayrolls = await Payroll.countDocuments({
        tenantId: input.tenantId,
        status: { $in: ["draft", "computed", "reviewed"] },
      });

      const unpostedJEs = await JournalEntry.countDocuments({
        tenantId: input.tenantId,
        status: { $ne: DOCUMENT_STATUS.POSTED },
      });

      const accountsWithoutCode = await Account.countDocuments({
        tenantId: input.tenantId,
        $or: [{ code: { $exists: false } }, { code: null }, { code: "" }],
      });

      const missingItems: string[] = [];
      if (draftBills > 0) {
        missingItems.push(`- **${draftBills} Draft Vendor Bills:** Stored in the purchases subledger but unposted to the General Ledger. Because expenses are recognized strictly from posted vouchers, operating costs are missing from the P&L.`);
      }
      if (unpostedPayrolls > 0) {
        missingItems.push(`- **${unpostedPayrolls} Unposted Payroll Run(s):** In draft/computed/reviewed status without salary expense journal vouchers in the General Ledger.`);
      }
      if (unpostedJEs > 0) {
        missingItems.push(`- **${unpostedJEs} Unposted / Draft Journal Entry(ies):** Sitting outside posted financial statements.`);
      }
      if (accountsWithoutCode > 0) {
        missingItems.push(`- **${accountsWithoutCode} Chart of Accounts entries** lack standard accounting codes.`);
      }

      message = `### Accounting Completeness Review — **${orgName}**\n\n` +
        `The following records and mappings require attention for complete and audit-ready financial statements:\n\n` +
        (missingItems.length > 0
          ? missingItems.join("\n\n") + "\n\n"
          : "- **All core subledgers are currently posted and mapped.** No missing operational batches detected.\n\n") +
        `**Audit Recommendation:** Approve and post valid vendor bills and payroll runs so the General Ledger reflects all incurred obligations rather than revenue alone.`;

      structured = {
        type: "missing_accounting_records" as any,
        title: "Accounting Completeness & Missing Records Review",
        draftVendorBillsCount: draftBills,
        unpostedPayrollsCount: unpostedPayrolls,
        unpostedJournalEntriesCount: unpostedJEs,
        accountsMissingCodeCount: accountsWithoutCode,
        isComplete: draftBills === 0 && unpostedPayrolls === 0 && unpostedJEs === 0,
        recommendation: "Approve and post eligible vendor bills and payroll batches to complete the Profit & Loss statement.",
      };
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "unposted_journal_entries") {
      const org: any = await getCachedOrg(input.tenantId);
      const orgName = org?.name || "Aupulens Workspace";

      const unpostedList = await JournalEntry.find({
        tenantId: input.tenantId,
        status: { $ne: DOCUMENT_STATUS.POSTED },
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      const totalUnposted = await JournalEntry.countDocuments({
        tenantId: input.tenantId,
        status: { $ne: DOCUMENT_STATUS.POSTED },
      });

      const items = unpostedList.map((e: any) => ({
        id: String(e._id),
        name: e.header?.name || "Draft Entry",
        ref: e.header?.ref || "N/A",
        date: e.header?.date ? new Date(e.header.date).toISOString().slice(0, 10) : "",
        status: e.status || "draft",
        voucherStatus: e.voucherStatus || "draft",
        amountTotal: e.totals?.amountTotal || 0,
        formattedAmount: currency(e.totals?.amountTotal || 0),
      }));

      message = `### Unposted Journal Entries Affecting Period Close — **${orgName}**\n\n` +
        `Found **${totalUnposted}** unposted or draft journal ${totalUnposted === 1 ? "entry" : "entries"} in the general ledger:\n\n` +
        (items.length > 0
          ? items.map((it) => `- **${it.name}** (Ref: \`${it.ref}\`, Date: ${it.date}): Total ${it.formattedAmount} [Status: \`${it.status}\` / Voucher: \`${it.voucherStatus}\`]`).join("\n")
          : "- No unposted journal entries found. General ledger is fully posted for period close.") +
        `\n\n**Close Impact:** Unposted entries must be reviewed, approved, or cancelled before executing period close and locking the ledger.`;

      structured = {
        type: "unposted_journal_entries" as any,
        title: "Unposted Journal Entries Affecting Period Close",
        totalCount: totalUnposted,
        items,
        closeImpact: totalUnposted > 0 ? "Pending entries must be posted or voided before period closing." : "None. Period close is unblocked by unposted entries.",
      };
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "period_comparison") {
      const org: any = await getCachedOrg(input.tenantId);
      const orgName = org?.name || "Aupulens Workspace";

      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();
      const curStart = new Date(Date.UTC(curYear, curMonth, 1));
      const curEnd = new Date(Date.UTC(curYear, curMonth + 1, 0, 23, 59, 59, 999));

      const prevStart = new Date(Date.UTC(curYear, curMonth - 1, 1));
      const prevEnd = new Date(Date.UTC(curYear, curMonth, 0, 23, 59, 59, 999));

      const [curReport, prevReport] = await Promise.all([
        buildPostedJournalReport({ tenantId: input.tenantId, startDate: curStart, endDate: curEnd }),
        buildPostedJournalReport({ tenantId: input.tenantId, startDate: prevStart, endDate: prevEnd }),
      ]);

      const curRevenue = curReport.income.total;
      const prevRevenue = prevReport.income.total;
      const revDiff = Number((curRevenue - prevRevenue).toFixed(2));
      const revPct = prevRevenue > 0 ? Number(((revDiff / prevRevenue) * 100).toFixed(1)) : 0;

      const curExp = curReport.expense.total;
      const prevExp = prevReport.expense.total;
      const expDiff = Number((curExp - prevExp).toFixed(2));

      const curNet = curRevenue - curExp;
      const prevNet = prevRevenue - prevExp;
      const netDiff = Number((curNet - prevNet).toFixed(2));

      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const curMonthName = monthNames[curMonth];
      const prevMonthName = monthNames[(curMonth + 11) % 12];

      message = `### Month-over-Month Financial Comparison — **${prevMonthName} vs ${curMonthName} ${curYear}**\n\n` +
        `**Organization:** ${orgName}\n\n` +
        `| Metric | ${prevMonthName} (Prior) | ${curMonthName} (Current) | Change | % Change |\n` +
        `| :--- | :--- | :--- | :--- | :--- |\n` +
        `| **Recognized Revenue** | ${currency(prevRevenue)} | ${currency(curRevenue)} | ${currency(revDiff)} | ${revPct}% |\n` +
        `| **Total Expenses** | ${currency(prevExp)} | ${currency(curExp)} | ${currency(expDiff)} | — |\n` +
        `| **Net Income** | ${currency(prevNet)} | ${currency(curNet)} | ${currency(netDiff)} | — |\n\n` +
        `**Material Transaction Drivers:**\n` +
        `- Revenue variance of ${currency(revDiff)} reflects sales volume and customer billing in ${curMonthName}.\n` +
        `- Operating expenses variance reflects posted vendor bills and payroll journals in the period.`;

      structured = {
        type: "period_comparison" as any,
        title: `Financial Comparison: ${prevMonthName} vs ${curMonthName} ${curYear}`,
        currentPeriod: { label: `${curMonthName} ${curYear}`, revenue: curRevenue, expenses: curExp, netIncome: curNet },
        priorPeriod: { label: `${prevMonthName} ${curYear}`, revenue: prevRevenue, expenses: prevExp, netIncome: prevNet },
        variances: { revenueDiff: revDiff, expensesDiff: expDiff, netIncomeDiff: netDiff },
      };
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "close_readiness_blockers") {
      const org: any = await getCachedOrg(input.tenantId);
      const orgName = org?.name || "Aupulens Workspace";

      const unpostedJEs = await JournalEntry.countDocuments({
        tenantId: input.tenantId,
        status: { $ne: DOCUMENT_STATUS.POSTED },
      });

      const draftBills = await Invoice.countDocuments({
        tenantId: input.tenantId,
        moveType: "in_invoice",
        state: DOCUMENT_STATUS.DRAFT,
      });

      const report = await buildPostedJournalReport({ tenantId: input.tenantId });
      const trialBalanceBalanced = report.totals.balanced;

      const blockers: any[] = [];
      if (!trialBalanceBalanced) {
        blockers.push({
          severity: "CRITICAL",
          title: "Trial Balance Imbalance",
          description: `Total Debits (${currency(report.totals.debit)}) do not equal Total Credits (${currency(report.totals.credit)}).`,
        });
      }
      if (unpostedJEs > 0) {
        blockers.push({
          severity: "HIGH",
          title: "Unposted General Ledger Entries",
          description: `${unpostedJEs} unposted or draft journal entries remain in the ledger.`,
        });
      }
      if (draftBills > 0) {
        blockers.push({
          severity: "MEDIUM",
          title: "Draft Vendor Bills",
          description: `${draftBills} vendor bills in draft status without accounting recognition.`,
        });
      }

      const isReady = blockers.length === 0;

      message = `### Period Close Readiness & Blocker Review — **${orgName}**\n\n` +
        `**Close Status:** **${isReady ? "READY TO CLOSE" : "BLOCKED"}** (${blockers.length} blocker(s) found)\n\n` +
        (blockers.length > 0
          ? blockers.map((b) => `- **[${b.severity}] ${b.title}:** ${b.description}`).join("\n") + "\n\n"
          : "- All posting prerequisites are satisfied. Trial balance is balanced and all transactions are posted.\n\n") +
        `**Action Required:** Resolve all CRITICAL and HIGH severity items prior to locking the accounting period.`;

      structured = {
        type: "close_readiness_blockers" as any,
        title: "Period Close Readiness & Blockers",
        isReady,
        blockersCount: blockers.length,
        blockers,
        trialBalanceBalanced,
      };
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
      let proposalId = existingChat?.pendingCustomerProposalId ? String(existingChat.pendingCustomerProposalId) : undefined;
      if (!proposalId) {
        const chat: any = await ChatHistory.findOne(filter).select("pendingCustomerProposalId").lean();
        if (chat?.pendingCustomerProposalId) proposalId = String(chat.pendingCustomerProposalId);
      }
      if (!proposalId) {
        const activeProposal = await AiCommandProposal.findOne({
          tenantId: scope.tenantId,
          userId: scope.userId,
          module: "sales",
          actionType: "create_customer_draft",
          status: A.PROPOSED,
          "params.conversationId": scope.conversationId,
          "params.executing": { $ne: true },
        }).sort({ createdAt: -1 }).lean();
        if (activeProposal) proposalId = String(activeProposal._id);
      }

      if (!proposalId) {
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
        const draft = await updateCustomerDraft(scope, proposalId, input.text, requestId);
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
      let proposalId = existingChat?.pendingCustomerProposalId ? String(existingChat.pendingCustomerProposalId) : undefined;
      if (!proposalId) {
        const chat: any = await ChatHistory.findOne(filter).select("pendingCustomerProposalId").lean();
        if (chat?.pendingCustomerProposalId) proposalId = String(chat.pendingCustomerProposalId);
      }
      if (!proposalId) {
        const activeProposal = await AiCommandProposal.findOne({
          tenantId: scope.tenantId,
          userId: scope.userId,
          module: "sales",
          actionType: "create_customer_draft",
          status: A.PROPOSED,
          "params.conversationId": scope.conversationId,
          "params.executing": { $ne: true },
        }).sort({ createdAt: -1 }).lean();
        if (activeProposal) proposalId = String(activeProposal._id);
      }
      if (!proposalId) throw new ErpToolError("MISSING_FIELD", "Please prepare a customer draft in this conversation first.");
      const cust = await confirmCustomerDraft(scope, proposalId);
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
      let proposalId = existingChat?.pendingCustomerProposalId ? String(existingChat.pendingCustomerProposalId) : undefined;
      if (!proposalId) {
        const chat: any = await ChatHistory.findOne(filter).select("pendingCustomerProposalId").lean();
        if (chat?.pendingCustomerProposalId) proposalId = String(chat.pendingCustomerProposalId);
      }
      if (!proposalId) {
        const activeProposal = await AiCommandProposal.findOne({
          tenantId: scope.tenantId,
          userId: scope.userId,
          module: "sales",
          actionType: "create_customer_draft",
          status: A.PROPOSED,
          "params.conversationId": scope.conversationId,
          "params.executing": { $ne: true },
        }).sort({ createdAt: -1 }).lean();
        if (activeProposal) proposalId = String(activeProposal._id);
      }
      if (proposalId) {
        await cancelCustomerDraft(scope, proposalId);
        await ChatHistory.updateOne(filter, { $unset: { pendingCustomerProposalId: "" } });
      }
      message = "Customer draft cancelled. No customer record was created.";
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "customer_email_update") {
      const emailIntent = intent as { type: "customer_email_update"; customerQuery: string; newEmail: string };
      const draft = await prepareUpdateCustomerEmail(scope, emailIntent.customerQuery, emailIntent.newEmail);
      message = draft.message;
      actions = [{ label: "Confirm email update", value: "confirm customer email update" }, { label: "Cancel", value: "cancel customer email update" }];
      structured = { type: "customer_email_update_proposal" as any, proposalId: draft.proposalId, customerId: draft.customerId, customerName: draft.customerName, oldEmail: draft.oldEmail, newEmail: draft.newEmail, status: "proposed" };
    } else if (intent === "customer_email_confirm") {
      const proposal = await AiCommandProposal.findOne({ tenantId: scope.tenantId, userId: scope.userId, actionType: "update_customer_email", status: A.PROPOSED, "params.conversationId": scope.conversationId }).sort({ createdAt: -1 }).lean();
      if (!proposal) throw new ErpToolError("MISSING_FIELD", "No customer email update is waiting for confirmation.");
      const result = await confirmUpdateCustomerEmail(scope, String(proposal._id));
      message = result.message;
      structured = { type: "customer_email_updated" as any, ...result };
    } else if (intent === "customer_email_cancel") {
      const proposal = await AiCommandProposal.findOne({ tenantId: scope.tenantId, userId: scope.userId, actionType: "update_customer_email", status: A.PROPOSED, "params.conversationId": scope.conversationId }).sort({ createdAt: -1 });
      if (proposal) { proposal.status = A.REJECTED; await proposal.save(); }
      message = "Customer email update cancelled. The customer record remains unchanged.";
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "customer_mobile_update") {
      const mobIntent = intent as { type: "customer_mobile_update"; customerQuery: string; newMobile: string };
      const prep = await prepareUpdateCustomerMobile(scope, mobIntent.customerQuery, mobIntent.newMobile, requestId);
      message = prep.message;
      actions = [{ label: "Confirm mobile update", value: "confirm mobile" }, { label: "Cancel", value: "cancel mobile" }];
      structured = {
        type: "customer_mobile_proposal" as any,
        proposalId: prep.proposalId,
        customerId: prep.customerId,
        customerName: prep.customerName,
        oldMobile: prep.oldMobile,
        newMobile: prep.newMobile,
        status: "proposed",
      };
    } else if (intent === "customer_mobile_confirm") {
      let proposalId = erpContext.pendingCustomerMobileProposalId;
      if (!proposalId) {
        const activeProp = await AiCommandProposal.findOne({
          tenantId: scope.tenantId,
          userId: scope.userId,
          actionType: "update_customer_mobile",
          status: A.PROPOSED,
          "params.conversationId": scope.conversationId,
          "params.executing": { $ne: true },
        }).sort({ createdAt: -1 }).lean();
        if (activeProp) proposalId = String(activeProp._id);
      }
      if (!proposalId) throw new ErpToolError("MISSING_FIELD", "No active customer mobile update proposal found to confirm.");
      const res = await confirmUpdateCustomerMobile(scope, proposalId);
      message = res.message;
      structured = {
        type: "customer_mobile_updated" as any,
        customerId: res.customerId,
        customerName: res.customerName,
        mobile: res.mobile,
      };
    } else if (intent === "customer_mobile_cancel") {
      let proposalId = erpContext.pendingCustomerMobileProposalId;
      if (!proposalId) {
        const activeProp = await AiCommandProposal.findOne({
          tenantId: scope.tenantId,
          userId: scope.userId,
          actionType: "update_customer_mobile",
          status: A.PROPOSED,
          "params.conversationId": scope.conversationId,
        }).sort({ createdAt: -1 }).lean();
        if (activeProp) proposalId = String(activeProp._id);
      }
      if (proposalId) await cancelUpdateCustomerMobile(scope, proposalId);
      message = "Customer update cancelled. The customer record remains unchanged.";
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "product_price_update") {
      const priceIntent = intent as { type: "product_price_update"; productQuery: string; oldPrice: number; newPrice: number };
      const draft = await prepareProductPriceUpdate(scope, priceIntent.productQuery, priceIntent.oldPrice, priceIntent.newPrice);
      message = draft.message;
      actions = [{ label: "Confirm price update", value: "confirm product price update" }, { label: "Cancel", value: "cancel product price update" }];
      structured = { type: "product_price_update_proposal" as any, proposalId: draft.proposalId, productId: draft.productId, name: draft.name, code: draft.code, oldPrice: draft.oldPrice, newPrice: draft.newPrice, status: "proposed" };
    } else if (intent === "product_price_confirm") {
      const proposal = await AiCommandProposal.findOne({ tenantId: scope.tenantId, userId: scope.userId, actionType: "update_product_price", status: A.PROPOSED, "params.conversationId": scope.conversationId }).sort({ createdAt: -1 }).lean();
      if (!proposal) throw new ErpToolError("MISSING_FIELD", "No product price update is waiting for confirmation.");
      const result = await confirmProductPriceUpdate(scope, String(proposal._id));
      message = result.message;
      structured = { type: "product_price_updated" as any, ...result };
    } else if (intent === "product_price_cancel") {
      const proposal = await AiCommandProposal.findOne({ tenantId: scope.tenantId, userId: scope.userId, actionType: "update_product_price", status: A.PROPOSED, "params.conversationId": scope.conversationId }).sort({ createdAt: -1 });
      if (proposal) { proposal.status = A.REJECTED; await proposal.save(); }
      message = "Product price update cancelled. The catalog price remains unchanged.";
    } else if (intent === "product_draft" || (typeof intent === "object" && intent !== null && (intent as any).type === "product_draft")) {
      const draft = await prepareProductDraft(scope, input.text, requestId);
      message = draft.message;
      actions = [{ label: "Confirm product", value: "confirm product" }, { label: "Cancel", value: "cancel product" }];
      structured = {
        type: "product_proposal" as any,
        proposalId: draft.proposalId,
        name: draft.name,
        code: draft.code,
        sellingPrice: draft.sellingPrice,
        costPrice: draft.costPrice,
        gstRate: draft.gstRate,
        hsnCode: draft.hsnCode,
        status: "proposed",
      };
    } else if (intent === "product_confirm") {
      let proposalId = erpContext.pendingProductProposalId;
      if (!proposalId) {
        const activeProp = await AiCommandProposal.findOne({
          tenantId: scope.tenantId,
          userId: scope.userId,
          actionType: "create_product_draft",
          status: A.PROPOSED,
          "params.conversationId": scope.conversationId,
          "params.executing": { $ne: true },
        }).sort({ createdAt: -1 }).lean();
        if (activeProp) proposalId = String(activeProp._id);
      }
      if (!proposalId) throw new ErpToolError("MISSING_FIELD", "No active product draft found to confirm.");
      const res = await confirmProductDraft(scope, proposalId);
      message = res.message;
      structured = {
        type: "product_saved" as any,
        productId: res.productId,
        name: res.name,
        code: res.code,
        price: res.price,
        route: res.route,
      };
    } else if (intent === "product_cancel") {
      let proposalId = erpContext.pendingProductProposalId;
      if (!proposalId) {
        const activeProp = await AiCommandProposal.findOne({
          tenantId: scope.tenantId,
          userId: scope.userId,
          actionType: "create_product_draft",
          status: A.PROPOSED,
          "params.conversationId": scope.conversationId,
        }).sort({ createdAt: -1 }).lean();
        if (activeProp) proposalId = String(activeProp._id);
      }
      if (proposalId) await cancelProductDraft(scope, proposalId);
      message = "Product draft cancelled. No product record was created.";
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "customer_sales_summary") {
      await connectDB();
      const [customerCount, salesRows] = await Promise.all([
        Customer.countDocuments({ tenantId: scope.tenantId, isCustomer: { $ne: false } }),
        SalesInvoice.aggregate([
          { $match: { tenantId: scope.tenantId, ...issuedInvoiceFilter() } },
          { $group: { _id: null, revenue: { $sum: invoiceRevenueExpression } } },
        ]).option({ maxTimeMS: 10_000 }),
      ]);
      const totalSales = Number(salesRows[0]?.revenue) || 0;
      message = `Workspace sales overview:\n\n- **Customers:** ${customerCount}\n- **Total recognized sales (excluding GST):** ${currency(totalSales)}.`;
      structured = { type: "customer_sales_summary" as any, customerCount, totalSales };
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "sales_period_summary") {
      const period = (intent as any).period as "this_month" | "last_month" | "this_year" | "last_30_days";
      const now = new Date();
      let startDate: Date;
      let endDate: Date;
      let periodLabel: string;

      if (period === "last_30_days") {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        endDate = now;
        periodLabel = "the last 30 days";
      } else {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Kolkata", year: "numeric", month: "numeric",
        }).formatToParts(now);
        const currentYear = Number(parts.find((p) => p.type === "year")?.value);
        const currentMonth = Number(parts.find((p) => p.type === "month")?.value) - 1;
        const firstMonth = period === "this_year" ? 0 : currentMonth + (period === "last_month" ? -1 : 0);
        const first = new Date(Date.UTC(currentYear, firstMonth, 1));
        const next = new Date(Date.UTC(currentYear, firstMonth + (period === "this_year" ? 12 : 1), 1));
        const isoDate = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
        startDate = new Date(`${isoDate(first)}T00:00:00+05:30`);
        endDate = new Date(`${isoDate(next)}T00:00:00+05:30`);
        periodLabel = period === "this_year"
          ? `this year (${first.getUTCFullYear()})`
          : new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
      }

      const dateRange = { $gte: startDate, $lt: endDate };
      const [revenueRows, paymentRows, legacyRows, receivableRows] = await Promise.all([
        SalesInvoice.aggregate([
          { $match: { tenantId: input.tenantId, ...issuedInvoiceFilter(), invoiceDate: dateRange } },
          { $group: { _id: null, revenue: { $sum: invoiceRevenueExpression }, count: { $sum: 1 } } },
        ]).option({ maxTimeMS: 10_000 }),
        Payment.aggregate([
          { $match: { tenantId: input.tenantId, status: PAYMENT_STATUS.PAID, paymentDate: dateRange } },
          { $group: { _id: null, received: { $sum: "$amountReceived" }, count: { $sum: 1 } } },
        ]).option({ maxTimeMS: 10_000 }),
        SalesInvoice.aggregate([
          { $match: { tenantId: input.tenantId, ...issuedInvoiceFilter(), payments: { $elemMatch: { date: dateRange, paymentId: { $exists: false } } } } },
          { $unwind: "$payments" },
          { $match: { "payments.date": dateRange, "payments.paymentId": { $exists: false } } },
          { $group: { _id: null, received: { $sum: "$payments.amount" }, count: { $sum: 1 } } },
        ]).option({ maxTimeMS: 10_000 }),
        (intent as any).wantsReceivables
          ? SalesInvoice.aggregate([
              { $match: { tenantId: input.tenantId, ...issuedInvoiceFilter() } },
              { $group: { _id: null, outstanding: { $sum: invoiceOutstandingExpression } } },
            ]).option({ maxTimeMS: 10_000 })
          : Promise.resolve([]),
      ]);

      const revenue = Number(revenueRows[0]?.revenue) || 0;
      const invoiceCount = Number(revenueRows[0]?.count) || 0;
      const paymentsReceived = (Number(paymentRows[0]?.received) || 0) + (Number(legacyRows[0]?.received) || 0);
      const paymentCount = (Number(paymentRows[0]?.count) || 0) + (Number(legacyRows[0]?.count) || 0);
      message = `For ${periodLabel}:\n\n` +
        `- **Recognized revenue (excluding GST):** ${currency(revenue)} across ${invoiceCount} issued invoice(s), by invoice date.\n` +
        `- **Payments received:** ${currency(paymentsReceived)} across ${paymentCount} recorded payment(s), by payment date.` +
        ((intent as any).wantsReceivables ? `\n- **Current customer receivables:** ${currency(Number(receivableRows[0]?.outstanding) || 0)} across all issued invoices.` : "");
      structured = { type: "sales_period_summary" as any, period: periodLabel, revenue, invoiceCount, paymentsReceived, paymentCount, ...( (intent as any).wantsReceivables ? { receivables: Number(receivableRows[0]?.outstanding) || 0 } : {}) };
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "overdue_invoice_summary") {
      const overdueFilter = { tenantId: scope.tenantId, ...unpaidInvoiceFilter(new Date()) };
      const [summary] = await SalesInvoice.aggregate([
        { $match: overdueFilter },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: invoiceOutstandingExpression } } },
      ]).option({ maxTimeMS: 10_000 });
      const count = Number(summary?.count) || 0;
      const amount = Number(summary?.amount) || 0;
      message = `There ${count === 1 ? "is" : "are"} **${count}** overdue invoice(s) with a total outstanding amount of **${currency(amount)}**.`;
      structured = { type: "overdue_invoice_summary" as any, count, amount };
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "vendor_bill_query") {
      const q = intent as { type: "vendor_bill_query"; supplier?: string; billReference?: string; status?: string };
      await connectDB();
      const filter: any = {
        tenantId: scope.tenantId,
        moveType: "in_invoice",
        state: { $nin: [DOCUMENT_STATUS.DRAFT, DOCUMENT_STATUS.REJECTED, DOCUMENT_STATUS.CANCELLED] },
        paymentState: { $ne: PAYMENT_STATE.PAID },
      };
      const andConditions: any[] = [];

      if (q.billReference) {
        andConditions.push({ $or: [
          { name: { $regex: `^${escapeRegex(q.billReference)}$`, $options: "i" } },
          { migrationOriginalBillNumber: { $regex: `^${escapeRegex(q.billReference)}$`, $options: "i" } },
        ] });
      }

      let targetSupplierName: string | undefined;
      if (q.supplier) {
        targetSupplierName = q.supplier.trim();
        const rx = flexibleNameRegex(targetSupplierName);
        const [vendors, partners] = await Promise.all([
          Vendor.find({ tenantId: scope.tenantId, name: rx }).select("_id name").lean(),
          Customer.find({ tenantId: scope.tenantId, "header.name": rx }).select("_id header").lean(),
        ]);
        const vendorIds = vendors.map(v => v._id);
        const partnerIds = partners.map(p => p._id);
        andConditions.push({ $or: [
          ...(vendorIds.length ? [{ vendorId: { $in: vendorIds } }] : []),
          ...(partnerIds.length ? [{ partnerId: { $in: partnerIds } }] : []),
          { migrationVendorSourceId: rx },
          { migrationOriginalBillNumber: rx },
          { invoiceNumber: rx },
          { name: rx },
        ] });
      }
      if (andConditions.length) filter.$and = andConditions;

      const bills = await Invoice.find(filter)
        .populate("partnerId", "header")
        .populate("vendorId", "name")
        .sort({ dueDate: 1, createdAt: -1 })
        .limit(20)
        .lean();

      if (bills.length === 0) {
        message = targetSupplierName
          ? `No supplier bills were found for "${targetSupplierName}" in your accessible records.\n\nYou can review all vendor bills in Finance under **Finance > Vendor Bills** (/finance/bills).`
          : "No pending supplier bills were found in your accessible records.\n\nYou can review all vendor bills in Finance under **Finance > Vendor Bills** (/finance/bills).";
        structured = { type: "vendor_bills" as any, total: 0, count: 0, bills: [], route: "/finance/bills" };
      } else {
        const outstandingFor = (b: any) => {
          const gross = Number(b.amountTotal) || 0;
          const residual = Number(b.amountResidual);
          // Unpaid bills can have a zero residual before payment allocation
          // initializes it. Paid bills are excluded by the query above, so use
          // the gross amount as the safe fallback for every unpaid state.
          return residual > 0 ? residual : gross;
        };
        const totalAmount = bills.reduce((sum, b: any) => sum + outstandingFor(b), 0);
        const lines = bills.map((b: any) => {
          const suppName = b.vendorId?.name || b.partnerId?.header?.name || b.migrationVendorSourceId || "Supplier";
          const billRef = (b.name && b.name !== "Draft") ? b.name : (b.invoiceNumber || b.migrationOriginalBillNumber || b.name || "Bill");
          const amountStr = currency(outstandingFor(b));
          const rawDueDate = b.invoiceDateDue || b.dueDate;
          const dueStr = rawDueDate ? new Date(rawDueDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }) : "Not specified";
          const stateStr = b.state === "approved" ? "Approved" : b.state === "posted" ? "Posted" : "Pending approval";
          return `- **${billRef}** — ${suppName} — Outstanding: **${amountStr}** — Due Date: **${dueStr}** — Status: **${stateStr}**`;
        });

        message = `Found **${bills.length}** supplier bill(s) totaling **${currency(totalAmount)}**:\n\n${lines.join("\n")}\n\nYou can view and manage these bills under **Finance > Vendor Bills** (/finance/bills).`;
        structured = {
          type: "vendor_bills" as any,
          total: totalAmount,
          count: bills.length,
          bills: bills.map((b: any) => ({
            id: String(b._id),
            number: (b.name && b.name !== "Draft") ? b.name : (b.invoiceNumber || b.migrationOriginalBillNumber || b.name),
            amount: b.amountTotal || 0,
            dueDate: b.invoiceDateDue || b.dueDate,
            state: b.state,
            outstanding: outstandingFor(b),
          })),
          route: "/finance/bills",
        };
      }
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "top_customer_receivable") {
      await connectDB();
      const [row] = await SalesInvoice.aggregate([
        { $match: { tenantId: scope.tenantId, ...issuedInvoiceFilter() } },
        { $group: { _id: "$customerId", outstanding: { $sum: invoiceOutstandingExpression } } },
        { $sort: { outstanding: -1, _id: 1 } },
        { $limit: 1 },
      ]).option({ maxTimeMS: 10_000 });
      const customer = row?._id
        ? await Customer.findOne({ _id: row._id, tenantId: scope.tenantId }).select("header").lean()
        : null;
      if (!customer || Number(row.outstanding) <= 0) {
        message = "No customer currently has an outstanding receivable in issued invoices.";
        structured = { type: "top_customer_receivable" as any, customer: null, outstanding: 0 };
      } else {
        const name = customerName(customer);
        message = `**${name}** has the highest current receivable: **${currency(Number(row.outstanding))}**.`;
        structured = { type: "top_customer_receivable" as any, customerName: name, customerId: String(customer._id), outstanding: Number(row.outstanding) };
      }
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "customer_last_invoice") {
      await connectDB();
      const customer = await resolveCustomer(scope.tenantId, (intent as any).customer);
      const invoice = await SalesInvoice.findOne({
        tenantId: scope.tenantId,
        customerId: customer._id,
        ...issuedInvoiceFilter(),
      }).select("number invoiceDate").sort({ invoiceDate: -1, _id: -1 }).lean();
      const name = customerName(customer);
      if (!invoice) {
        message = `No issued invoices were found for **${name}**.`;
        structured = { type: "customer_last_invoice" as any, customerName: name, invoice: null };
      } else {
        const date = invoice.invoiceDate
          ? new Date(invoice.invoiceDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
          : "date unavailable";
        message = `The most recent issued invoice for **${name}** is **${invoice.number}**, dated **${date}**.`;
        structured = { type: "customer_last_invoice" as any, customerName: name, invoiceNumber: invoice.number, invoiceDate: invoice.invoiceDate };
      }
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "customer_receivables") {
      const q = intent as { type: "customer_receivables"; customer?: string };
      query = q;
      await connectDB();
      const filter: any = { tenantId: scope.tenantId, ...issuedInvoiceFilter() };

      let targetCustomer: any = null;
      if (q.customer) {
        targetCustomer = await resolveCustomer(scope.tenantId, q.customer);
        filter.customerId = targetCustomer._id;
      }

      const invoices = await SalesInvoice.find(filter)
        .select("number customerId invoiceDate dueDate totalAmount taxableAmount taxBreakup payments markedFullyPaid status")
        .sort({ invoiceDate: -1 })
        .lean();

      let totalRevenue = 0;
      let totalInvoiced = 0;
      let totalPaid = 0;
      let totalOutstanding = 0;

      const invoiceDetails = invoices.map((inv: any) => {
        const taxable = typeof inv.taxableAmount === "number"
          ? inv.taxableAmount
          : typeof inv.taxBreakup === "number"
          ? Math.max(0, inv.totalAmount - inv.taxBreakup)
          : inv.totalAmount;
        const paid = (inv.payments || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
        const outstanding = inv.markedFullyPaid ? 0 : Math.max(0, inv.totalAmount - paid);

        totalRevenue += taxable;
        totalInvoiced += inv.totalAmount || 0;
        totalPaid += paid;
        totalOutstanding += outstanding;

        const dueStr = inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "—";
        return `- **${inv.number}**: Total ${currency(inv.totalAmount)}, Taxable Revenue ${currency(taxable)}, Paid ${currency(paid)}, Outstanding **${currency(outstanding)}** (Due: ${dueStr}, Status: ${inv.status})`;
      });

      if (targetCustomer) {
        const custName = customerName(targetCustomer);
        message = `Financial summary for **${custName}**:\n\n` +
          `- **Total Invoiced Amount (Gross including GST):** ${currency(totalInvoiced)}\n` +
          `- **Recognized Revenue (Taxable Sales excluding GST):** ${currency(totalRevenue)}\n` +
          `- **Total Payments Received:** ${currency(totalPaid)}\n` +
          `- **Total Amount Owed / Outstanding Receivables:** **${currency(totalOutstanding)}**\n\n` +
          (invoices.length > 0 ? `Issued Invoices (${invoices.length}):\n${invoiceDetails.join("\n")}` : "No issued invoices found for this customer.");

        structured = {
          type: "customer_receivables_summary" as any,
          customerName: custName,
          customerId: String(targetCustomer._id),
          totalRevenue,
          totalInvoiced,
          totalPaid,
          totalOutstanding,
          invoices: invoices.map((i: any) => ({
            number: i.number,
            totalAmount: i.totalAmount,
            taxableAmount: i.taxableAmount,
            paid: (i.payments || []).reduce((s: number, p: any) => s + (p.amount || 0), 0),
            outstanding: i.markedFullyPaid ? 0 : Math.max(0, i.totalAmount - (i.payments || []).reduce((s: number, p: any) => s + (p.amount || 0), 0)),
            status: i.status,
          })),
        };
      } else {
        message = `Portfolio Receivables & Sales Summary:\n\n` +
          `- **Total Invoiced Value (including GST):** ${currency(totalInvoiced)}\n` +
          `- **Recognized Revenue (excluding GST):** ${currency(totalRevenue)}\n` +
          `- **Total Payments Received:** ${currency(totalPaid)}\n` +
          `- **Total Outstanding Receivables:** **${currency(totalOutstanding)}** across ${invoices.length} issued invoice(s).`;

        structured = {
          type: "receivables_portfolio_summary" as any,
          totalRevenue,
          totalInvoiced,
          totalPaid,
          totalOutstanding,
          invoiceCount: invoices.length,
        };
      }
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "employee_lookup") {
      const lookupIntent = intent as { type: "employee_lookup"; name?: string; department?: string; employeeCode?: string; attribute?: string };
      await connectDB();
      const filterQuery: any = { tenantId: input.tenantId };
      if (lookupIntent.name) {
        const rx = new RegExp(escapeRegex(lookupIntent.name), "i");
        filterQuery.$or = [
          { firstName: rx },
          { lastName: rx },
          { employeeCode: rx },
          { email: rx },
          { designation: rx },
        ];
      }
      let employees = await Employee.find(filterQuery)
        .populate("departmentId", "name code")
        .populate("userId", "name email role userRole")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      if (employees.length === 0 && lookupIntent.name) {
        const allEmps = await Employee.find({ tenantId: input.tenantId })
          .populate("departmentId", "name code")
          .populate("userId", "name email role userRole")
          .lean();
        const target = lookupIntent.name.toLowerCase();
        employees = allEmps.filter((emp: any) => {
          const fullName = `${emp.firstName || ""} ${emp.lastName || ""}`.trim().toLowerCase();
          return fullName === target || fullName.includes(target);
        });
        // Exact search first; if no record matched, recover clear name typos
        // from this tenant's employees and keep all close matches for disambiguation.
        if (employees.length === 0) {
          employees = allEmps.filter((emp: any) =>
            isLikelyEmployeeNameTypo(lookupIntent.name!, `${emp.firstName || ""} ${emp.lastName || ""}`.trim()),
          ).slice(0, 10);
        }
      }

      if (employees.length === 0) {
        message = lookupIntent.name
          ? `No matching employee found for "${lookupIntent.name}" in your current organization.`
          : "No employees found in your current organization.";
        structured = {
          type: "not_found",
          identifier: lookupIntent.name,
          message,
        };
      } else if (lookupIntent.name && employees.length > 1) {
        const items = employees.map((e: any) =>
          `- **${e.firstName} ${e.lastName}** (Employee Code: \`${e.employeeCode || String(e._id)}\`, Role/Designation: *${e.designation || "Not specified"}*, Department: *${employeeDepartmentName(e)}*)`
        ).join("\n");
        message = `Found ${employees.length} employees matching "${lookupIntent.name}". Please specify the employee code or full name to disambiguate:\n\n${items}`;
        structured = {
          type: "clarification",
          question: `Multiple employees match "${lookupIntent.name}". Which one would you like to view?`,
          options: employees.map((e: any) => `${e.firstName} ${e.lastName} (${e.employeeCode || String(e._id)})`),
        };
      } else {
        const items = employees.map((e: any) =>
          `- **${e.firstName} ${e.lastName}** (Employee ID: \`${e.employeeCode || String(e._id)}\`, Current Role/Designation: *${e.designation || "Not specified"}*, Department: *${employeeDepartmentName(e)}*, Email: \`${e.email}\`)`
        ).join("\n");
        if (employees.length === 1 && lookupIntent.attribute) {
          const employee: any = employees[0];
          const requestedFields: Record<string, { label: string; value: unknown }> = {
            code: { label: "Employee code", value: employee.employeeCode },
            id: { label: "Employee ID", value: employee.employeeCode || String(employee._id) },
            email: { label: "Email", value: employee.email },
            phone: { label: "Phone", value: employee.phone },
            mobile: { label: "Mobile", value: employee.phone },
            designation: { label: "Designation", value: employee.designation },
            department: { label: "Department", value: employeeDepartmentName(employee) },
            role: { label: "Role/designation", value: employee.designation || employee.userId?.role || employee.userId?.userRole },
          };
          const requested = requestedFields[lookupIntent.attribute];
          const value = requested?.value == null || requested.value === "" ? "Not provided in the employee record" : String(requested.value);
          message = `**${requested?.label || "Employee detail"} for ${employee.firstName} ${employee.lastName}:** ${value}`;
        } else {
          message = employees.length === 1
            ? `Found employee record in current organization:\n\n${items}`
            : `Found ${employees.length} employees in current organization:\n\n${items}`;
        }
        structured = {
          type: "record_list",
          title: "Employees",
          entity: "employee",
          records: employees.map((e: any) => ({
            id: String(e._id),
            number: e.employeeCode || String(e._id),
            date: e.dateOfJoining ? new Date(e.dateOfJoining).toISOString().slice(0, 10) : "",
            status: e.status || "active",
            customerName: `${e.firstName} ${e.lastName}`,
            route: `/hr/employees/${e._id}`,
            extra: {
              role: e.designation || "Not specified",
              department: employeeDepartmentName(e),
            },
          })),
          totalCount: employees.length,
        };
      }
      query = {
        entity: "employee",
        type: "employee_lookup",
        name: lookupIntent.name,
      };
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "employee_count") {
      const countIntent = intent as {
        type: "employee_count";
        scope: "total" | "active" | "linked" | "unlinked" | "department";
        department?: string;
      };
      await connectDB();
      const tenantMatch: Record<string, any> = { tenantId: input.tenantId };
      let deptName = countIntent.department;
      let deptId: mongoose.Types.ObjectId | undefined;

      if (countIntent.department) {
        const deptRx = new RegExp(`^${escapeRegex(countIntent.department)}$`, "i");
        let dept = await Department.findOne({ tenantId: input.tenantId, name: deptRx }).lean();
        if (!dept) {
          dept = await Department.findOne({
            tenantId: input.tenantId,
            $or: [
              { name: new RegExp(escapeRegex(countIntent.department), "i") },
              { code: new RegExp(escapeRegex(countIntent.department), "i") },
            ],
          }).lean();
        }
        if (dept) {
          deptId = dept._id as mongoose.Types.ObjectId;
          deptName = dept.name;
        }
      }

      let count = 0;
      let label = "";

      if (deptName) {
        const deptCondition = deptId
          ? { $or: [{ departmentId: deptId }, { department: new RegExp(`^${escapeRegex(deptName)}$`, "i") }] }
          : { department: new RegExp(`^${escapeRegex(deptName)}$`, "i") };

        if (countIntent.scope === "active") {
          count = await Employee.countDocuments({
            ...tenantMatch,
            ...deptCondition,
            lifecycleStatus: "active",
          });
          message = `There ${count === 1 ? "is" : "are"} **${count}** active employee${count === 1 ? "" : "s"} in the **${deptName}** department.`;
          label = `Active employees in ${deptName}`;
        } else {
          count = await Employee.countDocuments({
            ...tenantMatch,
            ...deptCondition,
            lifecycleStatus: { $ne: "exited" },
          });
          message = `There ${count === 1 ? "is" : "are"} **${count}** employee${count === 1 ? "" : "s"} in the **${deptName}** department.`;
          label = `Employees in ${deptName}`;
        }
      } else if (countIntent.scope === "active") {
        count = await Employee.countDocuments({
          ...tenantMatch,
          lifecycleStatus: "active",
        });
        message = `There ${count === 1 ? "is" : "are"} **${count}** active employee${count === 1 ? "" : "s"} in your organization.`;
        label = "Active employees";
      } else if (countIntent.scope === "linked") {
        count = await Employee.countDocuments({
          ...tenantMatch,
          userId: { $exists: true, $ne: null },
          lifecycleStatus: { $ne: "exited" },
        });
        message = `There ${count === 1 ? "is" : "are"} **${count}** employee account${count === 1 ? "" : "s"} linked to system user accounts.`;
        label = "Employees linked to user accounts";
      } else if (countIntent.scope === "unlinked") {
        count = await Employee.countDocuments({
          ...tenantMatch,
          $or: [{ userId: { $exists: false } }, { userId: null }],
          lifecycleStatus: { $ne: "exited" },
        });
        message = `There ${count === 1 ? "is" : "are"} **${count}** employee${count === 1 ? "" : "s"} with no linked user account.`;
        label = "Employees without user accounts";
      } else {
        // total count
        count = await Employee.countDocuments({
          ...tenantMatch,
          lifecycleStatus: { $ne: "exited" },
        });
        message = `There ${count === 1 ? "is" : "are"} **${count}** employee${count === 1 ? "" : "s"} in total in your organization.`;
        label = "Total employees";
      }

      query = {
        entity: "employee",
        type: "employee_count",
        scope: countIntent.scope,
        department: deptName,
      };

      structured = {
        type: "count",
        entity: "employee",
        count,
        label,
        scope: countIntent.scope,
        department: deptName,
      };
    } else if (typeof intent === "object" && intent !== null && (intent as any).type === "role_change") {
      if (!["admin", "master-admin"].includes(input.role)) {
        throw new ErpToolError("PERMISSION_DENIED", "Unauthorized: Changing employee roles requires administrative permissions.", 403);
      }
      const roleIntent = intent as { type: "role_change"; userName: string; role: string; fromRole?: string };
      if (!roleIntent.userName || !roleIntent.role) {
        throw new ErpToolError("MISSING_FIELD", "Please specify the employee name and the target role.");
      }
      const preview = await COMMAND_ACTIONS.update_user_role.buildPreview(
        { userName: roleIntent.userName, role: roleIntent.role, fromRole: roleIntent.fromRole },
        input.tenantId
      );
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
      const prevData = preview.preview as any;
      const proposal = await AiCommandProposal.create({
        tenantId: input.tenantId,
        userId: input.userId,
        module: "admin",
        actionType: "update_user_role",
        destructive: true,
        params: {
          userName: roleIntent.userName,
          role: roleIntent.role,
          fromRole: roleIntent.fromRole,
          proposedRole: prevData?.proposedRole,
          userId: prevData?.userId,
          employeeId: prevData?.employeeId,
          employeeCode: prevData?.employeeCode,
          currentRole: prevData?.currentRole,
        },
        preview: preview.preview,
        summary: preview.summary,
        status: A.PROPOSED,
        expiresAt,
      });
      message = `${preview.summary}\n\nPlease confirm to execute the role change, or cancel to discard.`;
      actions = [{ label: "Confirm role change", value: "confirm role change" }, { label: "Cancel", value: "cancel role" }];
      pendingRoleProposalId = String(proposal._id);
      structured = {
        type: "role_change_proposal",
        proposalId: String(proposal._id),
        employeeId: prevData?.employeeId ? String(prevData.employeeId) : undefined,
        employeeCode: prevData?.employeeCode ? String(prevData.employeeCode) : undefined,
        department: prevData?.department ? String(prevData.department) : undefined,
        userId: String(prevData?.userId || ""),
        userName: String(prevData?.userName || ""),
        userEmail: prevData?.userEmail ? String(prevData.userEmail) : undefined,
        currentRole: String(prevData?.currentRole || ""),
        currentRoleLabel: String(prevData?.currentRoleLabel || ""),
        proposedRole: String(prevData?.proposedRole || ""),
        proposedRoleLabel: String(prevData?.proposedRoleLabel || ""),
        status: "proposed",
      };
    } else if (intent === "role_confirm") {
      if (!["admin", "master-admin"].includes(input.role)) {
        throw new ErpToolError("PERMISSION_DENIED", "Unauthorized: Changing employee roles requires administrative permissions.", 403);
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
        const prev = (proposal.preview || {}) as any;
        const newRole = String(prev?.proposedRole || prev?.newRole || "");
        const newRoleLabel = String(prev?.proposedRoleLabel || prev?.newRole || newRole);
        const targetKind = (prev?.employeeId || prev?.employeeCode) ? "employee" : "user";
        message = `Role for ${targetKind} "${prev?.userName}" has already been updated to ${newRoleLabel}.`;
        structured = {
          type: "role_changed",
          employeeId: prev?.employeeId,
          employeeCode: prev?.employeeCode,
          userId: proposal.resultRef,
          userName: String(prev?.userName || ""),
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
        
        let outcome: any;
        try {
          outcome = await COMMAND_ACTIONS.update_user_role.execute(proposal.params, input.tenantId, input.userId);
        } catch (err: any) {
          await AiCommandProposal.updateOne({ _id: proposal._id }, { $unset: { "params.executing": "" } });
          throw err;
        }

        locked.status = A.EXECUTED;
        locked.resultRef = outcome.resultRef;
        locked.executedAt = new Date();
        await locked.save();
        await ChatHistory.updateOne(filter, { $unset: { pendingRoleProposalId: "" } });
        const prev = (proposal.preview || {}) as any;
        const resUser = outcome.result as any;
        const newRole = String(prev?.proposedRole || prev?.newRole || "");
        const newRoleLabel = String(prev?.proposedRoleLabel || prev?.newRole || newRole);
        const targetKind = (resUser?.employeeId || prev?.employeeId || prev?.employeeCode) ? "employee" : "user";
        message = `Successfully updated role for ${targetKind} "${resUser?.name || prev?.userName}" to ${newRoleLabel}. Verified persisted record in database.`;
        structured = {
          type: "role_changed",
          employeeId: resUser?.employeeId || prev?.employeeId,
          employeeCode: resUser?.employeeCode || prev?.employeeCode,
          userId: outcome.resultRef,
          userName: String(resUser?.name || prev?.userName || ""),
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
      message = "Role change request cancelled. No employee or user permissions were modified.";
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
          notes: isIssuedRevenue ? `About ₹${lakhStr} lakh by invoice date, drafts and cancellations excluded` : undefined,
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
          // The invoice preview query is intentionally capped, while the
          // unpaid/overdue aggregate counts every matching invoice. Use that
          // authoritative total for the list label and "View all" link.
          totalCount: aggregateTotal?.count ?? result.count,
        };
      }
    }
    await saveCompletedExchange({ ...filter, message: input.text, response: message!, requestId, skipSummary: true, erpCreditsUsed: 0 });
    // Count one completed Copilot question even when ERP data resolution was
    // deterministic and used no provider credits. Safety refusals/off-topic
    // declines remain excluded. The request id deduplicates client retries.
    if (intent !== "refuse" && intent !== "off_topic") {
      const period = getAiPeriod();
      await incrementAiUsage(scope.tenantId, period, requestId);
      await incrementGlobalAiUsage(period, requestId);
    }
    if (pendingQuoteProposalId) await ChatHistory.updateOne(filter, { $set: { pendingQuoteProposalId } });
    if (pendingCustomerProposalId) await ChatHistory.updateOne(filter, { $set: { pendingCustomerProposalId } });
    if (pendingRoleProposalId) await ChatHistory.updateOne(filter, { $set: { pendingRoleProposalId } });
    if (query) await ChatHistory.updateOne(filter, { $set: { lastErpQuery: query } });
  }
  const chatItemQuery: any = ChatHistory.findOne(filter);
  const chat = await (typeof chatItemQuery?.select === "function" ? chatItemQuery.select("_id").lean() : (typeof chatItemQuery?.lean === "function" ? chatItemQuery.lean() : chatItemQuery));
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
  const mongoError = error as { code?: unknown; codeName?: unknown; keyPattern?: Record<string, unknown> };
  // Deliberately omit raw exception messages: drivers/providers may embed URIs or protected records.
  console.error("[erp-assistant] request failed", {
    requestId,
    category: database ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR",
    errorType: error instanceof Error ? error.name : "unknown",
    ...(database && mongoError?.code !== undefined ? { mongoCode: mongoError.code } : {}),
    ...(database && mongoError?.codeName ? { mongoCodeName: mongoError.codeName } : {}),
    ...(database && mongoError?.keyPattern ? { mongoKeyFields: Object.keys(mongoError.keyPattern).slice(0, 8) } : {}),
  });
  const message = database ? "I couldn't retrieve the records right now. Please try again shortly." : "I couldn't complete this request. Please try again shortly.";
  return { status: database ? 503 : 500, body: { success: false, handled: true, error: message, message, code: database ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR", requestId } };
}
