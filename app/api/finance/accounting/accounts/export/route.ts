import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Account from "@/models/finance/Account";
import { gridToStyledXlsx, XLSX_MIME } from "@/lib/export/styledWorkbook";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    const body = await request.json();
    const { view, format } = body;

    let query: any = { tenantId };
    if (view === "active") query.isActive = true;
    else if (view === "inactive") query.isActive = false;

    const accounts = await Account.find(query)
      .populate("accountType", "name segment")
      .sort({ accountName: 1 });

    const csvData = [
      ["Account Name", "Account Code", "Account Type", "Segment", "Description", "Status"]
    ];

    for (const acc of accounts) {
      csvData.push([
        acc.accountName || "",
        acc.accountCode || "",
        (acc.accountType as any)?.name || "",
        (acc.accountType as any)?.segment || "",
        acc.description || "",
        acc.isActive ? "Active" : "Inactive"
      ]);
    }

    if (format === "csv") {
      const csvString = csvData.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
      return new NextResponse(csvString, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="chart_of_accounts_${new Date().getTime()}.csv"`,
        }
      });
    } else if (format === "xls" || format === "xlsx") {
      const buffer = await gridToStyledXlsx({ title: "Chart of Accounts", sheetName: "Accounts", data: csvData });
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": XLSX_MIME,
          "Content-Disposition": `attachment; filename="chart_of_accounts_${new Date().getTime()}.xlsx"`,
        }
      });
    }

    return NextResponse.json({ data: csvData });
  } catch (error) {
    console.error("Account Export Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
