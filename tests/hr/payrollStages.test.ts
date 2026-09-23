import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_payroll_stages";
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Employee from "@/models/hr/Employee";
import Attendance from "@/models/hr/Attendance";
import Payroll from "@/models/hr/Payroll";
import { mockSession } from "../accounting/_helpers/routeTestUtils";

const T = "t-payroll-stages";
const uid = new mongoose.Types.ObjectId();
let POST: any, PATCH: any;

const emp = (n: number, gross: number, pt: number) => ({
  tenantId: T, employeeCode: `E${n}`, firstName: `Emp${n}`, lastName: "X", email: `e${n}@x.com`, phone: "9876543210",
  dateOfJoining: new Date("2025-01-01"), lifecycleStatus: "active", createdBy: uid,
  salary: { basic: gross, grossSalary: gross, deductions: { professionalTax: pt, pf: 0, esi: 0, tds: 0, otherDeductions: 0 } },
});

async function advance(id: string, status: string) {
  const res = await PATCH(new NextRequest(`http://x/api/hr/payroll/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }), { params: Promise.resolve({ id }) });
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
}

describe("payroll amounts stay consistent across stages", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    ({ POST } = await import("@/app/api/hr/payroll/route"));
    ({ PATCH } = await import("@/app/api/hr/payroll/[id]/route"));
    await Employee.create([emp(1, 26000, 200), emp(2, 0, 200)] as any); // E2 has no salary set but a flat PT
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it("no attendance recorded -> compute keeps the draft gross (no collapse to 0); zero-salary employee never goes negative", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession(T) as any);
    const now = new Date();
    const res = await POST(new NextRequest("http://x/api/hr/payroll", { method: "POST", body: JSON.stringify({ month: now.getMonth() + 1, year: now.getFullYear() }) }));
    const draft: any = (await res.json()).payroll;
    const id = draft._id;
    expect(draft.totals.totalGross).toBe(26000);
    expect(draft.totals.totalNet).toBe(25800); // E1 26000-200, E2 0 (PT capped at 0 gross)

    for (const s of ["attendance_locked", "computed", "reviewed"]) await advance(id, s);
    const computed: any = await Payroll.findById(id).lean();
    expect(computed.totals.totalGross).toBe(draft.totals.totalGross);
    expect(computed.totals.totalNet).toBe(draft.totals.totalNet);
    expect(computed.lineItems.every((l: any) => l.netSalary >= 0)).toBe(true);
  });

  it("with attendance, pay is prorated and holidays/week-offs count as paid", async () => {
    await Payroll.deleteMany({ tenantId: T });
    const e1 = await Employee.findOne({ tenantId: T, employeeCode: "E1" });
    const now = new Date();
    const days = [];
    for (let d = 1; d <= 13; d++) days.push({ tenantId: T, employeeId: e1!._id, date: new Date(now.getFullYear(), now.getMonth(), d, 12), status: d <= 10 ? "present" : "holiday" });
    await Attendance.create(days as any);
    const res = await POST(new NextRequest("http://x/api/hr/payroll", { method: "POST", body: JSON.stringify({ month: now.getMonth() + 1, year: now.getFullYear(), departmentId: undefined }) }));
    const body: any = await res.json();
    const id = body.payroll?._id;
    expect(id, JSON.stringify(body)).toBeTruthy();
    for (const s of ["attendance_locked", "computed"]) await advance(id, s);
    const c: any = await Payroll.findById(id).lean();
    const l = c.lineItems.find((x: any) => x.employeeCode === "E1");
    expect(l.daysWorked).toBe(13);
    expect(l.grossSalary).toBe(13000); // 13/26 of 26000
  });
});
