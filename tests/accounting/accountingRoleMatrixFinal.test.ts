import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(true),
}));

const mockAccountFind = vi.fn();
const mockAccountCreate = vi.fn();
vi.mock("@/models/finance/Account", () => ({
  default: {
    find: (...args: any[]) => ({
      sort: () => ({
        lean: () => mockAccountFind(...args),
      }),
    }),
    create: (...args: any[]) => mockAccountCreate(...args),
  },
}));

const mockInvoiceFindOne = vi.fn();
const mockInvoiceFindOneAndDelete = vi.fn();
vi.mock("@/models/finance/Invoice", () => ({
  default: {
    findOne: (...args: any[]) => {
      const queryObj: any = {
        populate: () => queryObj,
        lean: () => mockInvoiceFindOne(...args),
        then: (resolve: any) => resolve(mockInvoiceFindOne(...args)),
      };
      return queryObj;
    },
    findOneAndDelete: (...args: any[]) => mockInvoiceFindOneAndDelete(...args),
  },
}));

import { GET as getAccounts, POST as postAccounts } from "@/app/api/accounting/accounts/route";
import { GET as getInvoice, DELETE as deleteInvoice } from "@/app/api/accounting/invoices/[id]/route";
import { GET as getAnomalies } from "@/app/api/finance/ai/anomalies/route";
import { POST as draftPaymentReminder } from "@/app/api/finance/ai/draft-correspondence/route";

describe("AUP-006: Accounting Role Matrix & Tenant Authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const VALID_ID = "650000000000000000000001";

  describe("/api/accounting/accounts GET & POST", () => {
    it("denies unauthenticated callers with 401", async () => {
      mockAuth.mockResolvedValue(null);

      const getReq = new NextRequest("http://localhost/api/accounting/accounts");
      const getRes = await getAccounts(getReq);
      expect(getRes.status).toBe(401);

      const postReq = new Request("http://localhost/api/accounting/accounts", {
        method: "POST",
        body: JSON.stringify({ code: "1001", name: "Bank", account_type: "asset_cash" }),
      });
      const postRes = await postAccounts(postReq);
      expect(postRes.status).toBe(401);
    });

    it("denies unauthorized non-finance roles (sales, hr) with 403", async () => {
      for (const role of ["sales", "hr", "support", "warehouse"]) {
        mockAuth.mockResolvedValue({
          user: { id: "user-1", role, tenantId: "tenant-a" },
        });

        const getReq = new NextRequest("http://localhost/api/accounting/accounts");
        const getRes = await getAccounts(getReq);
        expect(getRes.status).toBe(403);
        const getBody = await getRes.json();
        expect(getBody.error).toContain("Finance role required");

        const postReq = new Request("http://localhost/api/accounting/accounts", {
          method: "POST",
          body: JSON.stringify({ code: "1001", name: "Bank", account_type: "asset_cash" }),
        });
        const postRes = await postAccounts(postReq);
        expect(postRes.status).toBe(403);
      }
    });

    it("allows authorized roles (finance, admin, master-admin) scoped to tenant", async () => {
      mockAccountFind.mockResolvedValue([{ code: "1010", name: "Cash Account" }]);

      for (const role of ["finance", "admin", "master-admin"]) {
        mockAuth.mockResolvedValue({
          user: { id: "user-auth", role, tenantId: "tenant-a" },
        });

        const getReq = new NextRequest("http://localhost/api/accounting/accounts");
        const getRes = await getAccounts(getReq);
        expect(getRes.status).toBe(200);
        const body = await getRes.json();
        expect(body.items).toBeDefined();
      }
    });
  });

  describe("/api/accounting/invoices/[id] GET & DELETE", () => {
    it("denies unauthenticated callers with 401", async () => {
      mockAuth.mockResolvedValue(null);

      const req = new NextRequest(`http://localhost/api/accounting/invoices/${VALID_ID}`);
      const params = Promise.resolve({ id: VALID_ID });

      const getRes = await getInvoice(req, { params });
      expect(getRes.status).toBe(401);

      const delRes = await deleteInvoice(req, { params });
      expect(delRes.status).toBe(401);
    });

    it("denies unauthorized non-finance roles with 403", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-sales", role: "sales", tenantId: "tenant-a" },
      });

      const req = new NextRequest(`http://localhost/api/accounting/invoices/${VALID_ID}`);
      const params = Promise.resolve({ id: VALID_ID });

      const getRes = await getInvoice(req, { params });
      expect(getRes.status).toBe(403);

      const delRes = await deleteInvoice(req, { params });
      expect(delRes.status).toBe(403);
    });

    it("enforces tenant isolation and returns 404 for foreign-tenant invoices", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-fin", role: "finance", tenantId: "tenant-a" },
      });
      // Foreign tenant lookup yields null
      mockInvoiceFindOne.mockResolvedValue(null);

      const req = new NextRequest(`http://localhost/api/accounting/invoices/${VALID_ID}`);
      const params = Promise.resolve({ id: VALID_ID });

      const getRes = await getInvoice(req, { params });
      expect(getRes.status).toBe(404);
      const body = await getRes.json();
      expect(body.error).toContain("Invoice not found");
    });
  });

  describe("finance AI endpoints", () => {
    it("denies authenticated non-finance roles before querying finance data", async () => {
      mockAuth.mockResolvedValue({ user: { id: "user-sales", role: "sales", tenantId: "tenant-a" } });

      const anomalyResponse = await getAnomalies();
      expect(anomalyResponse.status).toBe(403);

      const reminderResponse = await draftPaymentReminder(new NextRequest("http://localhost/api/finance/ai/draft-correspondence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoiceId: VALID_ID }),
      }));
      expect(reminderResponse.status).toBe(403);
    });
  });
});
