import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/crm/sla-check/route";

vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue({}) }));
vi.mock("@/models/crm/Case", () => ({
  default: {
    find: vi.fn().mockResolvedValue([]),
  },
}));

describe("AUP-009: CRM SLA Cron Secret Authentication & Timing Safety", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("fails closed when CRON_SECRET is not configured or empty", async () => {
    delete process.env.CRON_SECRET;

    // Test with no auth header
    const req1 = new NextRequest("http://localhost/api/cron/crm/sla-check");
    const res1 = await GET(req1);
    expect(res1.status).toBe(500);
    const body1 = await res1.json();
    expect(body1.error).toBe("CRON_SECRET not configured");

    // Test with "Bearer undefined" - crucial regression test for AUP-009!
    const req2 = new NextRequest("http://localhost/api/cron/crm/sla-check", {
      headers: { authorization: "Bearer undefined" },
    });
    const res2 = await GET(req2);
    expect(res2.status).toBe(500); // Must fail closed, NOT authenticate!
  });

  it("rejects unauthorized requests when CRON_SECRET is set", async () => {
    process.env.CRON_SECRET = "super-secret-cron-key-123";

    // "Bearer undefined" must return 401
    const req1 = new NextRequest("http://localhost/api/cron/crm/sla-check", {
      headers: { authorization: "Bearer undefined" },
    });
    const res1 = await GET(req1);
    expect(res1.status).toBe(401);

    // Wrong token must return 401
    const req2 = new NextRequest("http://localhost/api/cron/crm/sla-check", {
      headers: { authorization: "Bearer wrong-key" },
    });
    const res2 = await GET(req2);
    expect(res2.status).toBe(401);
  });

  it("authorizes requests with the exact matching secret", async () => {
    process.env.CRON_SECRET = "super-secret-cron-key-123";

    const req = new NextRequest("http://localhost/api/cron/crm/sla-check", {
      headers: { authorization: "Bearer super-secret-cron-key-123" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
