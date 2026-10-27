import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { stripProtectedFields } from "@/lib/api/validateId";
import { validateQuoteInput } from "@/lib/sales/quoteValidation";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import SalesQuotation from "@/models/sales/SalesQuotation";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import Customer from "@/models/sales/Customer";
import { getEmailService } from "@/lib/email/sendEmail";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const isObjectId = mongoose.isValidObjectId(id);
    const quote = await (SalesQuotation as any)
      .findOne(
        isObjectId
          ? { _id: id, tenantId: session.user.tenantId }
          : { quoteNumber: id, tenantId: session.user.tenantId }
      )
      .populate("customerId", "header contact_details")
      .lean();

    if (!quote) return NextResponse.json({ success: false, message: "Quote not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: quote });
  } catch (error: any) {
    console.error("Sales Quote GET error:", error);
    return NextResponse.json({ success: false, message: safeInternalErrorMessage() }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

const tenantId = session.user.tenantId;
    const { id } = await params;
    const body = stripProtectedFields(await request.json());

    const existing = await SalesQuotation.findOne(
      mongoose.isValidObjectId(id) ? { _id: id, tenantId } : { quoteNumber: id, tenantId }
    ).lean();
    if (!existing) return NextResponse.json({ success: false, message: "Quote not found" }, { status: 404 });

    if (existing.status === "invoiced") {
      const financialKeys = ["lineItems", "itemLevelDiscountPercent", "extraDiscount", "extraDiscountMode", "taxes", "adjustment", "customerId", "totalAmount", "taxableAmount"];
      const hasFinancialEdit = financialKeys.some(k => k in body);
      const isRevertingStatus = body.status && body.status !== "invoiced";
      if (hasFinancialEdit || isRevertingStatus) {
        return NextResponse.json(
          {
            success: false,
            message: "Cannot modify or revert an invoiced quotation. The quotation is locked.",
            code: "QUOTE_LOCKED",
          },
          { status: 409 },
        );
      }
    }
    const merged = { ...existing, ...body };
    if (!await Customer.exists({ tenantId, _id: merged.customerId })) return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
    const issues = validateQuoteInput(merged);
    if (issues.length) return NextResponse.json({ success: false, message: issues.join(" "), code: "BUSINESS_RULE" }, { status: 400 });
    const allowed = ["customerId", "reference", "quoteDate", "expiryDate", "salesperson", "projectName", "subject", "lineItems", "itemLevelDiscountPercent", "extraDiscount", "extraDiscountMode", "taxes", "adjustment", "customerNotes", "terms", "attachments", "templateKey", "status", "quoteNumber"];
    const update: any = Object.fromEntries(allowed.filter(k => body[k] !== undefined).map(k => [k, body[k]]));
    if (["lineItems", "itemLevelDiscountPercent", "extraDiscount", "extraDiscountMode", "taxes", "adjustment"].some(k => k in body)) {
      Object.assign(body, merged);
      const taxMode = body.taxes?.mode || "none";
      const taxRate = taxMode !== "none" ? Number(body.taxes?.rate) || 0 : 0;
      const totals = computeInvoiceTotals({
        lineItems: body.lineItems,
        itemLevelDiscountPercent: body.itemLevelDiscountPercent || 0,
        extraDiscount: body.extraDiscount || 0,
        extraDiscountMode: body.extraDiscountMode || "amount",
        tdsRate: taxMode === "tds" ? taxRate : 0,
        tcsRate: taxMode === "tcs" ? taxRate : 0,
      });
      const adjustment = Number(body.adjustment) || 0;
      update.taxableAmount = totals.taxableAmount;
      update.totalDiscount = totals.totalDiscount;
      update.totalAmount = totals.totalAmount + adjustment;
      update.taxes = {
        mode: taxMode,
        taxId: body.taxes?.taxId || undefined,
        rate: taxRate,
        amount: taxMode === "tds" ? totals.tdsAmount : totals.tcsAmount,
      };
      update.lineItems = totals.computedLines;
    }

    const quote = await SalesQuotation.findOneAndUpdate({ _id: id, tenantId }, { $set: update }, { new: true, runValidators: true });
    if (!quote) return NextResponse.json({ success: false, message: "Quote not found" }, { status: 404 });

    if (body.status === "sent") {
      const customer: any = await Customer.findOne({ tenantId, _id: quote.customerId });
      if (customer?.contact_details?.email) {
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
    }

    return NextResponse.json({ success: true, data: quote });

  } catch (error: any) {
    console.error("Sales Quote PATCH error:", error);
    return NextResponse.json({ success: false, message: safeInternalErrorMessage() }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

const { id } = await params;
    const existing = await SalesQuotation.findOne({ _id: id, tenantId: session.user.tenantId }).lean();
    if (!existing) return NextResponse.json({ success: false, message: "Quote not found" }, { status: 404 });

    if (existing.status === "invoiced") {
      return NextResponse.json(
        {
          success: false,
          message: "Cannot delete an invoiced quotation. The quotation is locked.",
          code: "QUOTE_LOCKED",
        },
        { status: 409 },
      );
    }

    await SalesQuotation.deleteOne({ _id: id, tenantId: session.user.tenantId });
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Sales Quote DELETE error:", error);
    return NextResponse.json({ success: false, message: safeInternalErrorMessage() }, { status: 500 });
  }
}
