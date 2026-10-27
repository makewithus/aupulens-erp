import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Attendance from "@/models/hr/Attendance";
import Employee from "@/models/hr/Employee";
import Payroll from "@/models/hr/Payroll";
import { invalidateServerCache } from "@/lib/api/serverCache";

const TENANT = `qa-sys35-${Date.now()}`;
const mockSession = {
  user: {
    id: new mongoose.Types.ObjectId().toString(),
    email: "hr-analytics@example.test",
    role: "admin",
    tenantId: TENANT,
  },
  expires: new Date(Date.now() + 60_000).toISOString(),
};

let analyticsGET: typeof import("@/app/api/hr/analytics/route").GET;

describe("SYS-35: HR analytics uses recorded data and does not disguise query failures", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Attendance.init();
    await Employee.init();
    ({ GET: analyticsGET } = await import("@/app/api/hr/analytics/route"));
  });

  afterAll(async () => {
    await Promise.all([
      Attendance.deleteMany({ tenantId: TENANT }),
      Employee.deleteMany({ tenantId: TENANT }),
      Payroll.deleteMany({ tenantId: TENANT }),
    ]);
    invalidateServerCache();
    await mongoose.disconnect();
  });

  it("returns a real empty attendance series for an empty tenant", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    const response = await analyticsGET(new NextRequest("http://localhost/api/hr/analytics?fresh=true"));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.attendanceTrends).toEqual([]);
    expect(data.kpis.attendanceCompliance).toBe(0);
    expect(data.kpis.totalHeadcount).toBe(0);
  });

  it("calculates weekday presence and leave from actual attendance rows", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    const employeeA = await Employee.create({
      tenantId: TENANT,
      employeeCode: "SYS35-A",
      firstName: "Ada",
      lastName: "One",
      email: "ada.one@example.test",
      phone: "9000000001",
      dateOfJoining: new Date("2025-01-01T00:00:00.000Z"),
      lifecycleStatus: "active",
      salary: { basic: 100, grossSalary: 100 },
    });
    const employeeB = await Employee.create({
      tenantId: TENANT,
      employeeCode: "SYS35-B",
      firstName: "Grace",
      lastName: "Two",
      email: "grace.two@example.test",
      phone: "9000000002",
      dateOfJoining: new Date("2025-02-01T00:00:00.000Z"),
      lifecycleStatus: "active",
      salary: { basic: 100, grossSalary: 100 },
    });
    await Employee.create({
      tenantId: TENANT,
      employeeCode: "SYS35-C",
      firstName: "Katherine",
      lastName: "Three",
      email: "katherine.three@example.test",
      phone: "9000000003",
      dateOfJoining: new Date("2024-01-01T00:00:00.000Z"),
      lifecycleStatus: "exited",
      exitDetails: { lastWorkingDate: new Date("2026-10-26T00:00:00.000Z") },
    });
    await Attendance.create([
      { tenantId: TENANT, employeeId: employeeA._id, date: new Date("2026-10-26T09:00:00.000Z"), status: "present" },
      { tenantId: TENANT, employeeId: employeeB._id, date: new Date("2026-10-26T09:00:00.000Z"), status: "on-leave" },
      { tenantId: TENANT, employeeId: employeeA._id, date: new Date("2026-10-27T09:00:00.000Z"), status: "absent" },
    ]);

    const beforeDisbursement = await analyticsGET(new NextRequest("http://localhost/api/hr/analytics?fresh=true&range=30D"));
    expect((await beforeDisbursement.json()).kpis.monthlyGrossPayroll).toBe(0);
    await Payroll.create({
      tenantId: TENANT,
      payrollCode: "SYS35-2026-10",
      payrollPeriod: {
        month: 10,
        year: 2026,
        startDate: new Date("2026-10-01T00:00:00.000Z"),
        endDate: new Date("2026-10-31T23:59:59.999Z"),
      },
      lineItems: [employeeA, employeeB].map((employee, index) => ({
        employeeId: employee._id,
        employeeCode: `SYS35-${index + 1}`,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        basic: 100,
        grossSalary: 100,
        netSalary: 100,
      })),
      totals: { totalGross: 200, totalDeductions: 0, totalNet: 200, totalOvertime: 0, totalLOP: 0, currency: "INR" },
      status: "posted_to_gl",
      disbursedAt: new Date(),
    });

    const response = await analyticsGET(new NextRequest("http://localhost/api/hr/analytics?fresh=true&range=30D"));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.attendanceTrends).toEqual([
      { day: "Mon", present: 50, onLeave: 50, rate: 50, count: 2 },
      { day: "Tue", present: 0, onLeave: 0, rate: 0, count: 1 },
    ]);
    expect(data.attendanceTrends.every((day: any) => !("remote" in day))).toBe(true);
    expect(data.kpis.attendanceCompliance).toBeCloseTo(33.3, 1);
    expect(data.kpis.monthlyGrossPayroll).toBe(200);
    expect(data.payrollAllocation.find((part: any) => part.component === "Base Fixed Salaries").amount).toBe(200);
    expect(data.kpis.avgTenureYears).toBe(1.8);
    expect(data.kpis.periodExitRate).toBeCloseTo(33.3, 1);
    expect(data.headcountTrajectory.at(-1)).toMatchObject({ hires: 0, exits: 1, headcount: 2 });
  });

  it("returns an error response when an analytics query fails instead of reporting zero data", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    const countSpy = vi.spyOn(Employee, "countDocuments").mockRejectedValueOnce(new Error("synthetic query failure"));
    try {
      const response = await analyticsGET(new NextRequest("http://localhost/api/hr/analytics?fresh=true"));
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Failed to generate dynamic HR analytics");
      expect(JSON.stringify(data)).not.toContain("synthetic query failure");
    } finally {
      countSpy.mockRestore();
    }
  });
});
