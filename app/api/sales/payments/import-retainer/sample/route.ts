import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

const RETAINER_PAYMENT_IMPORT_COLUMNS = [
  "Date",
  "Customer Name",
  "Amount",
  "Payment Mode",
  "Reference Number",
  "Payment Number",
];

const SAMPLE_ROW = ["2026-07-01", "Acme Traders", "10000", "Cash", "ADV-9001", ""];

export async function GET(request: NextRequest) {
  const format = new URL(request.url).searchParams.get("format") === "xls" ? "xls" : "csv";
  const rows = [RETAINER_PAYMENT_IMPORT_COLUMNS, SAMPLE_ROW];

  if (format === "csv") {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="sample_retainer_payments.csv"' },
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Retainer Payments");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xls" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.ms-excel",
      "Content-Disposition": 'attachment; filename="sample_retainer_payments.xls"',
    },
  });
}
