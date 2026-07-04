import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const QUOTE_IMPORT_COLUMNS = [
  "Quote Number",
  "Customer Display Name",
  "Quote Date",
  "Expiry Date",
  "Subject",
  "Item Name",
  "Quantity",
  "Rate",
];

const SAMPLE_ROW = ["QT-000001", "Acme Traders", "2026-07-01", "2026-07-31", "Website revamp", "Design Services", "1", "50000"];

export async function GET(request: NextRequest) {
  const format = new URL(request.url).searchParams.get("format") === "xls" ? "xls" : "csv";
  const rows = [QUOTE_IMPORT_COLUMNS, SAMPLE_ROW];

  if (format === "csv") {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="sample_quotes.csv"' },
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Quotes");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xls" });
  return new NextResponse(buffer, {
    headers: { "Content-Type": "application/vnd.ms-excel", "Content-Disposition": 'attachment; filename="sample_quotes.xls"' },
  });
}
