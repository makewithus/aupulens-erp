import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_banking_rules";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import BankingRule from "@/models/BankingRule";
import "@/models/Account";
import { makeRequest, mockSession } from "./_helpers/routeTestUtils";

const URL = "http://localhost/api/finance/accounting/banking-rules";

let GET: typeof import("@/app/api/finance/accounting/banking-rules/route").GET;
let POST: typeof import("@/app/api/finance/accounting/banking-rules/route").POST;

describe("banking-rules CRUD route", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await BankingRule.init();
    ({ GET, POST } = await import("@/app/api/finance/accounting/banking-rules/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await BankingRule.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  const validBody = () => ({
    ruleName: "Auto-categorize rent",
    recordAs: "expense",
    accountId: new mongoose.Types.ObjectId().toString(),
    criteria: [{ field: "description", operator: "contains", value: "rent" }],
  });

  it("GET returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await GET(makeRequest(URL));
    expect(res.status).toBe(401);
  });

  it("POST returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify(validBody()) }));
    expect(res.status).toBe(401);
  });

  it("POST creates a tenant-scoped rule; GET only returns that tenant's rules", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const postRes = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify(validBody()) }));
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json();
    expect(postBody.success).toBe(true);
    expect(postBody.data.tenantId).toBe("route-t1");

    await BankingRule.create({ tenantId: "route-t2", ...validBody(), accountId: new mongoose.Types.ObjectId(), createdBy: new mongoose.Types.ObjectId() });

    const getRes = await GET(makeRequest(URL));
    const getBody = await getRes.json();
    expect(getBody.data).toHaveLength(1);
    expect(getBody.data[0].ruleName).toBe("Auto-categorize rent");
  });

  it("POST rejects a rule with no criteria with 400", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t3"));
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ ...validBody(), criteria: [] }) }));
    expect(res.status).toBe(400);
  });
});
