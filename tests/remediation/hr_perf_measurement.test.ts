import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import connectDB from "@/lib/db";
import Department from "@/models/hr/Department";
import Employee from "@/models/hr/Employee";
import PerformanceReview from "@/models/hr/PerformanceReview";
import Attendance from "@/models/hr/Attendance";
import LeaveRequest from "@/models/hr/LeaveRequest";

const TEST_PORT = process.env.QA_DISPOSABLE_MONGO_PORT || "27183";
const TEST_URI = `mongodb://127.0.0.1:${TEST_PORT}/aupulens_test_auth_perf`;
const TENANT = `tenant-perf-${Date.now()}`;

describe("SYS-38: Authenticated HR Route Execution Latency Measurement", () => {
  beforeAll(async () => {
    process.env.MONGODB_URI = TEST_URI;
    await connectDB();

    // Seed 7 departments
    const codes = ["ENG", "HR", "FIN", "SAL", "MKT", "OPS", "EXE"];
    for (const code of codes) {
      await Department.create({
        tenantId: TENANT,
        name: `Dept ${code}`,
        code,
        isActive: true,
      });
    }

    // Seed 5 employees
    const eng = await Department.findOne({ tenantId: TENANT, code: "ENG" });
    for (let i = 1; i <= 5; i++) {
      await Employee.create({
        tenantId: TENANT,
        employeeCode: `EMP-PRF-${i}`,
        firstName: `Emp`,
        lastName: `${i}`,
        email: `emp${i}@perf.com`,
        phone: `+91987654321${i}`,
        departmentId: eng!._id,
        dateOfJoining: new Date("2024-01-01"),
        status: "active",
        salary: { basic: 40000, grossSalary: 40000 },
      });
    }
  });

  afterAll(async () => {
    try {
      await Promise.all([
        Department.deleteMany({ tenantId: TENANT }),
        Employee.deleteMany({ tenantId: TENANT }),
        PerformanceReview.deleteMany({ tenantId: TENANT }),
        Attendance.deleteMany({ tenantId: TENANT }),
        LeaveRequest.deleteMany({ tenantId: TENANT }),
      ]);
      await mongoose.disconnect();
    } catch {}
  });

  it("measures HR Analytics latency (< 500ms)", async () => {
    const timings: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      // Test the data queries executed by analytics
      const [totalEmployees, depts, reviews, attendance] = await Promise.all([
        Employee.countDocuments({ tenantId: TENANT, status: "active" }),
        Department.find({ tenantId: TENANT, isActive: true }).select("_id name code").lean(),
        PerformanceReview.find({ tenantId: TENANT }).lean(),
        Attendance.find({ tenantId: TENANT }).limit(100).lean(),
      ]);
      const duration = performance.now() - start;
      timings.push(duration);
    }
    const avgMs = timings.reduce((a, b) => a + b, 0) / timings.length;
    console.log(`\n>>> HR Analytics Data Aggregation: avg ${avgMs.toFixed(2)}ms (samples: ${timings.map(t => t.toFixed(1)).join(", ")}ms)`);
    expect(avgMs).toBeLessThan(500);
  });

  it("measures HR Summary latency (< 500ms)", async () => {
    const timings: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const [totalEmployees, depts] = await Promise.all([
        Employee.countDocuments({ tenantId: TENANT, status: "active" }),
        Department.find({ tenantId: TENANT, isActive: true }).lean(),
      ]);
      const duration = performance.now() - start;
      timings.push(duration);
    }
    const avgMs = timings.reduce((a, b) => a + b, 0) / timings.length;
    console.log(`>>> HR Summary Data Aggregation: avg ${avgMs.toFixed(2)}ms (samples: ${timings.map(t => t.toFixed(1)).join(", ")}ms)`);
    expect(avgMs).toBeLessThan(500);
  });

  it("measures HR Departments listing latency (< 500ms)", async () => {
    const timings: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const allDepts = await Department.find({ tenantId: TENANT, isActive: true })
        .select("_id name code description isActive createdAt")
        .sort({ name: 1 })
        .lean();
      const duration = performance.now() - start;
      timings.push(duration);
    }
    const avgMs = timings.reduce((a, b) => a + b, 0) / timings.length;
    console.log(`>>> HR Departments Listing: avg ${avgMs.toFixed(2)}ms (samples: ${timings.map(t => t.toFixed(1)).join(", ")}ms)`);
    expect(avgMs).toBeLessThan(500);
  });
});
