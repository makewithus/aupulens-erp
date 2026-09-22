import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import ExcelJS from "exceljs";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_hr_export";
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Employee from "@/models/hr/Employee";
import Department from "@/models/hr/Department";
import LeaveRequest from "@/models/hr/LeaveRequest";
import Attendance from "@/models/hr/Attendance";
import Payroll from "@/models/hr/Payroll";
import { NextRequest } from "next/server";
import { mockSession } from "../accounting/_helpers/routeTestUtils";

const T = "t-hr-export";
let GET: typeof import("@/app/api/hr/reports/export/route").GET;
const uid = new mongoose.Types.ObjectId();

async function download(type: string) {
  vi.mocked(auth).mockResolvedValue(mockSession(T) as any);
  const res = await GET(new NextRequest(`http://x/api/hr/reports/export?type=${type}`));
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
  expect(res.headers.get("Content-Disposition")).toMatch(/\.xlsx"/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as any);
  return wb.worksheets[0];
}

const rowsOf = (ws: ExcelJS.Worksheet) => {
  const out: any[][] = [];
  ws.eachRow((r, i) => { if (i >= 5) out.push((r.values as any[]).slice(1)); });
  return out;
};

describe("HR Excel exports: data matches DB and formatting is presentation-ready", () => {
  let dept: any;
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    ({ GET } = await import("@/app/api/hr/reports/export/route"));
    dept = await Department.create({ tenantId: T, name: "Engineering, Core", code: "ENG" } as any);
    const mk = (n: number, life: string, d: any, gross = 0) => ({
      tenantId: T, employeeCode: `E${n}`, firstName: `Emp${n}`, lastName: "Test, Jr", email: `e${n}@x.com`, phone: "9876543210",
      dateOfJoining: new Date(), lifecycleStatus: life, departmentId: d, employmentType: "full-time",
      salary: { basic: gross, grossSalary: gross }, createdBy: uid,
    });
    await Employee.create([mk(1, "active", dept._id, 50000), mk(2, "active", dept._id, 40000), mk(3, "onboarding", undefined), mk(4, "exited", dept._id)] as any);
    await LeaveRequest.create([
      { tenantId: T, employeeId: uid, leaveType: "sick", startDate: new Date(), endDate: new Date(), totalDays: 2, reason: "x", status: "pending" },
      { tenantId: T, employeeId: uid, leaveType: "sick", startDate: new Date(), endDate: new Date(), totalDays: 1.5, reason: "x", status: "pending" },
    ] as any);
    await Attendance.create([
      { tenantId: T, employeeId: uid, date: new Date(), status: "present" },
      { tenantId: T, employeeId: new mongoose.Types.ObjectId(), date: new Date(), status: "present" },
      { tenantId: T, employeeId: new mongoose.Types.ObjectId(), date: new Date(), status: "absent" },
    ] as any);
    const now = new Date();
    await Payroll.create({
      tenantId: T, payrollCode: "PR-1", payrollPeriod: { month: now.getMonth() + 1, year: now.getFullYear(), startDate: now, endDate: now },
      lineItems: [{ employeeId: uid, employeeCode: "E1", employeeName: "Emp1 Test", grossSalary: 50000, deductions: { totalDeductions: 2000 }, netSalary: 48000, daysWorked: 22 }],
      totals: { totalGross: 50000, totalDeductions: 2000, totalNet: 48000 },
    } as any);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it("every report has title, styled+frozen header, filter and borders", async () => {
    for (const type of ["headcount", "departments", "attendance", "leave", "payroll", "hires", "employees"]) {
      const ws = await download(type);
      expect(String(ws.getCell("A1").value).length).toBeGreaterThan(3);
      expect(ws.getCell("A1").font?.bold).toBe(true);
      expect(String(ws.getCell("A2").value)).toMatch(/Generated|Period|Payroll period/);
      const h = ws.getRow(4).getCell(1);
      expect(h.font?.bold).toBe(true);
      expect((h.fill as any).fgColor.argb).toBe("FF1F3A5F");
      expect(h.border?.bottom?.style).toBe("thin");
      expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 4 });
      expect(ws.autoFilter).toBeTruthy();
      expect(ws.columns.every((c) => (c.width || 0) >= 10)).toBe(true);
    }
  });

  it("headcount matches DB counts (incl. exited) and total", async () => {
    const rows = rowsOf(await download("headcount"));
    const map = Object.fromEntries(rows.map((r) => [r[0], r[1]]));
    expect(map).toMatchObject({ Active: 2, Onboarding: 1, Exited: 1, "All Employees": 4 });
  });

  it("departments: active vs total, unassigned bucket, real numeric cells", async () => {
    const rows = rowsOf(await download("departments"));
    const eng = rows.find((r) => r[0] === "Engineering, Core")!;
    expect(eng.slice(2)).toEqual([2, 3]);
    expect(rows.find((r) => r[0] === "Unassigned")!.slice(2)).toEqual([0, 1]);
    expect(typeof eng[2]).toBe("number");
  });

  it("attendance and leave aggregate correctly", async () => {
    const att = Object.fromEntries(rowsOf(await download("attendance")).map((r) => [r[0], r[1]]));
    expect(att).toMatchObject({ Present: 2, Absent: 1 });
    const sick = rowsOf(await download("leave")).find((r) => r[0] === "Sick" && r[1] === "Pending")!;
    expect(sick.slice(2)).toEqual([2, 3.5]);
  });

  it("payroll: currency formats + totals formula; employees: date/currency typed", async () => {
    const pay = await download("payroll");
    expect(pay.getCell("F5").numFmt).toContain("₹");
    expect(pay.getCell("F5").value).toBe(50000);
    expect(pay.getCell("F5").alignment?.horizontal).toBe("right");
    expect((pay.getRow(6).getCell(6).value as any).formula).toBe("SUM(F5:F5)");

    const emp = await download("employees");
    expect(emp.getCell("H5").value).toBeInstanceOf(Date);
    expect(emp.getCell("H5").numFmt).toBe("dd-mmm-yyyy");
    expect(emp.getCell("J5").numFmt).toContain("₹");
    expect(rowsOf(emp)[0][1]).toBe("Emp1 Test, Jr");
    expect(rowsOf(emp)).toHaveLength(4);
  });
});
