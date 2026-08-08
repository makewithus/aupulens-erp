/**
 * Confirm step for a vendor-bill extraction → create a DRAFT vendor bill.
 *
 * A vendor bill in this system is an Invoice with moveType "in_invoice" and a
 * required partnerId (Odoo res.partner pattern — partners are stored in the
 * Customer collection). This service:
 *   1. resolves the vendor to an existing partner (by GSTIN or name) or creates
 *      a minimal partner,
 *   2. creates the Invoice in state = draft.
 *
 * DRAFT is deliberate: draft bills are NOT posted to the general ledger (posting
 * happens on a separate confirm/post action in Finance), so importing an
 * extracted bill can never silently create an unbalanced or wrong GL entry. The
 * reviewer opens it in Finance and posts it there once satisfied.
 *
 * The supplier's own bill number is stored in Invoice.sourceDocument (there is
 * no dedicated supplier-ref field); the internal `name` gets a unique draft
 * token because {tenantId,name} is a unique index and can't repeat "Draft".
 */

import mongoose from "mongoose";
import Invoice from "@/models/Invoice";
import Customer from "@/models/Customer";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";
import type { VendorBillExtraction } from "@/lib/docIntel/extractionSchemas";

interface Ctx {
  tenantId: string;
  userId: string;
}

async function resolvePartnerId(ext: VendorBillExtraction, ctx: Ctx): Promise<mongoose.Types.ObjectId> {
  const gstin = ext.vendorGstin?.toUpperCase();
  if (gstin) {
    const byGst = await Customer.findOne({ tenantId: ctx.tenantId, gstin });
    if (byGst) return byGst._id as mongoose.Types.ObjectId;
  }
  const name = ext.vendorName?.trim();
  if (name) {
    const byName = await Customer.findOne({ tenantId: ctx.tenantId, "header.name": name });
    if (byName) return byName._id as mongoose.Types.ObjectId;
  }
  // Create a minimal partner (marked as a company) for this vendor.
  const created = await Customer.create({
    tenantId: ctx.tenantId,
    createdBy: new mongoose.Types.ObjectId(ctx.userId),
    header: { name: name || "Unknown Vendor", displayName: name || "Unknown Vendor", is_company: true },
    gstin: gstin || undefined,
  });
  return created._id as mongoose.Types.ObjectId;
}

function parseDate(s: string): Date {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export interface BillCreateResult {
  invoiceId: mongoose.Types.ObjectId;
  partnerId: mongoose.Types.ObjectId;
  name: string;
}

export async function createDraftBill(ext: VendorBillExtraction, ctx: Ctx): Promise<BillCreateResult> {
  const partnerId = await resolvePartnerId(ext, ctx);

  const invoiceLines = (ext.lineItems.length
    ? ext.lineItems
    : [{ description: "Imported from document", quantity: 1, unitPrice: ext.totalAmount, amount: ext.totalAmount }]
  ).map((l) => ({
    name: l.description || "Item",
    quantity: l.quantity || 1,
    priceUnit: l.unitPrice || 0,
    priceSubtotal: l.amount || (l.quantity || 1) * (l.unitPrice || 0),
    taxIds: [],
  }));

  // Unique internal draft name — {tenantId,name} is a unique index, so "Draft"
  // can't be reused. Real numbering is applied when it's posted in Finance.
  const uniqueName = `DRAFT-BILL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const invoice = await Invoice.create({
    tenantId: ctx.tenantId,
    name: uniqueName,
    partnerId,
    moveType: "in_invoice",
    state: DOCUMENT_STATUS.DRAFT,
    invoiceDate: parseDate(ext.billDate),
    dueDate: ext.dueDate ? parseDate(ext.dueDate) : parseDate(ext.billDate),
    currencyId: ext.currency || "INR",
    invoiceLines,
    amountUntaxed: ext.subtotal || 0,
    amountTax: ext.taxAmount || 0,
    amountTotal: ext.totalAmount || 0,
    amountResidual: ext.totalAmount || 0,
    sourceDocument: ext.billNumber || undefined,
    poReference: ext.poReference || undefined,
    createdBy: new mongoose.Types.ObjectId(ctx.userId),
  });

  return { invoiceId: invoice._id as mongoose.Types.ObjectId, partnerId, name: uniqueName };
}

/** Existing vendor bills for duplicate detection (tenant-scoped by caller). */
export async function loadExistingBills(tenantId: string) {
  const rows = await Invoice.find({ tenantId, moveType: "in_invoice" })
    .populate("partnerId", "header.name")
    .select("sourceDocument amountTotal partnerId")
    .limit(2000)
    .lean();
  return rows.map((r) => ({
    id: String(r._id),
    vendorName: (r as { partnerId?: { header?: { name?: string } } }).partnerId?.header?.name ?? "",
    billNumber: (r as { sourceDocument?: string }).sourceDocument ?? "",
    totalAmount: (r as { amountTotal?: number }).amountTotal ?? 0,
  }));
}
