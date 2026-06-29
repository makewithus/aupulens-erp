/**
 * Regression test: every data fetch helper in the admin AI assistant
 * must scope ALL database queries to the caller's tenantId.
 *
 * If any query loses the tenantId filter, data from other tenants will
 * be visible to the requesting user — a multi-tenancy violation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted ensures these variables are available when vi.mock factories run
const { mockFind, mockCountDocuments, mockAggregate } = vi.hoisted(() => ({
  mockFind: vi.fn(),
  mockCountDocuments: vi.fn(),
  mockAggregate: vi.fn(),
}));

// ─── Chain helpers (returned by mocked model methods) ─────────────────────────

function buildChain(returnValue: any[] = []) {
  const chain: any = {
    sort: () => chain,
    limit: () => chain,
    select: () => chain,
    lean: () => Promise.resolve(returnValue),
  };
  return chain;
}

function buildAggregateChain(returnValue: any[] = []) {
  return { exec: () => Promise.resolve(returnValue) };
}

// ─── Mock all Mongoose models ─────────────────────────────────────────────────

vi.mock("@/models/Transaction", () => ({
  default: { find: mockFind },
}));

vi.mock("@/models/Invoice", () => ({
  default: { find: mockFind },
}));

vi.mock("@/models/SaleOrder", () => ({
  default: {
    find: mockFind,
    aggregate: mockAggregate,
    countDocuments: mockCountDocuments,
  },
}));

vi.mock("@/models/InventoryItem", () => ({
  default: {
    find: mockFind,
    countDocuments: mockCountDocuments,
  },
}));

vi.mock("@/models/Shipment", () => ({
  default: { find: mockFind },
}));

vi.mock("@/models/User", () => ({
  default: {
    find: mockFind,
    countDocuments: mockCountDocuments,
  },
}));

// ─── Import the module under test (after mocks are registered) ────────────────

import {
  fetchAdminFinanceData,
  fetchAdminSalesData,
  fetchAdminInventoryData,
  fetchAdminManufacturingData,
  fetchAdminUsersData,
  fetchAdminGeneralData,
} from "@/lib/ai/adminDataFetcher";

const TENANT_A = "tenant-alpha";
const TENANT_B = "tenant-beta";

beforeEach(() => {
  vi.clearAllMocks();
  mockFind.mockReturnValue(buildChain([]));
  mockCountDocuments.mockResolvedValue(0);
  mockAggregate.mockReturnValue(buildAggregateChain([]));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("adminDataFetcher — tenant isolation regression", () => {
  describe("fetchAdminFinanceData", () => {
    it("scopes every find() call to tenantId", async () => {
      await fetchAdminFinanceData(TENANT_A);

      expect(mockFind.mock.calls.length).toBeGreaterThan(0);
      mockFind.mock.calls.forEach(([query]: [any]) => {
        expect(query).toMatchObject({ tenantId: TENANT_A });
      });
    });

    it("never uses TENANT_B's tenantId when called with TENANT_A", async () => {
      await fetchAdminFinanceData(TENANT_A);

      mockFind.mock.calls.forEach(([query]: [any]) => {
        expect(query.tenantId).not.toBe(TENANT_B);
      });
    });
  });

  describe("fetchAdminSalesData", () => {
    it("scopes find() to tenantId", async () => {
      await fetchAdminSalesData(TENANT_A);

      mockFind.mock.calls.forEach(([query]: [any]) => {
        expect(query).toMatchObject({ tenantId: TENANT_A });
      });
    });

    it("scopes aggregate $match to tenantId", async () => {
      await fetchAdminSalesData(TENANT_A);

      expect(mockAggregate).toHaveBeenCalled();
      const pipeline = mockAggregate.mock.calls[0][0] as any[];
      const matchStage = pipeline.find((s: any) => s.$match);
      expect(matchStage.$match).toMatchObject({ tenantId: TENANT_A });
      expect(matchStage.$match.tenantId).not.toBe(TENANT_B);
    });
  });

  describe("fetchAdminInventoryData", () => {
    it("scopes find() to tenantId", async () => {
      await fetchAdminInventoryData(TENANT_A);

      expect(mockFind.mock.calls.length).toBeGreaterThan(0);
      mockFind.mock.calls.forEach(([query]: [any]) => {
        expect(query).toMatchObject({ tenantId: TENANT_A });
      });
    });
  });

  describe("fetchAdminManufacturingData", () => {
    it("scopes find() to tenantId", async () => {
      await fetchAdminManufacturingData(TENANT_A);

      expect(mockFind.mock.calls.length).toBeGreaterThan(0);
      mockFind.mock.calls.forEach(([query]: [any]) => {
        expect(query).toMatchObject({ tenantId: TENANT_A });
      });
    });
  });

  describe("fetchAdminUsersData", () => {
    it("scopes find() to tenantId", async () => {
      await fetchAdminUsersData(TENANT_A);

      expect(mockFind.mock.calls.length).toBeGreaterThan(0);
      mockFind.mock.calls.forEach(([query]: [any]) => {
        expect(query).toMatchObject({ tenantId: TENANT_A });
      });
    });
  });

  describe("fetchAdminGeneralData", () => {
    it("scopes every countDocuments() call to tenantId", async () => {
      await fetchAdminGeneralData(TENANT_A);

      expect(mockCountDocuments.mock.calls.length).toBeGreaterThan(0);
      mockCountDocuments.mock.calls.forEach(([query]: [any]) => {
        expect(query).toMatchObject({ tenantId: TENANT_A });
        expect(query.tenantId).not.toBe(TENANT_B);
      });
    });
  });

  describe("cross-tenant isolation — no unscoped queries ever emitted", () => {
    it("every find() and countDocuments() always receives a non-empty tenantId", async () => {
      await fetchAdminFinanceData(TENANT_A);
      await fetchAdminSalesData(TENANT_A);
      await fetchAdminInventoryData(TENANT_A);
      await fetchAdminManufacturingData(TENANT_A);
      await fetchAdminUsersData(TENANT_A);

      const findCalls = mockFind.mock.calls as [any][];
      const countCalls = mockCountDocuments.mock.calls as [any][];

      [...findCalls, ...countCalls].forEach(([query]) => {
        expect(query, "query must have tenantId").toHaveProperty("tenantId");
        expect(typeof query.tenantId).toBe("string");
        expect(query.tenantId.length).toBeGreaterThan(0);
      });
    });

    it("aggregate pipeline $match always contains tenantId", async () => {
      await fetchAdminSalesData(TENANT_A);

      mockAggregate.mock.calls.forEach(([pipeline]: [any[]]) => {
        const matchStage = pipeline.find((s) => s.$match);
        expect(matchStage, "aggregate must have $match stage").toBeDefined();
        expect(matchStage.$match).toHaveProperty("tenantId");
      });
    });
  });
});
