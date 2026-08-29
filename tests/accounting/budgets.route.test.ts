import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_budgets";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Budget from "@/models/finance/Budget";
import "@/models/finance/Account";
import { makeRequest, mockSession } from "./_helpers/routeTestUtils";

const URL = "http://localhost/api/finance/accounting/budgets";

let GET: typeof import("@/app/api/finance/accounting/budgets/route").GET;
let POST: typeof import("@/app/api/finance/accounting/budgets/route").POST;

describe("budgets CRUD route", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Budget.init();
    ({ GET, POST } = await import("@/app/api/finance/accounting/budgets/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Budget.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("GET returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await GET(makeRequest(URL));
    expect(res.status).toBe(401);
  });

  it("POST returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ name: "X", fiscalYear: "Apr 2026 - Mar 2027" }) }));
    expect(res.status).toBe(401);
  });

  it("POST creates a tenant-scoped budget; GET only returns that tenant's budgets", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const postRes = await POST(
      makeRequest(URL, { method: "POST", body: JSON.stringify({ name: "FY26-27 Budget", fiscalYear: "Apr 2026 - Mar 2027" }) }),
    );
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json();
    expect(postBody.data.tenantId).toBe("route-t1");

    await Budget.create({
      tenantId: "route-t2",
      name: "Other Tenant Budget",
      fiscalYear: "Apr 2026 - Mar 2027",
      createdBy: new mongoose.Types.ObjectId(),
    });

    const getRes = await GET(makeRequest(URL));
    const getBody = await getRes.json();
    expect(getBody.data).toHaveLength(1);
    expect(getBody.data[0].name).toBe("FY26-27 Budget");
  });

  it("POST rejects a duplicate name+fiscalYear for the same tenant with 409", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t3"));
    await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ name: "Dup", fiscalYear: "Apr 2026 - Mar 2027" }) }));
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ name: "Dup", fiscalYear: "Apr 2026 - Mar 2027" }) }));
    expect(res.status).toBe(409);
  });
});
