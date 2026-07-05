import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const EXCESS_PAYMENT_IMPORT_COLUMNS = ["Customer Name", "Payment Number", "Invoice Number", "Amount to Apply"];

const SAMPLE_ROW = ["Acme Traders", "", "INV-000456", "1500"];

export async function GET(request: NextRequest) {
  const format = new URL(request.url).searchParams.get("format") === "xls" ? "xls" : "csv";
  const rows = [EXCESS_PAYMENT_IMPORT_COLUMNS, SAMPLE_ROW];

  if (format === "csv") {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="sample_applied_excess_payments.csv"',
      },
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Applied Excess Payments");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xls" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.ms-excel",
      "Content-Disposition": 'attachment; filename="sample_applied_excess_payments.xls"',
    },
  });
}
