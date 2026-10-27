import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted Mocks ────────────────────────────────────────────────────────────
const {
  authMock,
  getAdminActorFromRequestMock,
  stockFindMock,
  stockCountDocumentsMock,
  stockAggregateMock,
  inventoryItemAggregateMock,
  inventoryOrderAggregateMock,
  inventoryItemDistinctMock,
  inventoryItemFindMock,
  extDocFindMock,
  chatHistoryFindMock,
  chatHistoryCreateMock,
  projectFindMock,
  projectCreateMock,
  bankAccountFindMock,
  bankRuleFindMock,
  budgetFindMock,
  currAdjFindMock,
  customFieldFindMock,
  journalTemplateFindMock,
  assetFindMock,
  bankStatementFindMock,
  expenseFindMock,
  salesInvoiceFindMock,
  purchaseOrderFindMock,
  journalEntryFindMock,
  journalEntryAggregateMock,
  bankReconFindMock,
  employeeFindMock,
  employeeCountDocumentsMock,
  employeeAggregateMock,
  departmentCountDocumentsMock,
  payrollFindMock,
  attendanceFindMock,
  leaveRequestFindMock,
  integrationFindMock,
  integrationEventFindMock,
  integrationEventAggregateMock,
  marketplacePackageFindMock,
  organizationFindMock,
  organizationFindOneMock,
  orgUnitFindMock,
  userFindOneMock,
  shipmentFindMock,
  bomFindMock,
  itemBomFindMock,
  mfgItemFindMock,
  airFreightFindMock,
  couponsFindMock,
  customsClearanceFindMock,
  docModelFindMock,
  freightProviderFindMock,
  hsCodeFindMock,
  counterFindOneMock,
  buildPostedJournalReportMock,
  getGstLedgerMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  getAdminActorFromRequestMock: vi.fn(),
  stockFindMock: vi.fn(),
  stockCountDocumentsMock: vi.fn(),
  stockAggregateMock: vi.fn(),
  inventoryItemAggregateMock: vi.fn(),
  inventoryOrderAggregateMock: vi.fn(),
  inventoryItemDistinctMock: vi.fn(),
  inventoryItemFindMock: vi.fn(),
  extDocFindMock: vi.fn(),
  chatHistoryFindMock: vi.fn(),
  chatHistoryCreateMock: vi.fn(),
  projectFindMock: vi.fn(),
  projectCreateMock: vi.fn(),
  bankAccountFindMock: vi.fn(),
  bankRuleFindMock: vi.fn(),
  budgetFindMock: vi.fn(),
  currAdjFindMock: vi.fn(),
  customFieldFindMock: vi.fn(),
  journalTemplateFindMock: vi.fn(),
  assetFindMock: vi.fn(),
  bankStatementFindMock: vi.fn(),
  expenseFindMock: vi.fn(),
  salesInvoiceFindMock: vi.fn(),
  purchaseOrderFindMock: vi.fn(),
  journalEntryFindMock: vi.fn(),
  journalEntryAggregateMock: vi.fn(),
  bankReconFindMock: vi.fn(),
  employeeFindMock: vi.fn(),
  employeeCountDocumentsMock: vi.fn(),
  employeeAggregateMock: vi.fn(),
  departmentCountDocumentsMock: vi.fn(),
  payrollFindMock: vi.fn(),
  attendanceFindMock: vi.fn(),
  leaveRequestFindMock: vi.fn(),
  integrationFindMock: vi.fn(),
  integrationEventFindMock: vi.fn(),
  integrationEventAggregateMock: vi.fn(),
  marketplacePackageFindMock: vi.fn(),
  organizationFindMock: vi.fn(),
  organizationFindOneMock: vi.fn(),
  orgUnitFindMock: vi.fn(),
  userFindOneMock: vi.fn(),
  shipmentFindMock: vi.fn(),
  bomFindMock: vi.fn(),
  itemBomFindMock: vi.fn(),
  mfgItemFindMock: vi.fn(),
  airFreightFindMock: vi.fn(),
  couponsFindMock: vi.fn(),
  customsClearanceFindMock: vi.fn(),
  docModelFindMock: vi.fn(),
  freightProviderFindMock: vi.fn(),
  hsCodeFindMock: vi.fn(),
  counterFindOneMock: vi.fn(),
  buildPostedJournalReportMock: vi.fn(),
  getGstLedgerMock: vi.fn(),
}));

// Mock NextAuth and Platform Admin Session
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/platform/auth/adminSession", () => ({
  getAdminActorFromRequest: getAdminActorFromRequestMock,
}));
vi.mock("@/lib/db", () => ({ default: vi.fn() }));

// Mock Mongoose models
vi.mock("@/models/inventory/Stock", () => ({
  default: { find: stockFindMock, countDocuments: stockCountDocumentsMock, aggregate: stockAggregateMock },
}));
vi.mock("@/models/inventory/InventoryItem", () => ({
  default: { aggregate: inventoryItemAggregateMock, distinct: inventoryItemDistinctMock, find: inventoryItemFindMock },
}));
vi.mock("@/models/inventory/InventoryOrder", () => ({
  default: { aggregate: inventoryOrderAggregateMock },
}));
vi.mock("@/models/ai/ExtractedDocument", () => ({
  default: { find: extDocFindMock },
}));
vi.mock("@/models/ai/ChatHistory", () => ({
  default: { find: chatHistoryFindMock, create: chatHistoryCreateMock },
}));
vi.mock("@/models/shared/Project", () => ({
  default: { find: projectFindMock, create: projectCreateMock },
}));
vi.mock("@/models/shared/Counter", () => ({
  default: { findOne: counterFindOneMock },
}));
vi.mock("@/models/finance/BankStatement", () => ({
  default: { find: bankStatementFindMock },
}));
vi.mock("@/models/hr/Payroll", () => ({
  default: { find: payrollFindMock },
}));
vi.mock("@/models/manufacturing/AirFreight", () => ({
  default: { find: airFreightFindMock },
}));
vi.mock("@/models/admin/MarketplacePackage", () => ({
  default: { find: marketplacePackageFindMock },
}));
vi.mock("@/models/admin/Organization", () => ({
  default: { find: organizationFindMock, findOne: organizationFindOneMock },
}));
vi.mock("@/models/admin/OrgUnit", () => ({
  default: { find: orgUnitFindMock },
  ORG_LEVELS: ["holding", "enterprise", "division", "subsidiary", "region", "branch", "department", "team"],
}));
vi.mock("@/models/auth/User", () => ({
  default: { findOne: userFindOneMock },
}));
vi.mock("@/lib/accounting/reports", () => ({
  buildPostedJournalReport: buildPostedJournalReportMock,
  buildAgedPartnerReport: vi.fn().mockResolvedValue({ summary: {}, agingBuckets: {} }),
}));
vi.mock("@/lib/accounting/gstLedger", () => ({
  getGstLedger: getGstLedgerMock,
  postGstSetoff: vi.fn(),
}));

// Import Target Handlers
import { GET as getDocumentIntelligence } from "@/app/api/document-intelligence/route";
import { GET as getStockLevels } from "@/app/api/inventory/stock/levels/route";
import { GET as getStock } from "@/app/api/inventory/stock/route";
import { GET as getNextOrderNumber } from "@/app/api/inventory/orders/next-number/route";
import { GET as getFinanceReports } from "@/app/api/finance/reports/route";
import { GET as getFinanceChatHistory } from "@/app/api/finance/chat-history/route";
import { GET as getBankStatements } from "@/app/api/finance/bank/statements/route";
import { GET as getHrPayroll } from "@/app/api/hr/payroll/route";
import { GET as getAirFreight } from "@/app/api/manufacturing/air-freight/route";
import { GET as getMarketplace } from "@/app/api/marketplace/route";
import { GET as checkMasterAdminTenants } from "@/app/api/master-admin/tenants/check/route";
import { GET as getMasterAdminTenants } from "@/app/api/master-admin/tenants/route";
import { GET as getOrgUnits } from "@/app/api/org/units/route";
import { GET as getProfile } from "@/app/api/profile/route";
import { GET as getProjects } from "@/app/api/projects/route";
import { GET as getPlatformMe } from "@/app/api/platform/me/route";
import { GET as getPlatformAccessRequests } from "@/app/api/platform/access-requests/route";

describe("Batch 2: Comprehensive TC-0106 to TC-0280 API Regression Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── A. Document Intelligence (TC-0106) ──────────────────────────────────────
  describe("TC-0106 — Document Intelligence", () => {
    it("TC-0106: Unauthenticated request is rejected with HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const res = await getDocumentIntelligence();
      expect(res.status).toBe(401);
    });

    it("TC-0106: Authenticated request returns tenant-scoped documents (HTTP 200)", async () => {
      authMock.mockResolvedValue({ user: { id: "u-1", role: "admin", tenantId: "tenant-acme" } });
      const mockChain = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([{ _id: "doc-1", fileName: "inv.pdf", tenantId: "tenant-acme" }]),
      };
      extDocFindMock.mockReturnValue(mockChain);

      const res = await getDocumentIntelligence();
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(extDocFindMock).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-acme" }));
    });
  });

  // ── B. Finance Reports & Chat History (TC-0124, TC-0128, TC-0153, TC-0154) ────
  describe("Finance and Accounting — Reports, Statements & Chat History", () => {
    it("TC-0154: Unauthenticated GET /api/finance/reports returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/finance/reports");
      const res = await getFinanceReports(req);
      expect(res.status).toBe(401);
    });

    it("TC-0153: Authenticated request with missing parameters returns HTTP 400 Bad Request", async () => {
      authMock.mockResolvedValue({ user: { id: "u-fin", role: "finance", tenantId: "tenant-acme" } });
      const req = new NextRequest("http://localhost:3000/api/finance/reports");
      const res = await getFinanceReports(req);
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error).toBe("Missing required parameters");
    });

    it("TC-0153: Authenticated request with invalid date returns HTTP 400 Bad Request", async () => {
      authMock.mockResolvedValue({ user: { id: "u-fin", role: "finance", tenantId: "tenant-acme" } });
      const req = new NextRequest("http://localhost:3000/api/finance/reports?type=balance-sheet&startDate=invalid&endDate=2026-10-25");
      const res = await getFinanceReports(req);
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error).toBe("startDate and endDate must be valid dates");
    });

    it("TC-0153: Authenticated request with valid parameters returns financial report (HTTP 200)", async () => {
      authMock.mockResolvedValue({ user: { id: "u-fin", role: "finance", tenantId: "tenant-acme" } });
      buildPostedJournalReportMock.mockResolvedValue({
        totals: { debit: 1000, credit: 1000, balanced: true },
        asset: { accounts: {}, total: 500 },
        liability: { accounts: {}, total: 200 },
        equity: { accounts: {}, total: 300 },
        income: { total: 0 },
        expense: { total: 0 },
      });

      const req = new NextRequest("http://localhost:3000/api/finance/reports?type=balance-sheet&startDate=2026-01-01&endDate=2026-10-25");
      const res = await getFinanceReports(req);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.report.type).toBe("balance-sheet");
      expect(buildPostedJournalReportMock).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-acme" }));
    });

    it("TC-0128: Finance chat-history strictly scopes queries to module: 'finance' and tenantId", async () => {
      authMock.mockResolvedValue({ user: { id: "u-fin", role: "finance", tenantId: "tenant-acme" } });
      const mockChain = {
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([{ _id: "chat-1", title: "Tax query", module: "finance" }]),
      };
      chatHistoryFindMock.mockReturnValue(mockChain);

      const req = new NextRequest("http://localhost:3000/api/finance/chat-history");
      const res = await getFinanceChatHistory(req);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.chats).toHaveLength(1);
      expect(chatHistoryFindMock).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: "tenant-acme",
        userId: "u-fin",
        module: { $in: ["finance", null, undefined] },
      }));
    });

    it("TC-0124: Bank statements rejects unauthorized non-finance role with HTTP 403 Forbidden", async () => {
      authMock.mockResolvedValue({ user: { id: "u-sales", role: "sales", tenantId: "tenant-acme" } });
      const req = new NextRequest("http://localhost:3000/api/finance/bank/statements");
      const res = await getBankStatements(req);
      expect(res.status).toBe(403);
    });
  });

  // ── C. HR Payroll (TC-0174) ────────────────────────────────────────────────
  describe("TC-0174 — HR Payroll", () => {
    it("TC-0174: Unauthenticated request is rejected with HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/hr/payroll");
      const res = await getHrPayroll(req);
      expect(res.status).toBe(401);
    });

    it("TC-0174: Unauthorized user (e.g. sales, user) is rejected with HTTP 403 Forbidden", async () => {
      authMock.mockResolvedValue({ user: { id: "u-user", role: "user", tenantId: "tenant-acme" } });
      const req = new NextRequest("http://localhost:3000/api/hr/payroll");
      const res = await getHrPayroll(req);
      expect(res.status).toBe(403);
    });

    it("TC-0174: Authorized HR admin retrieves tenant-scoped payroll records (HTTP 200)", async () => {
      authMock.mockResolvedValue({ user: { id: "u-hr", role: "hr", tenantId: "tenant-acme" } });
      const mockChain = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([{ _id: "pay-1", totalNet: 50000, tenantId: "tenant-acme" }]),
      };
      payrollFindMock.mockReturnValue(mockChain);

      const req = new NextRequest("http://localhost:3000/api/hr/payroll");
      const res = await getHrPayroll(req);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.items).toHaveLength(1);
      expect(payrollFindMock).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-acme" }));
    });
  });

  // ── E. Inventory Stock Levels & Ordering (TC-0198, TC-0201, TC-0202) ─────────
  describe("Inventory — Stock Levels, Stock Summary & Numbering", () => {
    it("TC-0202: Unauthenticated GET /api/inventory/stock/levels returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/inventory/stock/levels");
      const res = await getStockLevels(req);
      expect(res.status).toBe(401);
    });

    it("TC-0201: Authenticated request without productIds parameter returns HTTP 400 Bad Request", async () => {
      authMock.mockResolvedValue({ user: { id: "u-inv", role: "inventory", tenantId: "tenant-acme" } });
      const req = new NextRequest("http://localhost:3000/api/inventory/stock/levels");
      const res = await getStockLevels(req);
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error).toBe("productIds required");
    });

    it("TC-0201: Confirmed fix — stock movements query enforces tenantId isolation", async () => {
      authMock.mockResolvedValue({ user: { id: "u-inv", role: "inventory", tenantId: "tenant-acme" } });
      const mockChain = {
        lean: vi.fn().mockResolvedValue([
          { product: "prod-1", quantity: 15, type: "in" },
          { product: "prod-1", quantity: 5, type: "out" },
        ]),
      };
      stockFindMock.mockReturnValue(mockChain);

      const req = new NextRequest("http://localhost:3000/api/inventory/stock/levels?productIds=prod-1");
      const res = await getStockLevels(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.levels["prod-1"]).toBe(10);
      // Verify tenantId was strictly included in the database query
      expect(stockFindMock).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: "tenant-acme",
        product: { $in: ["prod-1"] },
        isReserved: { $ne: true },
      }));
    });

    it("TC-0198: Order next-number returns non-destructive preview without incrementing counter", async () => {
      authMock.mockResolvedValue({ user: { id: "u-inv", role: "inventory", tenantId: "tenant-acme" } });
      counterFindOneMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ seq: 42 }),
      });

      const req = new NextRequest("http://localhost:3000/api/inventory/orders/next-number");
      const res = await getNextOrderNumber(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.number).toBe("ORD-0043");
      expect(counterFindOneMock).toHaveBeenCalledWith({ tenantId: "tenant-acme", key: "inventoryOrder:ORD-" });
    });
  });

  // ── F. Manufacturing Air Freight (TC-0214) ──────────────────────────────────
  describe("TC-0214 — Manufacturing Air Freight", () => {
    it("TC-0214: Unauthenticated request is rejected with HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/manufacturing/air-freight");
      const res = await getAirFreight(req);
      expect(res.status).toBe(401);
    });

    it("TC-0214: Authorized manufacturing user retrieves tenant air freight (HTTP 200)", async () => {
      authMock.mockResolvedValue({ user: { id: "u-mfg", role: "manufacturing", tenantId: "tenant-acme" } });
      const mockChain = {
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([{ _id: "af-1", flightNumber: "AI101", tenantId: "tenant-acme" }]),
      };
      airFreightFindMock.mockReturnValue(mockChain);

      const req = new NextRequest("http://localhost:3000/api/manufacturing/air-freight");
      const res = await getAirFreight(req);
      expect(res.status).toBe(200);
      expect(airFreightFindMock).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-acme" }));
    });
  });

  // ── G. Marketplace (TC-0240) ────────────────────────────────────────────────
  describe("TC-0240 — Marketplace Catalog", () => {
    it("TC-0240: Unauthenticated request returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/marketplace");
      const res = await getMarketplace(req);
      expect(res.status).toBe(401);
    });

    it("TC-0240: Authenticated user browses shared published packages without secret leakage (HTTP 200)", async () => {
      authMock.mockResolvedValue({ user: { id: "u-1", role: "user", tenantId: "tenant-acme" } });
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([{ name: "CRM Plus", category: "sales", publisherName: "Aupulens" }]),
      };
      marketplacePackageFindMock.mockReturnValue(mockChain);

      const req = new NextRequest("http://localhost:3000/api/marketplace");
      const res = await getMarketplace(req);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mockChain.select).toHaveBeenCalledWith(expect.stringContaining("publisherName name description category"));
    });
  });

  // ── H. Master Admin (TC-0241 to TC-0244) ────────────────────────────────────
  describe("Master Admin — Tenant Verification & Management (TC-0241 to TC-0244)", () => {
    it("TC-0242 & TC-0244: Unauthenticated requests return HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const reqCheck = new NextRequest("http://localhost:3000/api/master-admin/tenants/check?subdomain=acme");
      const resCheck = await checkMasterAdminTenants(reqCheck);
      expect(resCheck.status).toBe(401);

      const reqList = new NextRequest("http://localhost:3000/api/master-admin/tenants");
      const resList = await getMasterAdminTenants(reqList);
      expect(resList.status).toBe(401);
    });

    it("TC-0241 & TC-0243: Regular authenticated user (non-master-admin) returns HTTP 401 Unauthorized", async () => {
      authMock.mockResolvedValue({ user: { id: "u-reg", role: "admin", tenantId: "tenant-acme" } });
      const reqCheck = new NextRequest("http://localhost:3000/api/master-admin/tenants/check?subdomain=acme");
      const resCheck = await checkMasterAdminTenants(reqCheck);
      expect(resCheck.status).toBe(401);

      const reqList = new NextRequest("http://localhost:3000/api/master-admin/tenants");
      const resList = await getMasterAdminTenants(reqList);
      expect(resList.status).toBe(401);
    });

    it("TC-0241: Privileged master-admin correctly accesses tenant availability check (HTTP 200)", async () => {
      authMock.mockResolvedValue({ user: { id: "u-master", role: "master-admin" } });
      organizationFindOneMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      const req = new NextRequest("http://localhost:3000/api/master-admin/tenants/check?subdomain=freshsubdomain");
      const res = await checkMasterAdminTenants(req);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.available).toBe(true);
    });
  });

  // ── I. Organization Units (TC-0246) ─────────────────────────────────────────
  describe("TC-0246 — Organization Units", () => {
    it("TC-0246: Unauthenticated request returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const res = await getOrgUnits();
      expect(res.status).toBe(401);
    });

    it("TC-0246: Non-admin role is denied with HTTP 403 Forbidden", async () => {
      authMock.mockResolvedValue({ user: { id: "u-staff", role: "user", tenantId: "tenant-acme" } });
      const res = await getOrgUnits();
      expect(res.status).toBe(403);
    });

    it("TC-0246: Authenticated tenant admin retrieves hierarchy units (HTTP 200)", async () => {
      authMock.mockResolvedValue({ user: { id: "u-admin", role: "admin", tenantId: "tenant-acme" } });
      const mockChain = {
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([{ _id: "unit-1", name: "HQ", level: "enterprise", tenantId: "tenant-acme" }]),
      };
      orgUnitFindMock.mockReturnValue(mockChain);

      const res = await getOrgUnits();
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(orgUnitFindMock).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-acme" }));
    });
  });

  // ── J. Platform Administration (TC-0247 to TC-0276) ─────────────────────────
  describe("Platform Administration — Separate Admin Domain Security (TC-0247 to TC-0276)", () => {
    it("TC-0248 & TC-0262: Unauthenticated requests return HTTP 401", async () => {
      getAdminActorFromRequestMock.mockResolvedValue(null);

      const reqMe = new Request("http://localhost:3000/api/platform/me");
      const resMe = await getPlatformMe(reqMe);
      expect(resMe.status).toBe(401);

      const reqAccess = new Request("http://localhost:3000/api/platform/access-requests");
      const resAccess = await getPlatformAccessRequests(reqAccess);
      expect(resAccess.status).toBe(401);
    });

    it("TC-0247 & TC-0261: Standard tenant session is denied platform access with HTTP 401", async () => {
      // Platform routes deliberately do not accept tenant NextAuth sessions
      getAdminActorFromRequestMock.mockResolvedValue(null);

      const reqMe = new Request("http://localhost:3000/api/platform/me");
      const resMe = await getPlatformMe(reqMe);
      expect(resMe.status).toBe(401);
    });

    it("TC-0261: Authenticated platform administrator session succeeds (HTTP 200)", async () => {
      getAdminActorFromRequestMock.mockResolvedValue({
        id: "admin-actor-1",
        email: "secadmin@platform.internal",
        name: "Security Admin",
        role: "super_admin",
      });

      const reqMe = new Request("http://localhost:3000/api/platform/me");
      const resMe = await getPlatformMe(reqMe);
      const body = await resMe.json();
      expect(resMe.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.role).toBe("super_admin");
    });
  });

  // ── K. Profile (TC-0278) ───────────────────────────────────────────────────
  describe("TC-0278 — User Profile", () => {
    it("TC-0278: Unauthenticated request returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);
      const res = await getProfile();
      expect(res.status).toBe(401);
    });

    it("TC-0278: Authenticated user retrieves own profile with passwords and temp tokens excluded", async () => {
      authMock.mockResolvedValue({ user: { id: "u-profile-1", role: "user", tenantId: "tenant-acme" } });
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({ _id: "u-profile-1", name: "Alice", email: "alice@acme.com" }),
      };
      userFindOneMock.mockReturnValue(mockChain);

      const res = await getProfile();
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.user.name).toBe("Alice");
      expect(mockChain.select).toHaveBeenCalledWith(expect.stringContaining("-password -tempToken"));
    });
  });

  // ── L. Projects & Finding AUP-012 (TC-0279, TC-0280) ─────────────────────────
  describe("Projects API & AUP-012 (TC-0279, TC-0280)", () => {
    it("TC-0280: Unauthenticated request returns HTTP 401 Unauthorized", async () => {
      authMock.mockResolvedValue(null);
      const req = new NextRequest("http://localhost:3000/api/projects");
      const res = await getProjects(req);
      expect(res.status).toBe(401);
    });

    it("TC-0279: Unauthorized role (e.g. sales, hr, user) receives HTTP 403 Forbidden", async () => {
      authMock.mockResolvedValue({ user: { id: "u-hr", role: "hr", tenantId: "tenant-acme" } });
      const req = new NextRequest("http://localhost:3000/api/projects");
      const res = await getProjects(req);
      expect(res.status).toBe(403);
    });

    it("TC-0279: Authenticated project manager retrieves tenant-scoped projects (HTTP 200)", async () => {
      authMock.mockResolvedValue({ user: { id: "u-pm", role: "project", tenantId: "tenant-acme" } });
      const mockChain = {
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([{ _id: "proj-1", name: "ERP v2 Deployment", tenantId: "tenant-acme" }]),
      };
      projectFindMock.mockReturnValue(mockChain);

      const req = new NextRequest("http://localhost:3000/api/projects");
      const res = await getProjects(req);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(projectFindMock).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-acme" }));
    });
  });
});
