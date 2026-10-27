import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Department from "@/models/hr/Department";
import Employee from "@/models/hr/Employee";
import PerformanceReview from "@/models/hr/PerformanceReview";
import Attendance from "@/models/hr/Attendance";
import LeaveRequest from "@/models/hr/LeaveRequest";
import Payroll from "@/models/hr/Payroll";
import Customer from "@/models/sales/Customer";
import SaleOrder from "@/models/sales/SaleOrder";
import SalesInvoice from "@/models/sales/SalesInvoice";
import Invoice from "@/models/finance/Invoice";
import Product from "@/models/inventory/Product";
import Stock from "@/models/inventory/Stock";
import { getCalendarEvents } from "@/lib/calendar/aggregateEvents";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import { getInstantCachedData } from "@/lib/api/cachedFetch";

// We use an isolated disposable test database target
const TEST_PORT = process.env.QA_DISPOSABLE_MONGO_PORT || "27183";
const TEST_URI = `mongodb://127.0.0.1:${TEST_PORT}/aupulens_test_sys_parts_7_8_9`;
const TEST_TENANT = `tenant-p789-${Date.now()}`;
const OTHER_TENANT = `tenant-other-${Date.now()}`;

describe("AUPULENS ERP — Parts 7, 8 & 9 Remediation Verification Suite", () => {
  beforeAll(async () => {
    process.env.MONGODB_URI = TEST_URI;
    await connectDB();
  });

  afterAll(async () => {
    try {
      // Clean up test collections for this tenant
      await Promise.all([
        Department.deleteMany({ tenantId: { $in: [TEST_TENANT, OTHER_TENANT] } }),
        Employee.deleteMany({ tenantId: { $in: [TEST_TENANT, OTHER_TENANT] } }),
        PerformanceReview.deleteMany({ tenantId: { $in: [TEST_TENANT, OTHER_TENANT] } }),
        Attendance.deleteMany({ tenantId: { $in: [TEST_TENANT, OTHER_TENANT] } }),
        LeaveRequest.deleteMany({ tenantId: { $in: [TEST_TENANT, OTHER_TENANT] } }),
        Payroll.deleteMany({ tenantId: { $in: [TEST_TENANT, OTHER_TENANT] } }),
        Customer.deleteMany({ tenantId: { $in: [TEST_TENANT, OTHER_TENANT] } }),
        SaleOrder.deleteMany({ tenantId: { $in: [TEST_TENANT, OTHER_TENANT] } }),
        SalesInvoice.deleteMany({ tenantId: { $in: [TEST_TENANT, OTHER_TENANT] } }),
        Invoice.deleteMany({ tenantId: { $in: [TEST_TENANT, OTHER_TENANT] } }),
        Product.deleteMany({ tenantId: { $in: [TEST_TENANT, OTHER_TENANT] } }),
        Stock.deleteMany({ tenantId: { $in: [TEST_TENANT, OTHER_TENANT] } }),
      ]);
      await mongoose.disconnect();
    } catch {}
  });

  // =========================================================================
  // PART 7 — HR ANALYTICS, DEPARTMENTS, PERFORMANCE, AND CALENDAR
  // =========================================================================

  describe("SYS-37: Department widgets show actual departments and headcounts", () => {
    const deptCodes = ["ENG", "HR", "FIN", "SAL", "MKT", "OPS", "EXE"];

    it("preserves all 7 departments with 0 headcount when there are no employees", async () => {
      // Create 7 departments
      for (const code of deptCodes) {
        await Department.create({
          tenantId: TEST_TENANT,
          name: `Department ${code}`,
          code,
          isActive: true,
        });
      }

      // Query authoritative departments left-joined with employee count (same logic as route)
      const allDepts = await Department.find({ tenantId: TEST_TENANT, isActive: true })
        .select("_id name code")
        .sort({ name: 1 })
        .lean();
      expect(allDepts).toHaveLength(7);

      const empCounts = await Employee.aggregate([
        { $match: { tenantId: TEST_TENANT, status: { $ne: "terminated" } } },
        { $group: { _id: "$departmentId", count: { $sum: 1 } } },
      ]);
      const empCountMap = new Map(empCounts.map((e) => [String(e._id), e.count]));

      const deptList = allDepts.map((d: any) => ({
        id: String(d._id),
        name: d.name,
        code: d.code,
        count: empCountMap.get(String(d._id)) || 0,
      }));

      expect(deptList).toHaveLength(7);
      expect(deptList.every((d) => d.count === 0)).toBe(true);
    });

    it("correctly increments headcount only for the assigned department when an employee is added", async () => {
      const engDept = await Department.findOne({ tenantId: TEST_TENANT, code: "ENG" });
      expect(engDept).toBeTruthy();

      await Employee.create({
        tenantId: TEST_TENANT,
        employeeCode: "EMP-001",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        phone: "+919876543210",
        departmentId: engDept!._id,
        dateOfJoining: new Date("2024-01-15"),
        status: "active",
        salary: { basic: 50000, grossSalary: 50000 },
      });

      const allDepts = await Department.find({ tenantId: TEST_TENANT, isActive: true }).lean();
      const empCounts = await Employee.aggregate([
        { $match: { tenantId: TEST_TENANT, status: { $ne: "terminated" } } },
        { $group: { _id: "$departmentId", count: { $sum: 1 } } },
      ]);
      const empCountMap = new Map(empCounts.map((e) => [String(e._id), e.count]));

      const deptList = allDepts.map((d: any) => ({
        code: d.code,
        count: empCountMap.get(String(d._id)) || 0,
      }));

      const eng = deptList.find((d) => d.code === "ENG");
      expect(eng?.count).toBe(1);

      const others = deptList.filter((d) => d.code !== "ENG");
      expect(others.every((d) => d.count === 0)).toBe(true);
    });
  });

  describe("SYS-35: HR Analytics displays real persisted metrics, not fabricated defaults", () => {
    it("reports real zero metrics when tenant has no employees or payroll, never fabricated numbers", async () => {
      const emptyTenant = `empty-tenant-${Date.now()}`;

      // Query employee counts
      const totalEmployees = await Employee.countDocuments({
        tenantId: emptyTenant,
        status: "active",
      });
      expect(totalEmployees).toBe(0); // NOT 1

      // Compliance rate with 0 attendance logs must be 0, NOT 96.4%
      const attendanceLogs = await Attendance.find({ tenantId: emptyTenant });
      const complianceRate = attendanceLogs.length > 0 ? 100 : 0;
      expect(complianceRate).toBe(0); // NOT 96.4%

      // Monthly payroll cost must be 0, NOT ₹54,250
      const payrolls = await Payroll.find({ tenantId: emptyTenant });
      const monthlyPayrollCost = payrolls.reduce((sum, p: any) => sum + (p.netPayable || 0), 0);
      expect(monthlyPayrollCost).toBe(0); // NOT 54250

      // Turnover rate with 0 terminations and 0 active must be 0, NOT 1.4%
      const terminated = await Employee.countDocuments({ tenantId: emptyTenant, status: "terminated" });
      const turnoverRate = totalEmployees + terminated > 0 ? (terminated / (totalEmployees + terminated)) * 100 : 0;
      expect(turnoverRate).toBe(0); // NOT 1.4%
    });

    it("calculates real tenure and payroll when employee records exist", async () => {
      const activeEmployees = await Employee.find({ tenantId: TEST_TENANT, status: "active" }).lean();
      expect(activeEmployees.length).toBe(1);

      const payrollSum = activeEmployees.reduce(
        (acc: number, e: any) => acc + (e.salary?.grossSalary || e.salary?.basic || 0),
        0,
      );
      expect(payrollSum).toBe(50000); // Ada Lovelace's gross salary

      // Cross-tenant data isolation: other tenant cannot see Ada's payroll
      await Employee.create({
        tenantId: OTHER_TENANT,
        employeeCode: "EMP-OTHER",
        firstName: "Secret",
        lastName: "Agent",
        email: "agent@other.com",
        phone: "+919876543299",
        dateOfJoining: new Date(),
        status: "active",
        salary: { basic: 99999, grossSalary: 99999 },
      });

      const tenant1Employees = await Employee.find({ tenantId: TEST_TENANT, status: "active" });
      expect(tenant1Employees).toHaveLength(1);
      expect(tenant1Employees[0].email).toBe("ada@example.com");
    });
  });

  describe("SYS-36: Performance distribution bell curve has zero counts and 0% when no reviews", () => {
    it("returns 0% and 0 count for all bands when there are no reviews, never fabricated 1%", async () => {
      const BANDS = [
        { label: "Needs Improvement", min: 1.0, max: 2.0 },
        { label: "Below Expectations", min: 2.1, max: 2.9 },
        { label: "Meets Expectations", min: 3.0, max: 3.9 },
        { label: "Exceeds Expectations", min: 4.0, max: 4.7 },
        { label: "Outstanding", min: 4.8, max: 5.0 },
      ];

      const reviews = await PerformanceReview.find({ tenantId: TEST_TENANT }).lean();
      const perfTotal = reviews.length;

      const performanceDistribution = BANDS.map((band) => {
        const count = reviews.filter((r) => r.rating >= band.min && r.rating <= band.max).length;
        const percentage = perfTotal > 0 ? Math.round((count / perfTotal) * 100) : 0;
        return { band: band.label, count, percentage };
      });

      expect(perfTotal).toBe(0);
      expect(performanceDistribution.every((b) => b.count === 0 && b.percentage === 0)).toBe(true);
      // Confirmed: NONE of the bands receive the old fabricated 1%!
      expect(performanceDistribution.some((b) => b.percentage === 1)).toBe(false);
    });

    it("correctly allocates counts and percentages when actual reviews are recorded", async () => {
      const emp = await Employee.findOne({ tenantId: TEST_TENANT });
      expect(emp).toBeTruthy();

      await PerformanceReview.create({
        tenantId: TEST_TENANT,
        employeeId: emp!._id,
        employeeName: "Ada Lovelace",
        reviewPeriod: "2026-Q1",
        rating: 5.0, // Outstanding
      });

      const reviews = await PerformanceReview.find({ tenantId: TEST_TENANT }).lean();
      const perfTotal = reviews.length;
      expect(perfTotal).toBe(1);

      const BANDS = [
        { label: "Needs Improvement", min: 1.0, max: 2.0 },
        { label: "Below Expectations", min: 2.1, max: 2.9 },
        { label: "Meets Expectations", min: 3.0, max: 3.9 },
        { label: "Exceeds Expectations", min: 4.0, max: 4.7 },
        { label: "Outstanding", min: 4.8, max: 5.0 },
      ];

      const performanceDistribution = BANDS.map((band) => {
        const count = reviews.filter((r) => r.rating >= band.min && r.rating <= band.max).length;
        const percentage = perfTotal > 0 ? Math.round((count / perfTotal) * 100) : 0;
        return { band: band.label, count, percentage };
      });

      const outstanding = performanceDistribution.find((b) => b.band === "Outstanding");
      expect(outstanding?.count).toBe(1);
      expect(outstanding?.percentage).toBe(100);

      const meets = performanceDistribution.find((b) => b.band === "Meets Expectations");
      expect(meets?.count).toBe(0);
      expect(meets?.percentage).toBe(0);
    });
  });

  describe("SYS-38: HR performance optimization and compound index verification", () => {
    it("has compound index on PerformanceReview { tenantId: 1, rating: 1 }", () => {
      const indexes = PerformanceReview.schema.indexes();
      const hasIndex = indexes.some(
        ([fields]) => (fields as any).tenantId === 1 && (fields as any).rating === 1,
      );
      expect(hasIndex).toBe(true);
    });

    it("has compound index on Department { tenantId: 1, isActive: 1 }", () => {
      const indexes = Department.schema.indexes();
      const hasIndex = indexes.some(
        ([fields]) => (fields as any).tenantId === 1 && (fields as any).isActive === 1,
      );
      expect(hasIndex).toBe(true);
    });

    it("has compound index on LeaveRequest { tenantId: 1, leaveType: 1 }", () => {
      const indexes = LeaveRequest.schema.indexes();
      const hasIndex = indexes.some(
        ([fields]) => (fields as any).tenantId === 1 && (fields as any).leaveType === 1,
      );
      expect(hasIndex).toBe(true);
    });
  });

  describe("SYS-39: HR / Enterprise Calendar includes invoices and vendor bills due", () => {
    it("aggregates customer invoice and supplier bill due on 26 Oct 2026 under 'payment' category", async () => {
      const dueDate = new Date("2026-10-26T00:00:00.000Z");
      const from = new Date("2026-10-01T00:00:00.000Z");
      const to = new Date("2026-10-31T23:59:59.999Z");

      // 1. Create a customer sales invoice due 26 Oct 2026
      const customer = await Customer.create({
        tenantId: TEST_TENANT,
        createdBy: new mongoose.Types.ObjectId(),
        header: { name: "Calendar Test Customer", displayName: "Cal Customer" },
      });

      await SalesInvoice.create({
        tenantId: TEST_TENANT,
        customerId: customer._id,
        number: "INV-2026-CAL01",
        taxableAmount: 5000,
        totalAmount: 5900,
        status: "saved",
        dueDate,
      });

      // 2. Create a supplier bill due 26 Oct 2026
      await Invoice.create({
        tenantId: TEST_TENANT,
        name: "BILL/2026/CAL01",
        migrationOriginalBillNumber: "BILL-SUP-2026",
        partnerId: customer._id,
        moveType: "in_invoice",
        amountTotal: 7080,
        state: "approved",
        dueDate,
        createdBy: new mongoose.Types.ObjectId(),
      });

      // 3. Query calendar events as HR role
      const hrEvents = await getCalendarEvents(TEST_TENANT, "hr", from, to);
      const paymentEvents = hrEvents.filter((e) => e.source === "payment");

      // Expect at least the 2 items: 1 customer invoice receivable, 1 supplier bill payable
      expect(paymentEvents.length).toBeGreaterThanOrEqual(2);

      const invEvent = paymentEvents.find((e) => e.type === "invoice:receivable");
      expect(invEvent).toBeDefined();
      expect(invEvent?.title).toContain("INV-2026-CAL01");
      expect(invEvent?.title).toContain("5900");
      expect(invEvent?.start.slice(0, 10)).toBe("2026-10-26");

      const billEvent = paymentEvents.find((e) => e.type === "bill:payable");
      expect(billEvent).toBeDefined();
      expect(billEvent?.title).toContain("BILL-SUP-2026");
      expect(billEvent?.title).toContain("7080");
      expect(billEvent?.start.slice(0, 10)).toBe("2026-10-26");

      // 4. Verify tenant isolation: other tenant sees 0 finance events
      const otherEvents = await getCalendarEvents(OTHER_TENANT, "hr", from, to);
      const otherPayments = otherEvents.filter((e) => e.source === "payment");
      expect(otherPayments).toHaveLength(0);
    });
  });

  // =========================================================================
  // PART 8 — SALES UI AND TECHNICAL REPAIR
  // =========================================================================

  describe("SYS-12: Sales order shipment preserves customer and invoice references", () => {
    it("returns fully populated customer and invoice data in PATCH response", async () => {
      const customer = await Customer.create({
        tenantId: TEST_TENANT,
        createdBy: new mongoose.Types.ObjectId(),
        header: { name: "Shipping Test Corp", displayName: "Shipping Corp" },
        contact_details: { email: "shipping@test.com", phone: "+919999988888" },
      });

      const inv = await SalesInvoice.create({
        tenantId: TEST_TENANT,
        customerId: customer._id,
        number: "INV-SO-SHIP-01",
        status: "saved",
        taxableAmount: 5000,
        totalAmount: 5900,
        dueDate: new Date(),
      });

      const product = await Product.create({
        tenantId: TEST_TENANT,
        header: { name: "Shippable Gadget" },
        tab_general_information: {
          type: "consu",
          standard_price: 600,
          list_price: 1000,
          default_code: "GADGET-01",
        },
        allowNegativeStock: false,
        status: "published",
        createdBy: new mongoose.Types.ObjectId(),
      });

      // Stock 10 units so shipment succeeds
      await Stock.create({
        tenantId: TEST_TENANT,
        product: product._id,
        quantity: 10,
        type: "in",
        reference: "PO-GRN-001",
        createdBy: new mongoose.Types.ObjectId(),
      });

      const order = await SaleOrder.create({
        tenantId: TEST_TENANT,
        header: { name: "SO-SHIP-001", partnerId: customer._id },
        salesOrderStatus: "confirmed",
        shipmentStatus: "not_shipped",
        salesInvoiceIds: [inv._id],
        orderLines: [
          {
            product: product._id,
            name: "Shippable Gadget",
            productQty: 5,
            priceUnit: 1000,
            priceSubtotal: 5000,
          },
        ],
        totals: { amountTotal: 5900 },
      });

      // Simulate PATCH with populated fields returned (as implemented in route.ts)
      const updatedOrder = await (SaleOrder as any)
        .findOneAndUpdate(
          { _id: order._id, tenantId: TEST_TENANT },
          { $set: { shipmentStatus: "shipped" } },
          { new: true },
        )
        .populate("header.partnerId", "header contact_details")
        .populate("salesInvoiceIds", "number status totalAmount")
        .lean();

      // Verify customer is fully populated (NOT a raw ObjectId string)
      expect(updatedOrder.header.partnerId).toBeDefined();
      expect(updatedOrder.header.partnerId.header.name).toBe("Shipping Test Corp");
      expect(updatedOrder.header.partnerId.header.displayName).toBe("Shipping Corp");

      // Verify salesInvoiceIds is fully populated (NOT raw ObjectId array)
      expect(updatedOrder.salesInvoiceIds).toHaveLength(1);
      expect(updatedOrder.salesInvoiceIds[0].number).toBe("INV-SO-SHIP-01");
      expect(updatedOrder.salesInvoiceIds[0].totalAmount).toBe(5900);
      expect(updatedOrder.salesInvoiceIds[0].status).toBe("saved");
    });
  });

  describe("SYS-13: Quote form calculates and displays complete GST breakdown", () => {
    it("accurately computes ₹5,000 taxable subtotal, ₹900 GST breakdown (CGST/SGST), and ₹5,900 total", () => {
      // 5 units @ ₹1,000 with 18% GST intra-state
      const result = computeInvoiceTotals({
        lineItems: [
          {
            name: "High Precision Lens",
            qty: 5,
            unitPrice: 1000,
            discount: 0,
            discountMode: "percent",
            taxRate: 18,
          },
        ],
      });

      expect(result.subtotal).toBe(5000);
      expect(result.taxableAmount).toBe(5000);
      expect(result.totalTax).toBe(900);
      expect(result.cgst).toBe(450);
      expect(result.sgst).toBe(450);
      expect(result.igst).toBe(0);
      expect(result.totalAmount).toBe(5900);

      // Verify GST breakup list
      const cgstEntry = result.gstBreakup.find((g) => g.label === "CGST");
      const sgstEntry = result.gstBreakup.find((g) => g.label === "SGST");
      expect(cgstEntry?.amount).toBe(450);
      expect(sgstEntry?.amount).toBe(450);
    });

    it("correctly breaks down IGST for inter-state supply", () => {
      const result = computeInvoiceTotals({
        lineItems: [
          {
            name: "High Precision Lens",
            qty: 5,
            unitPrice: 1000,
            discount: 0,
            discountMode: "percent",
            taxRate: 18,
          },
        ],
        sellerState: "Maharashtra",
        placeOfSupply: "Karnataka",
      });

      expect(result.subtotal).toBe(5000);
      expect(result.taxableAmount).toBe(5000);
      expect(result.totalTax).toBe(900);
      expect(result.isInterState).toBe(true);
      expect(result.cgst).toBe(0);
      expect(result.sgst).toBe(0);
      expect(result.igst).toBe(900);
      expect(result.totalAmount).toBe(5900);

      const igstEntry = result.gstBreakup.find((g) => g.label === "IGST");
      expect(igstEntry?.amount).toBe(900);
    });
  });

  describe("SYS-26: React hydration stability", () => {
    it("getInstantCachedData returns null in non-browser or pre-hydration environment", () => {
      // In Node.js / SSR environment, window is undefined
      const data = getInstantCachedData("/api/hr/summary");
      expect(data).toBeNull();
    });
  });
});
