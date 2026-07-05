import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const SUBSCRIPTION_IMPORT_COLUMNS = [
  "Customer Name",
  "Plan Name",
  "Item Name",
  "Quantity",
  "Rate",
  "Billing Frequency",
  "Start Date",
  "Trial Days",
  "Billing Cycles",
  "Subscription Number",
  "Customer Notes",
  "Billing Street",
  "Billing City",
  "Billing State",
  "Billing Zip",
];

const SAMPLE_ROW = [
  "Acme Traders",
  "Gold Plan - Monthly",
  "Web Hosting",
  "1",
  "999",
  "monthly",
  "2026-07-01",
  "0",
  "",
  "",
  "Thank you for subscribing.",
  "12 MG Road",
  "Mumbai",
  "Maharashtra",
  "400001",
];

export async function GET(request: NextRequest) {
  const format = new URL(request.url).searchParams.get("format") === "xls" ? "xls" : "csv";
  const rows = [SUBSCRIPTION_IMPORT_COLUMNS, SAMPLE_ROW];

  if (format === "csv") {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="sample_subscriptions.csv"',
      },
    });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Subscriptions");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xls" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.ms-excel",
      "Content-Disposition": 'attachment; filename="sample_subscriptions.xls"',
    },
  });
}
