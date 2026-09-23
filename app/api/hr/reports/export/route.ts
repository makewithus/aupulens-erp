export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import connectDB from "@/lib/db";
import Employee from "@/models/hr/Employee";
import Department from "@/models/hr/Department";
import Payroll from "@/models/hr/Payroll";
import LeaveRequest from "@/models/hr/LeaveRequest";
import Attendance from "@/models/hr/Attendance";
import { buildStyledXlsx, XLSX_MIME, type ReportColumn } from "@/lib/export/styledWorkbook";

// Excel exports for HR > Reports. Every report reads the database directly
// (not the dashboard summary payload) so the numbers in the file always match
// the source records, and all use the shared presentation-ready workbook
// builder (title, styled/frozen header, typed cells, widths, borders).

const TYPES = ["headcount", "departments", "attendance", "leave", "payroll", "hires", "employees"] as const;
type ReportType = (typeof TYPES)[number];

const cap = (s: string) => (s || "").replace(/[_-]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const guard = requireTenantId(session);
    if (guard) return guard;
    const tenantId = (session.user as any).tenantId;

    const type = req.nextUrl.searchParams.get("type") as ReportType;
    if (!TYPES.includes(type)) {
      return NextResponse.json({ error: "Please choose a valid report to export." }, { status: 400 });
    }
    await connectDB();

    const now = new Date();
    let title = "";
    let columns: ReportColumn[] = [];
    let rows: any[][] = [];
    let totals: Record<number, "sum"> | undefined;
    let subtitle: string | undefined;

    if (type === "headcount") {
      title = "Headcount Report";
      const groups = await Employee.aggregate([{ $match: { tenantId } }, { $group: { _id: "$lifecycleStatus", count: { $sum: 1 } } }]);
      const total = groups.reduce((s, g) => s + g.count, 0);
      columns = [
        { header: "Lifecycle Status", width: 24 },
        { header: "Employees", type: "integer" },
        { header: "Share of Total", type: "percent" },
      ];
      rows = groups
        .sort((a, b) => b.count - a.count)
        .map((g) => [cap(g._id || "unknown"), g.count, total ? g.count / total : 0]);
      rows.push(["All Employees", total, total ? 1 : 0]);
    } else if (type === "departments") {
      title = "Department Distribution";
      const groups = await Employee.aggregate([
        { $match: { tenantId } },
        { $group: { _id: "$departmentId", total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ["$lifecycleStatus", "active"] }, 1, 0] } } } },
      ]);
      const depts = await Department.find({ tenantId }).select("name code").lean();
      const byId = new Map(depts.map((d: any) => [String(d._id), d]));
      columns = [
        { header: "Department", width: 28 },
        { header: "Code", width: 12 },
        { header: "Active Employees", type: "integer" },
        { header: "Total Employees (all statuses)", type: "integer" },
      ];
      rows = groups
        .map((g) => {
          const d: any = g._id ? byId.get(String(g._id)) : null;
          return [d?.name || "Unassigned", d?.code || "", g.active, g.total];
        })
        .sort((a, b) => b[3] - a[3]);
      totals = { 2: "sum", 3: "sum" };
    } else if (type === "attendance") {
      const from = req.nextUrl.searchParams.get("from");
      const to = req.nextUrl.searchParams.get("to");
      const start = from && !isNaN(Date.parse(from)) ? day(new Date(from)) : day(now);
      const end = to && !isNaN(Date.parse(to)) ? new Date(day(new Date(to)).getTime() + 86400000) : new Date(start.getTime() + 86400000);
      title = "Attendance Summary";
      subtitle = `Period: ${start.toLocaleDateString("en-IN")} – ${new Date(end.getTime() - 1).toLocaleDateString("en-IN")}`;
      const groups = await Attendance.aggregate([
        { $match: { tenantId, date: { $gte: start, $lt: end } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]);
      const total = groups.reduce((s, g) => s + g.count, 0);
      columns = [
        { header: "Attendance Status", width: 24 },
        { header: "Records", type: "integer" },
        { header: "Share of Total", type: "percent" },
      ];
      rows = groups.sort((a, b) => b.count - a.count).map((g) => [cap(g._id), g.count, total ? g.count / total : 0]);
    } else if (type === "leave") {
      title = "Leave Summary";
      const groups = await LeaveRequest.aggregate([
        { $match: { tenantId } },
        { $group: { _id: { status: "$status", type: "$leaveType" }, requests: { $sum: 1 }, days: { $sum: "$totalDays" } } },
      ]);
      columns = [
        { header: "Leave Type", width: 20 },
        { header: "Status", width: 16 },
        { header: "Requests", type: "integer" },
        { header: "Total Days", type: "number" },
      ];
      rows = groups
        .map((g) => [cap(g._id.type), cap(g._id.status), g.requests, g.days])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));
      totals = { 2: "sum", 3: "sum" };
    } else if (type === "payroll") {
      const month = Number(req.nextUrl.searchParams.get("month")) || now.getMonth() + 1;
      const year = Number(req.nextUrl.searchParams.get("year")) || now.getFullYear();
      title = "Payroll Summary";
      subtitle = `Payroll period: ${new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" })}`;
      const runs = await Payroll.find({ tenantId, "payrollPeriod.month": month, "payrollPeriod.year": year }).lean();
      columns = [
        { header: "Payroll Run", width: 22 },
        { header: "Status", width: 16 },
        { header: "Employee Code", width: 16 },
        { header: "Employee Name", width: 26 },
        { header: "Days Worked", type: "number" },
        { header: "Gross Salary", type: "currency" },
        { header: "Total Deductions", type: "currency" },
        { header: "Net Salary", type: "currency" },
      ];
      for (const r of runs as any[]) {
        for (const li of r.lineItems || []) {
          rows.push([r.payrollCode, cap(r.status), li.employeeCode, li.employeeName, li.daysWorked || 0, li.grossSalary || 0, li.deductions?.totalDeductions || 0, li.netSalary || 0]);
        }
      }
      totals = { 5: "sum", 6: "sum", 7: "sum" };
    } else if (type === "hires") {
      title = "Recent Hires (last 90 days)";
      const since = new Date(now.getTime() - 90 * 86400000);
      const list = await Employee.find({ tenantId, dateOfJoining: { $gte: since } })
        .populate("departmentId", "name")
        .sort({ dateOfJoining: -1 })
        .lean();
      columns = [
        { header: "Employee Code", width: 16 },
        { header: "Name", width: 26 },
        { header: "Designation", width: 24 },
        { header: "Department", width: 22 },
        { header: "Date of Joining", type: "date" },
        { header: "Status", width: 16 },
      ];
      rows = (list as any[]).map((e) => [e.employeeCode, `${e.firstName} ${e.lastName}`.trim(), e.designation || "", e.departmentId?.name || "Unassigned", e.dateOfJoining, cap(e.lifecycleStatus)]);
    } else {
      title = "Employee Directory";
      const list = await Employee.find({ tenantId }).populate("departmentId", "name").sort({ employeeCode: 1 }).lean();
      columns = [
        { header: "Employee Code", width: 16 },
        { header: "Name", width: 26 },
        { header: "Email", width: 30 },
        { header: "Phone", width: 16 },
        { header: "Designation", width: 24 },
        { header: "Department", width: 22 },
        { header: "Employment Type", width: 16 },
        { header: "Date of Joining", type: "date" },
        { header: "Status", width: 16 },
        { header: "Gross Salary", type: "currency" },
      ];
      rows = (list as any[]).map((e) => [e.employeeCode, `${e.firstName} ${e.lastName}`.trim(), e.email, e.phone, e.designation || "", e.departmentId?.name || "Unassigned", cap(e.employmentType || ""), e.dateOfJoining, cap(e.lifecycleStatus), e.salary?.grossSalary || 0]);
    }

    const buffer = await buildStyledXlsx({ title, subtitle, columns, rows, totals });
    const filename = `${title.replace(/[^\w]+/g, "_").replace(/_+$/, "")}_${now.toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("HR report export error:", error);
    return NextResponse.json({ error: "We couldn't generate this report. Please try again." }, { status: 500 });
  }
}
