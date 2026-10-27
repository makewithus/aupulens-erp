import { describe, it, expect, vi, beforeEach } from "vitest";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/aupulens_test_batch_aup008";
import { NextRequest } from "next/server";

// 1. Document Intelligence
import { GET as getDocIntel } from "@/app/api/document-intelligence/[id]/route";

// 2. Finance Accounting Config
import { GET as getBankingRule } from "@/app/api/finance/accounting/banking-rules/[id]/route";
import { GET as getBudget } from "@/app/api/finance/accounting/budgets/[id]/route";
import { GET as getCurrencyAdj } from "@/app/api/finance/accounting/currency-adjustments/[id]/route";
import { GET as getJournalTemplate } from "@/app/api/finance/accounting/journal-templates/[id]/route";

// 3. Finance Transaction Records
import { GET as getBill } from "@/app/api/finance/bills/[id]/route";
import { GET as getExpense } from "@/app/api/finance/expenses/[id]/route";
import { GET as getJournalEntry } from "@/app/api/finance/journal-entries/[id]/route";
import { GET as getPeriodClosing } from "@/app/api/finance/period-closing/[id]/route";
import { GET as getPurchaseOrder } from "@/app/api/finance/purchase-orders/[id]/route";

// 4. HR
import { GET as getAttendance } from "@/app/api/hr/attendance/[id]/route";
import { GET as getDepartment } from "@/app/api/hr/departments/[id]/route";
import { GET as getEmployee } from "@/app/api/hr/employees/[id]/route";
import { GET as getPayroll } from "@/app/api/hr/payroll/[id]/route";

// 5. Integrations
import { GET as getIntegrationConnection } from "@/app/api/integrations/connections/[id]/route";

// 6. Inventory
import { GET as getManufacturingOperation } from "@/app/api/inventory/operations/manufacturing/[id]/route";
import { GET as getInventoryTransfer } from "@/app/api/inventory/operations/transfers/[id]/route";
import { GET as getStockMove } from "@/app/api/inventory/stock-moves/[id]/route";
import { GET as getWarehouse } from "@/app/api/inventory/warehouse/[id]/route";

// 7. Manufacturing
import { GET as getBom } from "@/app/api/manufacturing/bom/[id]/route";
import { GET as getCoupon } from "@/app/api/manufacturing/coupons/[id]/route";
import { GET as getItemBom } from "@/app/api/manufacturing/item-bom/[id]/route";
import { GET as getManufacturingItem } from "@/app/api/manufacturing/items/[id]/route";

// 8. Organization
import { GET as getOrgUnitConsolidated } from "@/app/api/org/units/[id]/consolidated/route";

// 9. Projects
import { GET as getProject } from "@/app/api/projects/[id]/route";

// Mock DB connection
vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue({}) }));

// Mock Auth
let currentAuthSession: any = {
  user: {
    id: "60d5ec49f1b2c8b1f8e4e1a1",
    tenantId: "test-tenant-100",
    role: "admin",
  },
};

vi.mock("@/auth", () => ({
  auth: vi.fn(() => Promise.resolve(currentAuthSession)),
}));

// Mock Mongoose models so missing-ID returns null (404) without database dependency
function createModelQueryMock(resolvedValue: any = null) {
  const query: any = {
    populate: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(resolvedValue),
    then: (resolve: any) => Promise.resolve(resolvedValue).then(resolve),
  };
  return query;
}

vi.mock("@/models/ai/ExtractedDocument", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/finance/BankingRule", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/finance/Budget", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/finance/CurrencyAdjustment", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/finance/JournalTemplate", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/finance/Invoice", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/finance/Expense", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/finance/JournalEntry", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/finance/PeriodClosing", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/finance/PurchaseOrder", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/hr/Attendance", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/hr/Department", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/hr/Employee", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)), countDocuments: vi.fn().mockResolvedValue(0) },
}));
vi.mock("@/models/hr/Payroll", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/shared/Integration", () => ({
  default: { findOne: vi.fn(() => Promise.resolve(null)) },
}));
vi.mock("@/models/manufacturing/ManufacturingOrder", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/inventory/StockTransfer", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/inventory/StockMove", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/inventory/Warehouse", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/manufacturing/BillOfMaterial", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/manufacturing/Coupon", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/manufacturing/ItemBOM", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/manufacturing/Item", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));
vi.mock("@/models/admin/OrgUnit", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)), find: vi.fn(() => createModelQueryMock([])) },
  ORG_LEVELS: ["Company", "Region", "Branch", "Office", "Warehouse", "Department", "Team", "Employee"],
}));
vi.mock("@/models/shared/Project", () => ({
  default: { findOne: vi.fn(() => createModelQueryMock(null)) },
}));

describe("Batch TC-0651 to TC-0700 | AUP-008: Malformed ObjectId and Safe Error Handling", () => {
  const dummyReq = new NextRequest("http://localhost:3000/api/test");
  const malformedParams = Promise.resolve({ id: "invalid-object-id-12345" });
  const missingValidParams = Promise.resolve({ id: "507f1f77bcf86cd799439011" });

  beforeEach(() => {
    currentAuthSession = {
      user: {
        id: "60d5ec49f1b2c8b1f8e4e1a1",
        tenantId: "test-tenant-100",
        role: "admin",
      },
    };
  });

  describe("Module 1 — Document Intelligence (TC-0651, TC-0652)", () => {
    it("TC-0652: Malformed ID returns HTTP 400 Bad Request", async () => {
      const res = await getDocIntel(dummyReq, { params: malformedParams });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid identifier format");
    });

    it("TC-0651: Missing valid ID returns HTTP 404 Not Found", async () => {
      const res = await getDocIntel(dummyReq, { params: missingValidParams });
      expect(res.status).toBe(404);
    });
  });

  describe("Module 2 — Finance: Accounting Configuration (TC-0653 to TC-0660)", () => {
    it("TC-0654 & TC-0653: Banking Rules malformed (400) and missing (404)", async () => {
      const malformedRes = await getBankingRule(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getBankingRule(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });

    it("TC-0656 & TC-0655: Budgets malformed (400) and missing (404)", async () => {
      const malformedRes = await getBudget(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getBudget(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });

    it("TC-0658 & TC-0657: Currency Adjustments malformed (400) and missing (404)", async () => {
      const malformedRes = await getCurrencyAdj(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getCurrencyAdj(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });

    it("TC-0660 & TC-0659: Journal Templates malformed (400) and missing (404)", async () => {
      const malformedRes = await getJournalTemplate(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getJournalTemplate(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });
  });

  describe("Module 3 — Finance: Transaction Records (TC-0661 to TC-0670)", () => {
    it("TC-0662 & TC-0661: Bills malformed (400) and missing (404)", async () => {
      const malformedRes = await getBill(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getBill(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });

    it("TC-0664 & TC-0663: Expenses malformed (400) and missing (404)", async () => {
      const malformedRes = await getExpense(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getExpense(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });

    it("TC-0666 & TC-0665: Journal Entries malformed (400) and missing (404)", async () => {
      const malformedRes = await getJournalEntry(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getJournalEntry(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });

    it("TC-0668 & TC-0667: Period Closing malformed (400) and missing (404)", async () => {
      const malformedRes = await getPeriodClosing(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getPeriodClosing(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });

    it("TC-0670 & TC-0669: Purchase Orders malformed (400) and missing (404)", async () => {
      const malformedRes = await getPurchaseOrder(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getPurchaseOrder(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });
  });

  describe("Module 4 — Human Resources (TC-0671 to TC-0678)", () => {
    it("TC-0672 & TC-0671: Attendance malformed (400) and missing (404)", async () => {
      const malformedRes = await getAttendance(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getAttendance(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });

    it("TC-0674 & TC-0673: Departments malformed (400) and missing (404)", async () => {
      const malformedRes = await getDepartment(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getDepartment(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });

    it("TC-0676 & TC-0675: Employees malformed (400) and missing (404)", async () => {
      const malformedRes = await getEmployee(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getEmployee(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });

    it("TC-0678 & TC-0677: Payroll malformed (400) and missing (404)", async () => {
      const malformedRes = await getPayroll(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getPayroll(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });
  });

  describe("Module 5 — Integrations (TC-0679, TC-0680)", () => {
    it("TC-0680: Integration Connections malformed returns HTTP 400", async () => {
      const res = await getIntegrationConnection(dummyReq, { params: malformedParams });
      expect(res.status).toBe(400);
    });

    it("TC-0679: Integration Connections missing returns HTTP 404", async () => {
      const res = await getIntegrationConnection(dummyReq, { params: missingValidParams });
      expect(res.status).toBe(404);
    });
  });

  describe("Module 6 — Inventory (TC-0681 to TC-0688)", () => {
    it("TC-0682 & TC-0681: Manufacturing operations malformed (400) and missing (404)", async () => {
      const malformedRes = await getManufacturingOperation(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getManufacturingOperation(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });

    it("TC-0684 & TC-0683: Inventory transfers malformed (400) and missing (404)", async () => {
      const malformedRes = await getInventoryTransfer(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getInventoryTransfer(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });

    it("TC-0686 & TC-0685: Stock moves malformed (400) and missing (404)", async () => {
      const malformedRes = await getStockMove(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getStockMove(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });

    it("TC-0688 & TC-0687: Warehouse malformed (400) and missing (404)", async () => {
      const malformedRes = await getWarehouse(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getWarehouse(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });
  });

  describe("Module 7 — Manufacturing (TC-0689 to TC-0696)", () => {
    it("TC-0690 & TC-0689: BOM malformed (400) and missing (404)", async () => {
      const malformedRes = await getBom(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getBom(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });

    it("TC-0692 & TC-0691: Coupons malformed (400) and missing (404)", async () => {
      const malformedRes = await getCoupon(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getCoupon(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });

    it("TC-0694 & TC-0693: Item BOM malformed (400) and missing (404)", async () => {
      const malformedRes = await getItemBom(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getItemBom(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });

    it("TC-0696 & TC-0695: Manufacturing Items malformed (400) and missing (404)", async () => {
      const malformedRes = await getManufacturingItem(dummyReq, { params: malformedParams });
      expect(malformedRes.status).toBe(400);
      const missingRes = await getManufacturingItem(dummyReq, { params: missingValidParams });
      expect(missingRes.status).toBe(404);
    });
  });

  describe("Module 8 — Organization (TC-0697, TC-0698)", () => {
    it("TC-0698: Org unit consolidated malformed returns HTTP 400", async () => {
      const res = await getOrgUnitConsolidated(dummyReq, { params: malformedParams });
      expect(res.status).toBe(400);
    });

    it("TC-0697: Org unit consolidated missing returns HTTP 404", async () => {
      const res = await getOrgUnitConsolidated(dummyReq, { params: missingValidParams });
      expect(res.status).toBe(404);
    });
  });

  describe("Module 9 — Projects (TC-0699, TC-0700)", () => {
    it("TC-0700: Project with malformed ID returns HTTP 400 Bad Request for authorized project user", async () => {
      currentAuthSession = { user: { id: "60d5ec49f1b2c8b1f8e4e1a1", tenantId: "test-tenant-100", role: "project" } };
      const res = await getProject(dummyReq, { params: malformedParams });
      expect(res.status).toBe(400);
    });

    it("TC-0699: Project with missing valid ID returns HTTP 404 Not Found for authorized project user", async () => {
      currentAuthSession = { user: { id: "60d5ec49f1b2c8b1f8e4e1a1", tenantId: "test-tenant-100", role: "project" } };
      const res = await getProject(dummyReq, { params: missingValidParams });
      expect(res.status).toBe(404);
    });

    it("TC-0699 & TC-0700: Project with unauthorized role returns HTTP 403 Forbidden", async () => {
      currentAuthSession = { user: { id: "60d5ec49f1b2c8b1f8e4e1a1", tenantId: "test-tenant-100", role: "sales" } };
      // Valid ID with unauthorized role returns 403
      const res = await getProject(dummyReq, { params: missingValidParams });
      expect(res.status).toBe(403);
    });
  });

  describe("Section C — Regression Matrix: Cross-Cutting Security Dimensions", () => {
    it("Unauthenticated requests return HTTP 401 across endpoints", async () => {
      currentAuthSession = null;
      const resDoc = await getDocIntel(dummyReq, { params: missingValidParams });
      expect(resDoc.status).toBe(401);
      const resExp = await getExpense(dummyReq, { params: missingValidParams });
      expect(resExp.status).toBe(401);
      const resEmp = await getEmployee(dummyReq, { params: missingValidParams });
      expect(resEmp.status).toBe(401);
      const resConn = await getIntegrationConnection(dummyReq, { params: missingValidParams });
      expect(resConn.status).toBe(401);
      const resWh = await getWarehouse(dummyReq, { params: missingValidParams });
      expect(resWh.status).toBe(401);
      const resBom = await getBom(dummyReq, { params: missingValidParams });
      expect(resBom.status).toBe(401);
      const resProj = await getProject(dummyReq, { params: missingValidParams });
      expect(resProj.status).toBe(401);
    });

    it("Operator-like and MongoDB injection payloads return HTTP 400 Bad Request", async () => {
      const operatorParams = Promise.resolve({ id: '{"$gt": ""}' });
      const bracketParams = Promise.resolve({ id: "[$ne]=admin" });
      const nullByteParams = Promise.resolve({ id: "507f1f77bcf86cd799439011\0malicious" });

      const res1 = await getDocIntel(dummyReq, { params: operatorParams });
      expect(res1.status).toBe(400);

      const res2 = await getExpense(dummyReq, { params: bracketParams });
      expect(res2.status).toBe(400);

      const res3 = await getWarehouse(dummyReq, { params: nullByteParams });
      expect(res3.status).toBe(400);

      const res4 = await getBom(dummyReq, { params: operatorParams });
      expect(res4.status).toBe(400);
    });

    it("Unexpected database errors return safe HTTP 500 without leaking stack traces or internal details", async () => {
      const Expense = (await import("@/models/finance/Expense")).default;
      (Expense.findOne as any).mockImplementationOnce(() => {
        throw new Error("MongoNetworkTimeoutError: connection lost to cluster 0");
      });

      const res = await getExpense(dummyReq, { params: missingValidParams });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toBeDefined();
      // Ensure stack trace and internals are never exposed
      expect(JSON.stringify(body)).not.toContain("MongoNetworkTimeoutError");
      expect(JSON.stringify(body)).not.toContain("stack");
      expect(JSON.stringify(body)).not.toContain("cluster 0");
    });
  });
});
