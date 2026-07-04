import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SalesQuotation from "@/models/SalesQuotation";
import Customer from "@/models/Customer";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import { generateQuoteNumber } from "@/lib/sales/quoteNumbering";
import { QUOTE_STATUS } from "@/lib/constants/statuses";
import * as xlsx from "xlsx";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const tenantId = session.user.tenantId || "default-tenant";

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const mappingStr = formData.get("mapping") as string;
    const autoGenerate = formData.get("autoGenerateNumbers") === "true";

    if (!file || !mappingStr) return NextResponse.json({ error: "Missing file or mapping" }, { status: 400 });
    const mapping = JSON.parse(mappingStr) as Record<string, string>;

    const workbook = xlsx.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];

    // Group rows into quotes: rows sharing a Quote Number become line items of
    // the same quote (unless auto-generating, where every row is its own quote).
    const groups = new Map<string, any[]>();
    rows.forEach((row, i) => {
      const key = !autoGenerate && mapping.quoteNumber && row[mapping.quoteNumber] ? String(row[mapping.quoteNumber]) : `__row_${i}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    });

    let imported = 0;
    const errors: string[] = [];

    for (const [key, groupRows] of groups) {
      const first = groupRows[0];
      const customerName = mapping.customerName ? String(first[mapping.customerName] || "").trim() : "";
      if (!customerName) {
        errors.push(`${key}: Customer Display Name is required`);
        continue;
      }

      const customer = await Customer.findOne({
        tenantId,
        $or: [{ "header.displayName": customerName }, { "header.name": customerName }],
      });
      if (!customer) {
        errors.push(`${key}: Customer "${customerName}" not found — create the customer first`);
        continue;
      }

      const lineItems = groupRows.map((row) => ({
        name: mapping.itemName ? String(row[mapping.itemName] || "Item") : "Item",
        qty: mapping.quantity ? Number(row[mapping.quantity]) || 1 : 1,
        unitPrice: mapping.rate ? Number(row[mapping.rate]) || 0 : 0,
        discount: 0,
        discountMode: "percent" as const,
        taxRate: 0,
        lineTotal: 0,
      }));

      const totals = computeInvoiceTotals({ lineItems });
      const quoteNumber = autoGenerate || !mapping.quoteNumber ? (await generateQuoteNumber(tenantId)).number : String(first[mapping.quoteNumber]);

      try {
        await SalesQuotation.create({
          tenantId,
          quoteNumber,
          customerId: customer._id,
          quoteDate: mapping.quoteDate && first[mapping.quoteDate] ? new Date(first[mapping.quoteDate]) : new Date(),
          expiryDate: mapping.expiryDate && first[mapping.expiryDate] ? new Date(first[mapping.expiryDate]) : undefined,
          subject: mapping.subject ? String(first[mapping.subject] || "") : undefined,
          lineItems: totals.computedLines,
          taxableAmount: totals.taxableAmount,
          totalDiscount: totals.totalDiscount,
          totalAmount: totals.totalAmount,
          status: QUOTE_STATUS.DRAFT,
          createdBy: session.user.id,
        });
        imported++;
      } catch (e: any) {
        errors.push(`${key}: ${e.message}`);
      }
    }

    return NextResponse.json({ success: true, imported, errors });
  } catch (error) {
    console.error("Quote Import Execution Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
