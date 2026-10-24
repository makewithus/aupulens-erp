import Customer from "@/models/sales/Customer";
import SalesQuotation from "@/models/sales/SalesQuotation";
import { computeInvoiceTotals } from "./invoiceMath";
import { generateQuoteNumber } from "./quoteNumbering";
import { validateQuoteInput } from "./quoteValidation";
import { QUOTE_STATUS, QUOTE_STATUS_VALUES } from "@/lib/constants/statuses";
import { ErpToolError } from "@/lib/ai/erpQuery";
import { getEmailService } from "@/lib/email/sendEmail";

/** Shared by regular quote API and confirmed AI drafts. Identity fields are server-owned. */
export async function createSalesQuote(tenantId: string, userId: string, body: any, sourceAiProposalId?: string) {
  const issues = validateQuoteInput(body);
  if (issues.length) throw new ErpToolError("BUSINESS_RULE", issues.join(" "));
  const customer: any = await Customer.findOne({ tenantId, _id: body.customerId });
  if (!customer) throw new ErpToolError("NOT_FOUND", "Customer was not found in your accessible records.", 404);
  const taxMode = body.taxes?.mode || "none";
  const taxRate = taxMode !== "none" ? Number(body.taxes?.rate) || 0 : 0;
  if (!["none", "tds", "tcs"].includes(taxMode) || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new ErpToolError("INVALID_INPUT", "Invalid tax mode or rate.");
  const totals = computeInvoiceTotals({ ...body, tdsRate: taxMode === "tds" ? taxRate : 0, tcsRate: taxMode === "tcs" ? taxRate : 0 });
  const quoteNumber = body.quoteNumber || (await generateQuoteNumber(tenantId, body.prefix)).number;
  const allowed = ["reference", "quoteDate", "expiryDate", "salesperson", "projectName", "subject", "customerNotes", "terms", "attachments", "templateKey", "itemLevelDiscountPercent", "extraDiscount", "extraDiscountMode"];
  const fields = Object.fromEntries(allowed.filter(k => body[k] !== undefined).map(k => [k, body[k]]));
  const quote = await SalesQuotation.create({ ...fields, tenantId, customerId: body.customerId, quoteNumber, lineItems: totals.computedLines,
    taxes: { mode: taxMode, taxId: body.taxes?.taxId || undefined, rate: taxRate, amount: taxMode === "tds" ? totals.tdsAmount : totals.tcsAmount },
    adjustment: body.adjustment || 0, taxableAmount: totals.taxableAmount, totalDiscount: totals.totalDiscount, totalAmount: totals.totalAmount + (body.adjustment || 0),
    status: QUOTE_STATUS_VALUES.includes(body.status) ? body.status : QUOTE_STATUS.DRAFT, createdBy: userId, ...(sourceAiProposalId ? { sourceAiProposalId } : {}),
  });

  if (quote.status === QUOTE_STATUS.SENT && customer?.contact_details?.email) {
    try {
      const emailService = getEmailService();
      await emailService.send({
        to: customer.contact_details.email,
        subject: `Quotation ${quote.quoteNumber} from Aupulens`,
        body: `Dear ${customer.header?.name || "Customer"},\n\nPlease find your quotation ${quote.quoteNumber} totaling ₹${quote.totalAmount}.\n\nThank you for your business.`,
      });
    } catch (err) {
      console.warn("Quote email dispatch failed:", err);
    }
  }

  return quote;
}
