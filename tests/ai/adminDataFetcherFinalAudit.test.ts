import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), select: vi.fn(), count: vi.fn(), aggregate: vi.fn() }));
vi.mock("@/models/finance/Transaction", () => ({ default: { find: mocks.find, countDocuments: mocks.count } }));
vi.mock("@/models/finance/Invoice", () => ({ default: { find: mocks.find } }));
vi.mock("@/models/sales/SalesInvoice", () => ({ SalesInvoice: { find: mocks.find, aggregate: mocks.aggregate } }));
vi.mock("@/models/sales/Payment", () => ({ default: { find: mocks.find, countDocuments: mocks.count } }));
vi.mock("@/models/sales/SaleOrder", () => ({ default: { find: mocks.find, countDocuments: mocks.count } }));
vi.mock("@/models/inventory/InventoryItem", () => ({ default: { find: mocks.find, countDocuments: mocks.count } }));
vi.mock("@/models/manufacturing/Shipment", () => ({ default: { find: mocks.find, countDocuments: mocks.count } }));
vi.mock("@/models/auth/User", () => ({ default: { find: mocks.find, countDocuments: mocks.count } }));
vi.mock("@/models/admin/Organization", () => ({ default: { findOne: mocks.find } }));
vi.mock("@/lib/accounting/reports", () => ({ buildPostedJournalReport: vi.fn() }));
import * as fetchers from "@/lib/ai/adminDataFetcher";
beforeEach(() => {
  vi.clearAllMocks();
  const chain: any = { sort: () => chain, limit: () => chain, select: mocks.select, lean: async () => [] };
  mocks.select.mockReturnValue(chain);
  mocks.find.mockReturnValue(chain);
  mocks.count.mockResolvedValue(0);
  mocks.aggregate.mockReturnValue({ exec: async () => [] });
});
describe("Final audit: AI tenant guard and user secrets", () => {
  for (const [name, fetcher] of Object.entries(fetchers)) {
    it.each([undefined, "", "   ", { $ne: "foreign" }])(`${name} rejects missing or non-scalar tenant %s before a query`, async (tenant) => {
      await expect(fetcher(tenant as any)).rejects.toThrow("Tenant identity is required");
      expect(mocks.find).not.toHaveBeenCalled();
      expect(mocks.count).not.toHaveBeenCalled();
      expect(mocks.aggregate).not.toHaveBeenCalled();
    });
  }
  it("excludes authentication secrets from user context passed to AI", async () => {
    await fetchers.fetchAdminUsersData("audit-tenant");
    const projection = mocks.select.mock.calls[0][0];
    for (const field of ["password", "tempToken", "tempTokenHash", "passwordResetTokenHash"]) expect(projection.split(" ")).toContain(`-${field}`);
  });
});
