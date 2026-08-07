import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Customer from "@/models/Customer";
import SaleOrder from "@/models/SaleOrder";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import { generateSaleOrderNumber } from "@/lib/sales/saleOrderNumbering";
import { SALES_ORDER_STATUS, SALES_ORDER_SHIPMENT_STATUS, SALES_ORDER_INVOICING_STATUS } from "@/lib/constants/statuses";
import * as xlsx from "xlsx";
import { validateSpreadsheetFile } from "@/lib/utils/fileValidation";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const mappingStr = formData.get("mapping") as string;
    const autoGenerateNumbers = formData.get("autoGenerateNumbers") !== "false";

    if (!file || !mappingStr) {
      return NextResponse.json({ error: "Missing file or mapping" }, { status: 400 });
    }

    const fileError = validateSpreadsheetFile(file);
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 });

    const mapping = JSON.parse(mappingStr) as Record<string, string>;
    const bytes = await file.arrayBuffer();
    // raw:false — see subscriptions import's fix: prevents date columns from
    // arriving as raw Excel serial numbers that `new Date()` would misread.
    const workbook = xlsx.read(Buffer.from(bytes), { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false }) as any[];

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Group rows into orders: rows sharing a Sales Order Number become line
    // items of the same order (unless auto-generating, where every row is its
    // own order), mirroring the Quotes import's grouping behavior.
    const groups = new Map<string, { rows: any[]; firstRowIndex: number }>();
    rows.forEach((row, i) => {
      const key =
        !autoGenerateNumbers && mapping.salesOrderNumber && row[mapping.salesOrderNumber]
          ? String(row[mapping.salesOrderNumber])
          : `__row_${i}`;
      if (!groups.has(key)) groups.set(key, { rows: [], firstRowIndex: i });
      groups.get(key)!.rows.push(row);
    });

    for (const [key, { rows: groupRows, firstRowIndex }] of groups) {
      const first = groupRows[0];
      const get = (row: any, field: string) => (mapping[field] ? row[mapping[field]] : undefined);
      const rowLabel = groupRows.length > 1 ? `Rows ${firstRowIndex + 2}-${firstRowIndex + 1 + groupRows.length}` : `Row ${firstRowIndex + 2}`;

      const customerName = get(first, "customerName");
      if (!customerName) {
        errors.push(`${rowLabel}: Customer Name is required`);
        continue;
      }

      const missingItemRow = groupRows.findIndex((row) => !get(row, "itemName"));
      if (missingItemRow !== -1) {
        errors.push(`Row ${firstRowIndex + 2 + missingItemRow}: Item Name is required`);
        continue;
      }

      const customer = await Customer.findOne({
        tenantId,
        $or: [{ "header.displayName": String(customerName).trim() }, { "header.name": String(customerName).trim() }],
      });

      if (!customer) {
        errors.push(`${rowLabel}: Customer "${customerName}" not found — create the customer first`);
        skipped++;
        continue;
      }

      const totals = computeInvoiceTotals({
        lineItems: groupRows.map((row) => ({
          name: String(get(row, "itemName")),
          qty: Number(get(row, "quantity")) || 1,
          unitPrice: Number(get(row, "rate")) || 0,
          discount: 0,
          discountMode: "percent" as const,
          taxRate: 0,
        })),
      });

      let number = autoGenerateNumbers ? undefined : get(first, "salesOrderNumber");
      if (!number) {
        const generated = await generateSaleOrderNumber(tenantId);
        number = generated.number;
      }

      const orderDateRaw = get(first, "orderDate");
      const expectedShipmentRaw = get(first, "expectedShipmentDate");

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
          otherInfo: { clientOrderRef: get(first, "reference") },
          totals: {
            amountUntaxed: totals.taxableAmount,
            amountTax: totals.totalTax,
            amountTotal: totals.totalAmount,
          },
          salesOrderStatus: SALES_ORDER_STATUS.DRAFT,
          shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.NOT_SHIPPED,
          invoicingStatus: SALES_ORDER_INVOICING_STATUS.NOT_INVOICED,
          expectedShipmentDate: expectedShipmentRaw ? new Date(expectedShipmentRaw) : undefined,
          paymentTermsLabel: get(first, "paymentTerms") || "Due on Receipt",
          deliveryMethod: get(first, "deliveryMethod"),
          subTotal: totals.subtotal,
          taxAmount: totals.totalTax,
          chatter: [],
        });
        imported++;
      } catch (e: any) {
        errors.push(`${key}: ${e.message}`);
      }
    }

    return NextResponse.json({ success: true, imported, skipped, overwritten: 0, errors });
  } catch (error) {
    console.error("Sales Order Import Execution Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
