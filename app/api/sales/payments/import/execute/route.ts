import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Customer from "@/models/Customer";
import { SalesInvoice } from "@/models/SalesInvoice";
import Payment from "@/models/Payment";
import Account from "@/models/Account";
import { generatePaymentNumber } from "@/lib/sales/paymentNumbering";
import { validateAllocations, applyAllocationsToInvoices } from "@/lib/sales/paymentAllocation";
import { postCustomerPaymentJournal } from "@/lib/accounting/payments";
import { PAYMENT_STATUS, PAYMENT_TYPE } from "@/lib/constants/statuses";
import * as xlsx from "xlsx";
import { validateSpreadsheetFile } from "@/lib/utils/fileValidation";

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
    const autoGenerateNumbers = formData.get("autoGenerateNumbers") !== "false";

    if (!file || !mappingStr) {
      return NextResponse.json({ success: false, message: "Missing file or mapping" }, { status: 400 });
    }

    const fileError = validateSpreadsheetFile(file);
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 });

    const mapping = JSON.parse(mappingStr) as Record<string, string>;
    const bytes = await file.arrayBuffer();
    // raw:false — prevents date columns from arriving as raw Excel serial
    // numbers that `new Date()` would misread.
    const workbook = xlsx.read(Buffer.from(bytes), { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false }) as any[];

    let imported = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // +1 for header row, +1 for 1-indexing
      const get = (key: string) => (mapping[key] ? row[mapping[key]] : undefined);

      const customerName = get("customerName");
      const dateRaw = get("date");
      const paymentAmountRaw = get("paymentAmount");

      if (!customerName) {
        errors.push({ row: rowNumber, message: "Customer Name is required" });
        skipped++;
        continue;
      }
      const paymentAmount = Number(paymentAmountRaw);
      if (!paymentAmount || paymentAmount <= 0) {
        errors.push({ row: rowNumber, message: "Payment Amount is required and must be greater than 0" });
        skipped++;
        continue;
      }

      const customer = await Customer.findOne({
        tenantId,
        $or: [{ "header.displayName": String(customerName).trim() }, { "header.name": String(customerName).trim() }],
      });
      if (!customer) {
        errors.push({ row: rowNumber, message: `Customer "${customerName}" not found — create the customer first` });
        skipped++;
        continue;
      }

      const bankCharges = Number(get("bankCharges")) || 0;
      const mode = get("mode") || "Cash";
      const reference = get("reference");
      const notes = get("notes");

      let depositToAccountId: any = undefined;
      const depositToName = get("depositTo");
      if (depositToName) {
        const account = await Account.findOne({
          tenantId,
          $or: [
            { accountName: String(depositToName).trim() },
            { name: String(depositToName).trim() },
            { accountCode: String(depositToName).trim() },
            { code: String(depositToName).trim() },
          ],
        });
        if (account) depositToAccountId = account._id;
        // Not found is fine for import: depositToAccountId is optional at the schema level.
      }

      let paymentNumber: string | undefined = autoGenerateNumbers ? undefined : get("paymentNumber");
      if (!paymentNumber) {
        const generated = await generatePaymentNumber(tenantId);
        paymentNumber = generated.number;
      }

      const paymentDate = dateRaw ? new Date(dateRaw) : new Date();
      const invoiceNumber = get("invoiceNumber");

      try {
        let invoice = null;
        if (invoiceNumber) {
          invoice = await (SalesInvoice as any).findOne({
            tenantId,
            number: String(invoiceNumber).trim(),
            customerId: customer._id,
          });
        }

        if (invoice) {
          const allocations = [{ invoiceId: String(invoice._id), amount: paymentAmount }];
          let unusedAmount: number;
          try {
            unusedAmount = validateAllocations(allocations, paymentAmount, bankCharges, 0);
          } catch (e: any) {
            errors.push({ row: rowNumber, message: e.message });
            skipped++;
            continue;
          }

          const payment = await Payment.create({
            tenantId,
            customerId: customer._id,
            paymentNumber,
            paymentDate,
            amountReceived: paymentAmount,
            bankCharges,
            mode,
            depositToAccountId,
            reference,
            taxDeducted: false,
            tdsAmount: 0,
            allocations,
            unusedAmount,
            status: PAYMENT_STATUS.PAID,
            paymentType: PAYMENT_TYPE.INVOICE_PAYMENT,
            notes,
          });

          try {
            await postCustomerPaymentJournal({
              payment,
              tenantId,
              createdBy: session.user.id,
              current: { allocatedTotal: paymentAmount, unusedAmount, bankCharges, tdsAmount: 0 },
              invoiceNumbers: [invoice.number],
            });
            await payment.save();
          } catch (postingError: any) {
            await Payment.deleteOne({ _id: payment._id });
            errors.push({ row: rowNumber, message: postingError.message });
            skipped++;
            continue;
          }

          await applyAllocationsToInvoices({
            tenantId,
            paymentId: String(payment._id),
            paymentNumber,
            paymentDate,
            mode,
            allocations,
          });
        } else {
          // No invoice number given or invoice not found: still a real
          // recorded payment — the money was received, just not yet applied.
          const payment = await Payment.create({
            tenantId,
            customerId: customer._id,
            paymentNumber,
            paymentDate,
            amountReceived: paymentAmount,
            bankCharges,
            mode,
            depositToAccountId,
            reference,
            taxDeducted: false,
            tdsAmount: 0,
            allocations: [],
            unusedAmount: paymentAmount,
            status: PAYMENT_STATUS.PAID,
            paymentType: PAYMENT_TYPE.INVOICE_PAYMENT,
            notes,
          });

          try {
            await postCustomerPaymentJournal({
              payment,
              tenantId,
              createdBy: session.user.id,
              current: { allocatedTotal: 0, unusedAmount: paymentAmount, bankCharges, tdsAmount: 0 },
            });
            await payment.save();
          } catch (postingError: any) {
            await Payment.deleteOne({ _id: payment._id });
            errors.push({ row: rowNumber, message: postingError.message });
            skipped++;
            continue;
          }
        }
        imported++;
      } catch (e: any) {
        errors.push({ row: rowNumber, message: e.message || "Failed to import row" });
        skipped++;
      }
    }

    return NextResponse.json({ success: true, imported, skipped, errors });
  } catch (error: any) {
    console.error("Payments Import Execution Error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
