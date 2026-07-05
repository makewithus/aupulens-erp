import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const PAYMENT_IMPORT_COLUMNS = [
  "Date",
  "Customer Name",
  "Invoice Number",
  "Payment Amount",
  "Bank Charges",
  "Payment Mode",
  "Reference Number",
  "Deposit To",
  "Payment Number",
  "Notes",
];

const SAMPLE_ROW = [
  "2026-07-01",
  "Acme Traders",
  "INV-000123",
  "5000",
  "50",
  "Cash",
  "TXN-9001",
  "Cash in Hand",
  "",
  "Partial settlement of outstanding invoice",
];

export async function GET(request: NextRequest) {
  const format = new URL(request.url).searchParams.get("format") === "xls" ? "xls" : "csv";
  const rows = [PAYMENT_IMPORT_COLUMNS, SAMPLE_ROW];

  if (format === "csv") {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="sample_payments.csv"' },
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Payments");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xls" });
  return new NextResponse(buffer, {
    headers: { "Content-Type": "application/vnd.ms-excel", "Content-Disposition": 'attachment; filename="sample_payments.xls"' },
  });
}
