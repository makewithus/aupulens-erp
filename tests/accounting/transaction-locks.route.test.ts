import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_transaction_locks";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import TransactionLock from "@/models/finance/TransactionLock";
import { makeRequest, mockSession } from "./_helpers/routeTestUtils";

const URL = "http://localhost/api/finance/accounting/transaction-locks";

let GET: typeof import("@/app/api/finance/accounting/transaction-locks/route").GET;
let POST: typeof import("@/app/api/finance/accounting/transaction-locks/route").POST;

describe("transaction-locks CRUD route", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await TransactionLock.init();
    ({ GET, POST } = await import("@/app/api/finance/accounting/transaction-locks/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await TransactionLock.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("GET returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await GET(makeRequest(URL));
    expect(res.status).toBe(401);
  });

  it("POST returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ module: "sales", isLocked: true, lockedUpToDate: "2026-03-31" }) }));
    expect(res.status).toBe(401);
  });

  it("POST upserts a tenant-scoped lock; GET only returns that tenant's locks", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const postRes = await POST(
      makeRequest(URL, { method: "POST", body: JSON.stringify({ module: "sales", isLocked: true, lockedUpToDate: "2026-03-31" }) }),
    );
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    expect(postBody.data.tenantId).toBe("route-t1");
    expect(postBody.data.isLocked).toBe(true);

    await TransactionLock.create({ tenantId: "route-t2", module: "purchases", isLocked: true, lockedUpToDate: new Date("2026-01-01") });

    const getRes = await GET(makeRequest(URL));
    const getBody = await getRes.json();
    expect(getBody.data).toHaveLength(1);
    expect(getBody.data[0].module).toBe("sales");
  });

  it("POST rejects an invalid module with 400", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t3"));
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ module: "not_real", isLocked: true, lockedUpToDate: "2026-03-31" }) }));
    expect(res.status).toBe(400);
  });
});
