import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const SALES_ORDER_IMPORT_COLUMNS = [
  "Customer Name",
  "Sales Order Number",
  "Reference#",
  "Order Date",
  "Expected Shipment Date",
  "Payment Terms",
  "Delivery Method",
  "Item Name",
  "Quantity",
  "Rate",
];

const SAMPLE_ROW = [
  "Acme Traders",
  "",
  "PO-1001",
  "2026-07-05",
  "2026-07-15",
  "Due on Receipt",
  "Standard Shipping",
  "Web Hosting",
  "2",
  "999",
];

export async function GET(request: NextRequest) {
  const format = new URL(request.url).searchParams.get("format") === "xls" ? "xls" : "csv";
  const rows = [SALES_ORDER_IMPORT_COLUMNS, SAMPLE_ROW];

  if (format === "csv") {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="sample_sales_orders.csv"' },
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sales Orders");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xls" });
  return new NextResponse(buffer, {
    headers: { "Content-Type": "application/vnd.ms-excel", "Content-Disposition": 'attachment; filename="sample_sales_orders.xls"' },
  });
}
