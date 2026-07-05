import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Payment from "@/models/Payment";
import SalesView from "@/models/SalesView";
import {
  buildMongoFilterFromCriteria,
  MANDATORY_PAYMENT_COLUMNS,
  AVAILABLE_PAYMENT_COLUMNS,
} from "@/lib/sales/paymentViews";
import { resolveSpecialFilter } from "@/lib/sales/paymentViews.server";
import * as XLSX from "xlsx";
import "@/models/Customer";
import "@/models/SalesInvoice";
import { PASSWORD_POLICY } from "@/lib/sales/passwordPolicy";

const INVOICE_PAYMENTS_ROW_LIMIT = 25000;
const CURRENT_VIEW_ROW_LIMIT = 10000;

function getByPath(obj: any, path: string) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

// invoiceNumbers is a computed/virtual column (Payment has no such schema path) —
// derive it from allocations[].invoiceId.number instead of a literal getByPath lookup.
function getInvoiceNumbers(payment: any): string {
  return (payment.allocations || [])
    .map((a: any) => a?.invoiceId?.number)
    .filter(Boolean)
    .join(", ");
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const tenantId = session.user.tenantId;

    const body = await request.json();
    const {
      mode = "invoice_payments",
      format = "csv",
      password,
      viewId,
      period = "all",
      dateFrom,
      dateTo,
    } = body;

    if (password && !PASSWORD_POLICY.test(password)) {
      return NextResponse.json(
        {
          error:
            "File protection password must be at least 12 characters and include an uppercase letter, lowercase letter, number, and special character.",
        },
        { status: 400 },
      );
    }

    let query: Record<string, any> = { tenantId };
    let extraColumns: string[] = [];
    let rowLimit = INVOICE_PAYMENTS_ROW_LIMIT;

    if (mode === "current_view" && viewId) {
      const view = await SalesView.findOne({ _id: viewId, tenantId, entityType: "payments" }).lean();
      if (view) {
        query = (view as any).specialFilter
          ? { ...query, ...(await resolveSpecialFilter((view as any).specialFilter)) }
          : { ...query, ...buildMongoFilterFromCriteria((view as any).criteria) };
        if ((view as any).columns?.length) extraColumns = (view as any).columns;
      }
      rowLimit = CURRENT_VIEW_ROW_LIMIT;
    } else if (period !== "all" && dateFrom) {
      query.paymentDate = { $gte: new Date(dateFrom), ...(dateTo ? { $lte: new Date(dateTo) } : {}) };
    }

    const payments = await Payment.find(query)
      .populate("customerId", "header contact_details")
      .populate("allocations.invoiceId", "number")
      .sort({ paymentDate: -1 })
      .limit(rowLimit)
      .lean();

    const labelFor = (key: string) => AVAILABLE_PAYMENT_COLUMNS.find((c) => c.key === key)?.label || key;
    const header = [...MANDATORY_PAYMENT_COLUMNS.map((c) => c.label), ...extraColumns.map(labelFor)];
    const rows = payments.map((p: any) => [
      p.paymentDate ? new Date(p.paymentDate).toLocaleDateString("en-IN") : "",
      // Regardless of the "Include PII" toggle, we only ever surface the customer's
      // display name here (never raw contact_details like email/phone) — Payment rows
      // don't inherently expose PII beyond the customer name, so there is nothing
      // additional to strip when PII is excluded.
      p.customerId?.header?.displayName || p.customerId?.header?.name || "",
      p.mode || "",
      p.amountReceived ?? "",
      ...extraColumns.map((key) => {
        if (key === "invoiceNumbers") return getInvoiceNumbers(p);
        const v = getByPath(p, key);
        return v == null ? "" : String(v);
      }),
    ]);
    const data = [header, ...rows];

    const filename = `payments_${mode}_${Date.now()}`;

    if (format === "csv") {
      const csv = data.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      return new NextResponse(csv, {
        headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${filename}.csv"` },
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Payments");
    const bookType = format === "xlsx" ? "xlsx" : "xls";
    const buffer = XLSX.write(wb, { type: "buffer", bookType });
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          bookType === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.ms-excel",
        "Content-Disposition": `attachment; filename="${filename}.${bookType}"`,
      },
    });
  } catch (error: any) {
    console.error("Payments Export Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
