import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/sales/SaleOrder";
import SalesView from "@/models/sales/SalesView";
import { buildMongoFilterFromCriteria, MANDATORY_SALE_ORDER_COLUMNS, AVAILABLE_SALE_ORDER_COLUMNS } from "@/lib/sales/saleOrderViews";
import { resolveSpecialFilter } from "@/lib/sales/saleOrderViews.server";
import * as XLSX from "xlsx";
import "@/models/sales/Customer";
import { PASSWORD_POLICY } from "@/lib/sales/passwordPolicy";

const SALES_ORDERS_ROW_LIMIT = 25000;
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
    const { mode = "sales-orders", format = "csv", password, viewId, period = "all", dateFrom, dateTo } = body;

    if (password && !PASSWORD_POLICY.test(password)) {
      return NextResponse.json(
        {
          error:
            "File protection password must be at least 12 characters and include an uppercase letter, lowercase letter, number, and special character.",
        },
        { status: 400 },
      );
    }

    let query: Record<string, any> = { tenantId, salesOrderStatus: { $ne: null } };
    let extraColumns: string[] = [];
    let rowLimit = SALES_ORDERS_ROW_LIMIT;

    if (mode === "current_view" && viewId) {
      const view = await SalesView.findOne({ _id: viewId, tenantId, entityType: "sales-orders" }).lean();
      if (view) {
        query = (view as any).specialFilter
          ? { ...query, ...(await resolveSpecialFilter((view as any).specialFilter)) }
          : { ...query, ...buildMongoFilterFromCriteria((view as any).criteria) };
        if ((view as any).columns?.length) extraColumns = (view as any).columns;
      }
      rowLimit = CURRENT_VIEW_ROW_LIMIT;
    } else if (period !== "all" && dateFrom) {
      query.createdAt = { $gte: new Date(dateFrom), ...(dateTo ? { $lte: new Date(dateTo) } : {}) };
    }

    const orders = await (SaleOrder as any)
      .find(query)
      .populate("header.partnerId", "header contact_details")
      .sort({ createdAt: -1 })
      .limit(rowLimit)
      .lean();

    const labelFor = (key: string) => AVAILABLE_SALE_ORDER_COLUMNS.find((c) => c.key === key)?.label || key;
    const header = [...MANDATORY_SALE_ORDER_COLUMNS.map((c) => c.label), ...extraColumns.map(labelFor)];
    const rows = orders.map((o: any) => [
      o.header?.dateOrder ? new Date(o.header.dateOrder).toLocaleDateString("en-IN") : "",
      o.header?.name || "",
      o.header?.partnerId?.header?.displayName || o.header?.partnerId?.header?.name || "",
      o.salesOrderStatus || "",
      o.totals?.amountTotal ?? "",
      ...extraColumns.map((key) => {
        const v = getByPath(o, key);
        return v == null ? "" : String(v);
      }),
    ]);
    const data = [header, ...rows];

    const filename = `sales_orders_${mode}_${Date.now()}`;

    if (format === "csv") {
      const csv = data.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      return new NextResponse(csv, {
        headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${filename}.csv"` },
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Sales Orders");
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
    console.error("Sales Order Export Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
