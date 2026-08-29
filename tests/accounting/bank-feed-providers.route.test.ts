import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_bank_feed_providers";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import BankFeedProvider from "@/models/finance/BankFeedProvider";
import { makeRequest, mockSession } from "./_helpers/routeTestUtils";

const URL = "http://localhost/api/finance/accounting/bank-feed-providers";

let GET: typeof import("@/app/api/finance/accounting/bank-feed-providers/route").GET;

describe("bank-feed-providers route (global, non-tenant-scoped catalog)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await BankFeedProvider.init();
    ({ GET } = await import("@/app/api/finance/accounting/bank-feed-providers/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    vi.mocked(auth).mockReset();
  });

  it("returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await GET(makeRequest(URL));
    expect(res.status).toBe(401);
  });

  it("seeds and lists the shared provider catalog, split by type, for any authenticated tenant", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const res = await GET(makeRequest(URL));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.partnerBanks.length).toBeGreaterThan(0);
    expect(body.data.aggregatorBanks.length).toBeGreaterThan(0);
    expect(typeof body.data.isLiveConfigured).toBe("boolean");

    // A different tenant sees the exact same shared catalog (no tenant scoping).
    vi.mocked(auth).mockResolvedValue(mockSession("route-t2"));
    const res2 = await GET(makeRequest(URL));
    const body2 = await res2.json();
    expect(body2.data.partnerBanks.length).toBe(body.data.partnerBanks.length);
  });
});
