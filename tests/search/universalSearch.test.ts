import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, mockConnectDB } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockConnectDB: vi.fn(),
}));

// Track which models got queried so we can assert role scoping.
const queried: string[] = [];
function modelMock(name: string) {
  return {
    default: {
      find: () => { queried.push(name); return { select: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }) }; },
    },
  };
}
// SalesInvoice / Customer are named exports in their modules.
function namedModelMock(name: string, exportName: string) {
  return {
    [exportName]: {
      find: () => { queried.push(name); return { select: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }) }; },
    },
  };
}

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: mockConnectDB }));
vi.mock("@/lib/utils/regex", () => ({ escapeRegex: (s: string) => s }));
vi.mock("@/models/crm/Lead", () => modelMock("Lead"));
vi.mock("@/models/crm/Account", () => modelMock("Account"));
vi.mock("@/models/crm/Contact", () => modelMock("Contact"));
vi.mock("@/models/crm/Opportunity", () => modelMock("Opportunity"));
vi.mock("@/models/sales/SalesInvoice", () => namedModelMock("SalesInvoice", "SalesInvoice"));
vi.mock("@/models/sales/Customer", () => modelMock("Customer"));
vi.mock("@/models/sales/SaleOrder", () => modelMock("SaleOrder"));
vi.mock("@/models/inventory/InventoryItem", () => modelMock("InventoryItem"));
vi.mock("@/models/hr/Employee", () => modelMock("Employee"));
vi.mock("@/models/shared/Project", () => modelMock("Project"));

import { GET } from "@/app/api/search/route";

function makeReq(q: string) {
  return { url: `http://x/api/search?q=${encodeURIComponent(q)}` } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  queried.length = 0;
  mockConnectDB.mockResolvedValue(undefined);
});

describe("GET /api/search — universal search", () => {
  it("401 without a tenant", async () => {
    mockAuth.mockResolvedValue({ user: {} });
    const res = await GET(makeReq("acme"));
    expect(res.status).toBe(401);
  });

  it("returns empty for a term shorter than 2 chars without querying models", async () => {
    mockAuth.mockResolvedValue({ user: { tenantId: "t", role: "admin" } });
    await GET(makeReq("a"));
    expect(queried.length).toBe(0);
  });

  it("an HR user only searches HR-scoped entities, not Sales/Inventory/CRM", async () => {
    mockAuth.mockResolvedValue({ user: { tenantId: "t", role: "hr" } });
    await GET(makeReq("john"));
    expect(queried).toContain("Employee");
    expect(queried).not.toContain("Lead");
    expect(queried).not.toContain("SalesInvoice");
    expect(queried).not.toContain("InventoryItem");
  });

  it("an admin searches across all modules", async () => {
    mockAuth.mockResolvedValue({ user: { tenantId: "t", role: "admin" } });
    await GET(makeReq("acme"));
    expect(queried).toContain("SalesInvoice");
    expect(queried).toContain("Lead");
    expect(queried).toContain("Employee");
    expect(queried).toContain("InventoryItem");
    expect(queried).toContain("Project");
  });

  it("a sales user searches Sales + CRM (shared role) but not HR employees", async () => {
    mockAuth.mockResolvedValue({ user: { tenantId: "t", role: "sales" } });
    await GET(makeReq("acme"));
    expect(queried).toContain("SalesInvoice");
    expect(queried).toContain("Lead");
    expect(queried).not.toContain("Employee");
  });
});
