import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_settings";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import AccountingSettings from "@/models/AccountingSettings";
import { makeRequest, mockSession } from "./_helpers/routeTestUtils";

const URL = "http://localhost/api/finance/accounting/settings";

let GET: typeof import("@/app/api/finance/accounting/settings/route").GET;
let PATCH: typeof import("@/app/api/finance/accounting/settings/route").PATCH;

describe("accounting settings route", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await AccountingSettings.init();
    ({ GET, PATCH } = await import("@/app/api/finance/accounting/settings/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AccountingSettings.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("GET returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await GET(makeRequest(URL));
    expect(res.status).toBe(401);
  });

  it("PATCH returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await PATCH(makeRequest(URL, { method: "PATCH", body: JSON.stringify({ journals: { autoNumbering: true } }) }));
    expect(res.status).toBe(401);
  });

  it("GET auto-creates a tenant-scoped settings doc on first read", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const res = await GET(makeRequest(URL));
    const body = await res.json();
    expect(body.data.tenantId).toBe("route-t1");

    const count = await AccountingSettings.countDocuments({});
    expect(count).toBe(1);
  });

  it("PATCH only updates the requesting tenant's settings, isolated from other tenants", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    await GET(makeRequest(URL));
    const patchRes = await PATCH(
      makeRequest(URL, { method: "PATCH", body: JSON.stringify({ journals: { allowBackdatedEntries: false } }) }),
    );
    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.data.journals.allowBackdatedEntries).toBe(false);

    vi.mocked(auth).mockResolvedValue(mockSession("route-t2"));
    const otherGet = await GET(makeRequest(URL));
    const otherBody = await otherGet.json();
    expect(otherBody.data.journals?.allowBackdatedEntries).not.toBe(false);
  });
});
