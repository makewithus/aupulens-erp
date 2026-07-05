import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Customer from "@/models/Customer";
import SaleOrder from "@/models/SaleOrder";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import { generateSaleOrderNumber } from "@/lib/sales/saleOrderNumbering";
import { SALES_ORDER_STATUS, SALES_ORDER_SHIPMENT_STATUS, SALES_ORDER_INVOICING_STATUS } from "@/lib/constants/statuses";
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
    const autoGenerateNumbers = formData.get("autoGenerateNumbers") !== "false";

    if (!file || !mappingStr) {
      return NextResponse.json({ error: "Missing file or mapping" }, { status: 400 });
    }

    const mapping = JSON.parse(mappingStr) as Record<string, string>;
    const bytes = await file.arrayBuffer();
    // raw:false — see subscriptions import's fix: prevents date columns from
    // arriving as raw Excel serial numbers that `new Date()` would misread.
    const workbook = xlsx.read(Buffer.from(bytes), { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false }) as any[];

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const get = (key: string) => (mapping[key] ? row[mapping[key]] : undefined);

      const customerName = get("customerName");
      const itemName = get("itemName");

      if (!customerName) {
        errors.push(`Row ${i + 2}: Customer Name is required`);
        continue;
      }
      if (!itemName) {
        errors.push(`Row ${i + 2}: Item Name is required`);
        continue;
      }

      const customer = await Customer.findOne({
        tenantId,
        $or: [{ "header.displayName": String(customerName).trim() }, { "header.name": String(customerName).trim() }],
      });

      if (!customer) {
        errors.push(`Row ${i + 2}: Customer "${customerName}" not found — create the customer first`);
        skipped++;
        continue;
      }

      const qty = Number(get("quantity")) || 1;
      const rate = Number(get("rate")) || 0;
      const totals = computeInvoiceTotals({
        lineItems: [{ name: String(itemName), qty, unitPrice: rate, discount: 0, discountMode: "percent", taxRate: 0 }],
      });

      let number = autoGenerateNumbers ? undefined : get("salesOrderNumber");
      if (!number) {
        const generated = await generateSaleOrderNumber(tenantId);
        number = generated.number;
      }

      const orderDateRaw = get("orderDate");
      const expectedShipmentRaw = get("expectedShipmentDate");

      try {
        await SaleOrder.create({
          tenantId,
          header: {
            name: number,
            partnerId: customer._id,
            dateOrder: orderDateRaw ? new Date(orderDateRaw) : new Date(),
          },
          orderLines: totals.computedLines.map((line: any) => ({
            name: line.name,
            productQty: line.qty,
            priceUnit: line.unitPrice,
            taxIds: [],
            discount: line.discount,
            priceSubtotal: line.lineTotal,
          })),
          otherInfo: { clientOrderRef: get("reference") },
          totals: {
            amountUntaxed: totals.taxableAmount,
            amountTax: totals.totalTax,
            amountTotal: totals.totalAmount,
          },
          salesOrderStatus: SALES_ORDER_STATUS.DRAFT,
          shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.NOT_SHIPPED,
          invoicingStatus: SALES_ORDER_INVOICING_STATUS.NOT_INVOICED,
          expectedShipmentDate: expectedShipmentRaw ? new Date(expectedShipmentRaw) : undefined,
          paymentTermsLabel: get("paymentTerms") || "Due on Receipt",
          deliveryMethod: get("deliveryMethod"),
          subTotal: totals.subtotal,
          taxAmount: totals.totalTax,
          chatter: [],
        });
        imported++;
      } catch (e: any) {
        errors.push(`Row ${i + 2}: ${e.message}`);
      }
    }

    return NextResponse.json({ success: true, imported, skipped, overwritten: 0, errors });
  } catch (error) {
    console.error("Sales Order Import Execution Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
