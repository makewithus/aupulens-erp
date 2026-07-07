import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Customer from "@/models/Customer";
import { SalesInvoice } from "@/models/SalesInvoice";
import Payment from "@/models/Payment";
import { applyAllocationsToInvoices } from "@/lib/sales/paymentAllocation";
import { postCustomerPaymentJournal } from "@/lib/accounting/payments";
import { SALES_INVOICE_STATUS } from "@/lib/constants/statuses";
import * as xlsx from "xlsx";
import { validateSpreadsheetFile } from "@/lib/utils/fileValidation";

// Applies previously-recorded excess/unused payment amounts to invoices.
// Core rule (spec §7.7): the target invoice must not be in Draft or Paid
// status — only Saved / Partially Paid / Overdue invoices can receive an
// applied excess payment.
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    await connectDB();
    const tenantId = session.user.tenantId;

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const mappingStr = formData.get("mapping") as string;

    if (!file || !mappingStr) {
      return NextResponse.json({ success: false, message: "Missing file or mapping" }, { status: 400 });
    }

    const fileError = validateSpreadsheetFile(file);
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 });

    const mapping = JSON.parse(mappingStr) as Record<string, string>;
    const bytes = await file.arrayBuffer();
    const workbook = xlsx.read(Buffer.from(bytes), { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false }) as any[];

    let imported = 0;
    let skipped = 0;
    const errors: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2;
      const get = (key: string) => (mapping[key] ? row[mapping[key]] : undefined);

      const customerName = get("customerName");
      const paymentNumber = get("paymentNumber");
      const invoiceNumber = get("invoiceNumber");
      const amountRaw = get("amount");

      const amount = Number(amountRaw);
      if (!amount || amount <= 0) {
        errors.push({ row: rowNumber, reason: "Amount to Apply is required and must be greater than 0" });
        skipped++;
        continue;
      }
      if (!invoiceNumber) {
        errors.push({ row: rowNumber, reason: "Invoice Number is required" });
        skipped++;
        continue;
      }
      if (!customerName && !paymentNumber) {
        errors.push({ row: rowNumber, reason: "Either Customer Name or Payment Number is required to identify the source payment" });
        skipped++;
        continue;
      }

      // Resolve the source payment (the one holding existing unused amount).
      let sourcePayment: any = null;
      if (paymentNumber) {
        sourcePayment = await Payment.findOne({ tenantId, paymentNumber: String(paymentNumber).trim() });
        if (!sourcePayment) {
          errors.push({ row: rowNumber, reason: `Payment "${paymentNumber}" not found` });
          skipped++;
          continue;
        }
      } else {
        const customer = await Customer.findOne({
          tenantId,
          $or: [{ "header.displayName": String(customerName).trim() }, { "header.name": String(customerName).trim() }],
        });
        if (!customer) {
          errors.push({ row: rowNumber, reason: `Customer "${customerName}" not found — create the customer first` });
          skipped++;
          continue;
        }
        sourcePayment = await Payment.findOne({ tenantId, customerId: customer._id, unusedAmount: { $gt: 0 } }).sort({
          paymentDate: -1,
        });
        if (!sourcePayment) {
          errors.push({ row: rowNumber, reason: `No payment with unused/excess amount found for customer "${customerName}"` });
          skipped++;
          continue;
        }
      }

      const invoice = await (SalesInvoice as any).findOne({
        tenantId,
        number: String(invoiceNumber).trim(),
        customerId: sourcePayment.customerId,
      });
      if (!invoice) {
        errors.push({ row: rowNumber, reason: `Invoice "${invoiceNumber}" not found for this customer` });
        skipped++;
        continue;
      }

      if (invoice.status === SALES_INVOICE_STATUS.DRAFT || invoice.status === SALES_INVOICE_STATUS.PAID) {
        errors.push({
          row: rowNumber,
          reason: `Invoice "${invoiceNumber}" is in ${invoice.status === SALES_INVOICE_STATUS.DRAFT ? "Draft" : "Paid"} status — excess payments cannot be imported for Draft or Paid invoices`,
        });
        skipped++;
        continue;
      }

      if (sourcePayment.unusedAmount < amount - 0.005) {
        errors.push({
          row: rowNumber,
          reason: `Source payment "${sourcePayment.paymentNumber}" has an unused amount of ${sourcePayment.unusedAmount}, which is less than the requested ${amount}`,
        });
        skipped++;
        continue;
      }

      try {
        sourcePayment.allocations.push({ invoiceId: invoice._id, amount });
        sourcePayment.unusedAmount = Math.max(0, sourcePayment.unusedAmount - amount);

        // The reclass entry: applying previously-unused/excess amount to a
        // newly-allocated invoice nets to a clean Dr Customer Advances / Cr
        // AR posting (no new cash line) — the diff against sourcePayment's
        // last-posted snapshot handles this automatically.
        const newAllocatedTotal = sourcePayment.allocations.reduce(
          (acc: number, a: any) => acc + (Number(a.amount) || 0),
          0,
        );
        await postCustomerPaymentJournal({
          payment: sourcePayment,
          tenantId,
          createdBy: session.user.id,
          current: {
            allocatedTotal: newAllocatedTotal,
            unusedAmount: sourcePayment.unusedAmount,
            bankCharges: sourcePayment.bankCharges,
            tdsAmount: sourcePayment.tdsAmount,
          },
          invoiceNumbers: [invoice.number],
        });

        await sourcePayment.save();

        await applyAllocationsToInvoices({
          tenantId,
          paymentId: String(sourcePayment._id),
          paymentNumber: sourcePayment.paymentNumber,
          paymentDate: sourcePayment.paymentDate,
          mode: sourcePayment.mode,
          allocations: [{ invoiceId: String(invoice._id), amount }],
        });
        imported++;
      } catch (e: any) {
        errors.push({ row: rowNumber, reason: e.message || "Failed to apply excess payment" });
        skipped++;
      }
    }

    return NextResponse.json({ success: true, imported, skipped, errors });
  } catch (error: any) {
    console.error("Applied Excess Payments Import Execution Error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
