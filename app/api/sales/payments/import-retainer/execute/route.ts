import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Customer from "@/models/Customer";
import Payment from "@/models/Payment";
import { generatePaymentNumber } from "@/lib/sales/paymentNumbering";
import { PAYMENT_STATUS, PAYMENT_TYPE } from "@/lib/constants/statuses";
import * as xlsx from "xlsx";

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

    const mapping = JSON.parse(mappingStr) as Record<string, string>;
    const bytes = await file.arrayBuffer();
    const workbook = xlsx.read(Buffer.from(bytes), { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false }) as any[];

    let imported = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2;
      const get = (key: string) => (mapping[key] ? row[mapping[key]] : undefined);

      const customerName = get("customerName");
      const amountRaw = get("amount");

      if (!customerName) {
        errors.push({ row: rowNumber, message: "Customer Name is required" });
        skipped++;
        continue;
      }
      const amount = Number(amountRaw);
      if (!amount || amount <= 0) {
        errors.push({ row: rowNumber, message: "Amount is required and must be greater than 0" });
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

      const mode = get("mode") || "Cash";
      const reference = get("reference");
      const dateRaw = get("date");
      const paymentDate = dateRaw ? new Date(dateRaw) : new Date();

      let paymentNumber: string | undefined = autoGenerateNumbers ? undefined : get("paymentNumber");
      if (!paymentNumber) {
        const generated = await generatePaymentNumber(tenantId);
        paymentNumber = generated.number;
      }

      try {
        await Payment.create({
          tenantId,
          customerId: customer._id,
          paymentNumber,
          paymentDate,
          amountReceived: amount,
          bankCharges: 0,
          mode,
          reference,
          taxDeducted: false,
          tdsAmount: 0,
          allocations: [],
          unusedAmount: amount, // the whole amount becomes customer credit for a retainer/advance
          status: PAYMENT_STATUS.PAID,
          paymentType: PAYMENT_TYPE.RETAINER,
        });
        imported++;
      } catch (e: any) {
        errors.push({ row: rowNumber, message: e.message || "Failed to import row" });
        skipped++;
      }
    }

    return NextResponse.json({ success: true, imported, skipped, errors });
  } catch (error: any) {
    console.error("Retainer Payments Import Execution Error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
