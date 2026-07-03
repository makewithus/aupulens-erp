import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_custom_fields";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import CustomField from "@/models/CustomField";
import { makeRequest, mockSession } from "./_helpers/routeTestUtils";

const URL = "http://localhost/api/finance/accounting/custom-fields";

let GET: typeof import("@/app/api/finance/accounting/custom-fields/route").GET;
let POST: typeof import("@/app/api/finance/accounting/custom-fields/route").POST;

describe("custom-fields CRUD route", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await CustomField.init();
    ({ GET, POST } = await import("@/app/api/finance/accounting/custom-fields/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await CustomField.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("GET returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await GET(makeRequest(URL));
    expect(res.status).toBe(401);
  });

  it("POST returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ label: "Cost Center", appliesTo: "account" }) }));
    expect(res.status).toBe(401);
  });

  it("POST creates a tenant-scoped field; GET only returns that tenant's fields", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const postRes = await POST(
      makeRequest(URL, { method: "POST", body: JSON.stringify({ label: "Cost Center", appliesTo: "account" }) }),
    );
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json();
    expect(postBody.data.tenantId).toBe("route-t1");

    await CustomField.create({ tenantId: "route-t2", label: "Cost Center", appliesTo: "account", createdBy: new mongoose.Types.ObjectId() });

    const getRes = await GET(makeRequest(URL));
    const getBody = await getRes.json();
    expect(getBody.data).toHaveLength(1);
    expect(getBody.data[0].label).toBe("Cost Center");
  });

  it("POST rejects a missing appliesTo field with 400", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t3"));
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ label: "No AppliesTo" }) }));
    expect(res.status).toBe(400);
  });
});
