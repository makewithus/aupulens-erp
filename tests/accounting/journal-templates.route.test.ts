import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_journal_templates";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import JournalTemplate from "@/models/JournalTemplate";
import "@/models/Account";
import { makeRequest, mockSession } from "./_helpers/routeTestUtils";

const URL = "http://localhost/api/finance/accounting/journal-templates";

let GET: typeof import("@/app/api/finance/accounting/journal-templates/route").GET;
let POST: typeof import("@/app/api/finance/accounting/journal-templates/route").POST;

describe("journal-templates CRUD route", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await JournalTemplate.init();
    ({ GET, POST } = await import("@/app/api/finance/accounting/journal-templates/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await JournalTemplate.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("GET returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await GET(makeRequest(URL));
    expect(res.status).toBe(401);
  });

  it("POST returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ templateName: "X", notes: "Y" }) }));
    expect(res.status).toBe(401);
  });

  it("POST creates a tenant-scoped template; GET only returns that tenant's templates", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const postRes = await POST(
      makeRequest(URL, { method: "POST", body: JSON.stringify({ templateName: "Monthly Rent Accrual", notes: "Recurring rent journal" }) }),
    );
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json();
    expect(postBody.data.tenantId).toBe("route-t1");

    await JournalTemplate.create({
      tenantId: "route-t2",
      templateName: "Other Tenant Template",
      notes: "n/a",
      createdBy: new mongoose.Types.ObjectId(),
    });

    const getRes = await GET(makeRequest(URL));
    const getBody = await getRes.json();
    expect(getBody.data).toHaveLength(1);
    expect(getBody.data[0].templateName).toBe("Monthly Rent Accrual");
  });

  it("POST rejects a missing notes field with 400", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t3"));
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ templateName: "No Notes" }) }));
    expect(res.status).toBe(400);
  });
});
