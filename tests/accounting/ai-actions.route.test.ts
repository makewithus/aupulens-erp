import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_ai_actions";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import AiActionProposal from "@/models/AiActionProposal";
import { makeRequest, mockSession } from "./_helpers/routeTestUtils";

const URL = "http://localhost/api/finance/accounting/ai-actions";

let POST: typeof import("@/app/api/finance/accounting/ai-actions/route").POST;

describe("ai-actions propose route (AI confirmation gate, step 1)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await AiActionProposal.init();
    ({ POST } = await import("@/app/api/finance/accounting/ai-actions/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AiActionProposal.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await POST(
      makeRequest(URL, { method: "POST", body: JSON.stringify({ actionType: "create_account", params: {} }) }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects an unsupported actionType with 400", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const res = await POST(
      makeRequest(URL, { method: "POST", body: JSON.stringify({ actionType: "not_a_real_action", params: {} }) }),
    );
    expect(res.status).toBe(400);
  });

  it("creates a tenant-scoped, pending proposal for a valid action and never mutates data directly", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const res = await POST(
      makeRequest(URL, {
        method: "POST",
        body: JSON.stringify({ actionType: "create_account", params: { accountName: "Marketing", accountType: "Expense" } }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.requiresConfirmation).toBe(true);
    expect(body.data.preview.summary).toContain("Marketing");

    const stored = await AiActionProposal.findById(body.data.proposalId).lean();
    expect(stored?.tenantId).toBe("route-t1");
  });
});
