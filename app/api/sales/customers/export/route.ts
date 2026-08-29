import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Customer from "@/models/sales/Customer";
import SalesView from "@/models/sales/SalesView";
import { buildMongoFilterFromCriteria, AVAILABLE_CUSTOMER_COLUMNS } from "@/lib/sales/customerViews";
import { resolveSpecialFilter } from "@/lib/sales/customerViews.server";
import * as XLSX from "xlsx";

const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

const CUSTOMERS_ROW_LIMIT = 25000;
const CURRENT_VIEW_ROW_LIMIT = 10000;

function getByPath(obj: any, path: string) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const tenantId = session.user.tenantId;

    const body = await request.json();
    const {
      mode = "customers", // "customers" | "current_view"
      format = "csv", // csv | xls | xlsx
      password,
      viewId,
      period = "all", // customers mode: "all" | { from, to }
      dateFrom,
      dateTo,
      includePII = false,
    } = body;

    const PII_COLUMN_KEYS = ["contact_details.email", "contact_details.phone"];

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
    let columns = AVAILABLE_CUSTOMER_COLUMNS.map((c) => c.key);
    let rowLimit = CUSTOMERS_ROW_LIMIT;

    if (mode === "current_view" && viewId) {
      const view = await SalesView.findOne({ _id: viewId, tenantId }).lean();
      if (view) {
        query = (view as any).specialFilter
          ? { ...query, ...(await resolveSpecialFilter((view as any).specialFilter, tenantId, Customer)) }
          : { ...query, ...buildMongoFilterFromCriteria((view as any).criteria) };
        if ((view as any).columns?.length) columns = (view as any).columns;
      }
      rowLimit = CURRENT_VIEW_ROW_LIMIT;
    } else if (period !== "all" && dateFrom) {
      query.createdAt = { $gte: new Date(dateFrom), ...(dateTo ? { $lte: new Date(dateTo) } : {}) };
    }

    if (mode !== "current_view" && !includePII) {
      columns = columns.filter((key) => !PII_COLUMN_KEYS.includes(key));
    }

    const customers = await Customer.find(query).sort({ createdAt: -1 }).limit(rowLimit).lean();

    const labelFor = (key: string) => AVAILABLE_CUSTOMER_COLUMNS.find((c) => c.key === key)?.label || key;
    const header = ["Display Name", ...columns.map(labelFor)];
    const rows = customers.map((c: any) => [
      c.header?.displayName || c.header?.name || "",
      ...columns.map((key) => {
        const v = getByPath(c, key);
        return v == null ? "" : String(v);
      }),
    ]);
    const data = [header, ...rows];

    // NOTE: "File Protection Password" is validated above (client + server) but not yet
    // cryptographically applied to the exported archive — this codebase has no
    // zip-encryption dependency (e.g. archiver + a ZipCrypto plugin) today. Adding real
    // password-protected packaging is a follow-up; the file itself is generated for real.
    const filename = `customers_${mode}_${Date.now()}`;

    if (format === "csv") {
      const csv = data.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${filename}.csv"`,
        },
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    const bookType = format === "xlsx" ? "xlsx" : "xls";
    const buffer = XLSX.write(wb, { type: "buffer", bookType });
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          bookType === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/vnd.ms-excel",
        "Content-Disposition": `attachment; filename="${filename}.${bookType}"`,
      },
    });
  } catch (error: any) {
    console.error("Customer Export Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
