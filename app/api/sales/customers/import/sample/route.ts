import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const CUSTOMER_IMPORT_COLUMNS = [
  "Display Name",
  "Company Name",
  "Email",
  "Phone",
  "Mobile",
  "GSTIN",
  "PAN",
  "Currency",
  "Opening Balance",
  "Customer Type",
  "Billing Street",
  "Billing City",
  "Billing State",
  "Billing Zip",
];

const SAMPLE_ROW = [
  "Acme Traders",
  "Acme Traders Pvt Ltd",
  "accounts@acmetraders.com",
  "022-12345678",
  "9876543210",
  "27AAAPL1234C1Z5",
  "AAAPL1234C",
  "INR",
  "0",
  "business",
  "12 MG Road",
  "Mumbai",
  "Maharashtra",
  "400001",
];

export async function GET(request: NextRequest) {
  const format = new URL(request.url).searchParams.get("format") === "xls" ? "xls" : "csv";
  const rows = [CUSTOMER_IMPORT_COLUMNS, SAMPLE_ROW];

  if (format === "csv") {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="sample_customers.csv"',
      },
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Customers");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xls" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.ms-excel",
      "Content-Disposition": 'attachment; filename="sample_customers.xls"',
    },
  });
}
