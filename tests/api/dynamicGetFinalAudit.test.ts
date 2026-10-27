import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "507f1f77bcf86cd799439011", role: "admin", tenantId: "final-audit-dynamic" } }) }));
vi.mock("@/lib/db", () => ({ default: async () => mongoose.connection }));
const testUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/aupulens_test_dynamic_audit";
beforeAll(async () => {
  try {
    await mongoose.connect(testUri, { serverSelectionTimeoutMS: 2000 });
  } catch (err) {
    console.warn("MongoDB connection skipped in mock mode:", err);
  }
});
afterAll(async () => {
  if (mongoose.connection?.name && mongoose.connection.name.startsWith("aupulens_test_")) {
    try { await mongoose.connection.dropDatabase(); } catch {}
  }
  try { await mongoose.disconnect(); } catch {}
});
const routes = [
  ["/api/accounting/invoices/[id]", () => import("@/app/api/accounting/invoices/[id]/route")],
  ["/api/crm/accounts/[id]/activities", () => import("@/app/api/crm/accounts/[id]/activities/route")],
  ["/api/crm/accounts/[id]/cases", () => import("@/app/api/crm/accounts/[id]/cases/route")],
  ["/api/crm/accounts/[id]/contacts", () => import("@/app/api/crm/accounts/[id]/contacts/route")],
  ["/api/crm/accounts/[id]/contracts", () => import("@/app/api/crm/accounts/[id]/contracts/route")],
  ["/api/crm/accounts/[id]/opportunities", () => import("@/app/api/crm/accounts/[id]/opportunities/route")],
  ["/api/crm/accounts/[id]/quotes", () => import("@/app/api/crm/accounts/[id]/quotes/route")],
  ["/api/crm/accounts/[id]", () => import("@/app/api/crm/accounts/[id]/route")],
  ["/api/crm/accounts/[id]/tasks", () => import("@/app/api/crm/accounts/[id]/tasks/route")],
  ["/api/crm/activities/[id]", () => import("@/app/api/crm/activities/[id]/route")],
  ["/api/crm/campaigns/[id]", () => import("@/app/api/crm/campaigns/[id]/route")],
  ["/api/crm/cases/[id]", () => import("@/app/api/crm/cases/[id]/route")],
  ["/api/crm/cases/[id]/satisfaction", () => import("@/app/api/crm/cases/[id]/satisfaction/route")],
  ["/api/crm/cases/[id]/timeline", () => import("@/app/api/crm/cases/[id]/timeline/route")],
  ["/api/crm/communications/[id]", () => import("@/app/api/crm/communications/[id]/route")],
  ["/api/crm/contacts/[id]", () => import("@/app/api/crm/contacts/[id]/route")],
  ["/api/crm/contracts/[id]", () => import("@/app/api/crm/contracts/[id]/route")],
  ["/api/crm/documents/[id]", () => import("@/app/api/crm/documents/[id]/route")],
  ["/api/crm/handoffs/[id]", () => import("@/app/api/crm/handoffs/[id]/route")],
  ["/api/crm/leads/[id]/activities", () => import("@/app/api/crm/leads/[id]/activities/route")],
  ["/api/crm/leads/[id]", () => import("@/app/api/crm/leads/[id]/route")],
  ["/api/crm/opportunities/[id]", () => import("@/app/api/crm/opportunities/[id]/route")],
  ["/api/crm/quotes/[id]/pdf", () => import("@/app/api/crm/quotes/[id]/pdf/route")],
  ["/api/crm/quotes/[id]", () => import("@/app/api/crm/quotes/[id]/route")],
  ["/api/crm/tasks/[id]", () => import("@/app/api/crm/tasks/[id]/route")],
  ["/api/document-intelligence/[id]", () => import("@/app/api/document-intelligence/[id]/route")],
  ["/api/finance/accounting/banking-rules/[id]", () => import("@/app/api/finance/accounting/banking-rules/[id]/route")],
  ["/api/finance/accounting/budgets/[id]", () => import("@/app/api/finance/accounting/budgets/[id]/route")],
  ["/api/finance/accounting/currency-adjustments/[id]", () => import("@/app/api/finance/accounting/currency-adjustments/[id]/route")],
  ["/api/finance/accounting/journal-templates/[id]", () => import("@/app/api/finance/accounting/journal-templates/[id]/route")],
  ["/api/finance/bills/[id]", () => import("@/app/api/finance/bills/[id]/route")],
  ["/api/finance/expenses/[id]", () => import("@/app/api/finance/expenses/[id]/route")],
  ["/api/finance/journal-entries/[id]", () => import("@/app/api/finance/journal-entries/[id]/route")],
  ["/api/finance/period-closing/[id]", () => import("@/app/api/finance/period-closing/[id]/route")],
  ["/api/finance/purchase-orders/[id]", () => import("@/app/api/finance/purchase-orders/[id]/route")],
  ["/api/hr/attendance/[id]", () => import("@/app/api/hr/attendance/[id]/route")],
  ["/api/hr/departments/[id]", () => import("@/app/api/hr/departments/[id]/route")],
  ["/api/hr/employees/[id]", () => import("@/app/api/hr/employees/[id]/route")],
  ["/api/hr/payroll/[id]", () => import("@/app/api/hr/payroll/[id]/route")],
  ["/api/integrations/connections/[id]", () => import("@/app/api/integrations/connections/[id]/route")],
  ["/api/inventory/operations/manufacturing/[id]", () => import("@/app/api/inventory/operations/manufacturing/[id]/route")],
  ["/api/inventory/operations/transfers/[id]", () => import("@/app/api/inventory/operations/transfers/[id]/route")],
  ["/api/inventory/stock-moves/[id]", () => import("@/app/api/inventory/stock-moves/[id]/route")],
  ["/api/inventory/warehouse/[id]", () => import("@/app/api/inventory/warehouse/[id]/route")],
  ["/api/manufacturing/bom/[id]", () => import("@/app/api/manufacturing/bom/[id]/route")],
  ["/api/manufacturing/coupons/[id]", () => import("@/app/api/manufacturing/coupons/[id]/route")],
  ["/api/manufacturing/documents/[id]", () => import("@/app/api/manufacturing/documents/[id]/route")],
  ["/api/manufacturing/item-bom/[id]", () => import("@/app/api/manufacturing/item-bom/[id]/route")],
  ["/api/manufacturing/items/[id]", () => import("@/app/api/manufacturing/items/[id]/route")],
  ["/api/migration/batches/[id]/duplicates", () => import("@/app/api/migration/batches/[id]/duplicates/route")],
  ["/api/migration/batches/[id]/invalid", () => import("@/app/api/migration/batches/[id]/invalid/route")],
  ["/api/migration/batches/[id]/mapping", () => import("@/app/api/migration/batches/[id]/mapping/route")],
  ["/api/migration/batches/[id]/preview", () => import("@/app/api/migration/batches/[id]/preview/route")],
  ["/api/migration/batches/[id]/report/download", () => import("@/app/api/migration/batches/[id]/report/download/route")],
  ["/api/migration/batches/[id]/report", () => import("@/app/api/migration/batches/[id]/report/route")],
  ["/api/migration/batches/[id]", () => import("@/app/api/migration/batches/[id]/route")],
  ["/api/migration/jobs/[id]", () => import("@/app/api/migration/jobs/[id]/route")],
  ["/api/org/units/[id]/consolidated", () => import("@/app/api/org/units/[id]/consolidated/route")],
  ["/api/projects/[id]", () => import("@/app/api/projects/[id]/route")],
  ["/api/sales/customers/[id]", () => import("@/app/api/sales/customers/[id]/route")],
  ["/api/sales/delivery-challans/[id]", () => import("@/app/api/sales/delivery-challans/[id]/route")],
  ["/api/sales/dunning-rules/[id]", () => import("@/app/api/sales/dunning-rules/[id]/route")],
  ["/api/sales/invoices/[id]/pdf", () => import("@/app/api/sales/invoices/[id]/pdf/route")],
  ["/api/sales/invoices/[id]", () => import("@/app/api/sales/invoices/[id]/route")],
  ["/api/sales/payments/[id]", () => import("@/app/api/sales/payments/[id]/route")],
  ["/api/sales/pricelists/[id]", () => import("@/app/api/sales/pricelists/[id]/route")],
  ["/api/sales/products/[id]", () => import("@/app/api/sales/products/[id]/route")],
  ["/api/sales/quotes/[id]", () => import("@/app/api/sales/quotes/[id]/route")],
  ["/api/sales/sale-orders/[id]", () => import("@/app/api/sales/sale-orders/[id]/route")],
  ["/api/sales/sales-orders/[id]", () => import("@/app/api/sales/sales-orders/[id]/route")],
  ["/api/sales/subscriptions/[id]", () => import("@/app/api/sales/subscriptions/[id]/route")],
  ["/api/studio/workflows/[id]", () => import("@/app/api/studio/workflows/[id]/route")],
  ["/api/studio/workflows/[id]/runs", () => import("@/app/api/studio/workflows/[id]/runs/route")]
] as const;
for (const [path, load] of routes) {
  describe(`GET ${path} malformed syntax`, () => {
    it.each(["not-an-object-id", '{"$ne":null}', { $ne: null }])("returns a controlled 400/404 without database internals for %j", async (id) => {
      const { GET } = await load();
      const response = await GET(new NextRequest(`http://localhost${path.replace("[id]", encodeURIComponent(String(id)))}`), { params: Promise.resolve({ id } as any) });
      expect([400, 404], `actual HTTP ${response.status}`).toContain(response.status);
      const body = await response.text();
      expect(body).not.toMatch(/Cast to ObjectId|CastError|BSONError|at .*\.(?:ts|js):\d|mongodb:\/\//i);
    });
  });
}
