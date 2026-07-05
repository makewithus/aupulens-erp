import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Subscription from "@/models/Subscription";
import SalesView from "@/models/SalesView";
import { buildMongoFilterFromCriteria, AVAILABLE_SUBSCRIPTION_COLUMNS } from "@/lib/sales/subscriptionViews";
import { resolveSpecialFilter } from "@/lib/sales/subscriptionViews.server";
import * as XLSX from "xlsx";
import "@/models/Customer";

const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

const SUBSCRIPTIONS_ROW_LIMIT = 25000;
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
      mode = "subscriptions", // "subscriptions" | "current_view"
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
    let columns = AVAILABLE_SUBSCRIPTION_COLUMNS.map((c) => c.key);
    let rowLimit = SUBSCRIPTIONS_ROW_LIMIT;

    if (mode === "current_view" && viewId) {
      const view = await SalesView.findOne({ _id: viewId, tenantId, entityType: "subscriptions" }).lean();
      if (view) {
        query = (view as any).specialFilter
          ? { ...query, ...(await resolveSpecialFilter((view as any).specialFilter, tenantId)) }
          : { ...query, ...buildMongoFilterFromCriteria((view as any).criteria) };
        if ((view as any).columns?.length) columns = (view as any).columns;
      }
      rowLimit = CURRENT_VIEW_ROW_LIMIT;
    } else if (period !== "all" && dateFrom) {
      query.createdAt = { $gte: new Date(dateFrom), ...(dateTo ? { $lte: new Date(dateTo) } : {}) };
    }

    const subscriptions = await (Subscription as any)
      .find(query)
      .populate("customerId", "header contact_details")
      .sort({ createdAt: -1 })
      .limit(rowLimit)
      .lean();

    const labelFor = (key: string) => AVAILABLE_SUBSCRIPTION_COLUMNS.find((c) => c.key === key)?.label || key;
    const header = ["Number", "Customer Name", ...columns.map(labelFor)];
    const rows = subscriptions.map((s: any) => [
      s.number || "",
      s.customerId?.header?.displayName || s.customerId?.header?.name || "",
      ...columns.map((key) => {
        const v = getByPath(s, key);
        return v == null ? "" : String(v);
      }),
    ]);
    const data = [header, ...rows];

    // NOTE: same as customers/export — the password is validated but not yet
    // cryptographically applied to the file (no zip-encryption dependency here).
    const filename = `subscriptions_${mode}_${Date.now()}`;

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
    XLSX.utils.book_append_sheet(wb, ws, "Subscriptions");
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
    console.error("Subscription Export Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
