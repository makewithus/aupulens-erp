import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }));
vi.mock("@/auth.config", () => ({ authConfig: {} }));
vi.mock("@/lib/middleware/orgTierCache", () => ({ createOrgTierCache: () => ({ get: vi.fn().mockResolvedValue(null) }) }));
import middleware from "@/middleware";

async function visit(headers: Record<string, string>, role: string | null = "admin", path = "/api/ai/usage") {
  const request = new NextRequest(`https://localhost${path}`, { headers });
  Object.assign(request, { auth: role ? { user: { id: "test-user", tenantId: "default-tenant", role } } : null });
  // NextAuth normally supplies auth and the Next middleware event.
  const response = await middleware(request as never, {} as never);
  if (!(response instanceof Response)) throw new Error("Middleware did not return a response");
  return response;
}

describe("AI usage browser navigation", () => {
  it.each(["admin", "finance", "sales", "crm", "inventory", "manufacturing", "hr"])("opens the %s assistant for document navigation", async role => {
    const response = await visit({ "sec-fetch-mode": "navigate", accept: "text/html,application/xhtml+xml" }, role);
    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe(`https://localhost/${role}/ai-assistant`);
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    expect(response?.headers.get("vary")).toContain("Sec-Fetch-Mode");
  });

  it("supports HTML navigation without Fetch Metadata headers", async () => {
    expect((await visit({ accept: "text/html" }))?.headers.get("location")).toBe("https://localhost/admin/ai-assistant");
  });

  it.each([{}, { accept: "application/json" }, { accept: "*/*", "sec-fetch-mode": "cors" }, { accept: "text/html", "sec-fetch-mode": "cors" }])("preserves API requests: %j", async headers => {
    const response = await visit(headers);
    expect(response?.headers.get("location")).toBeNull();
    expect(response?.headers.get("x-middleware-next")).toBe("1");
  });

  it("sends signed-out browser visitors to sign-in and keeps API authentication", async () => {
    expect((await visit({ "sec-fetch-mode": "navigate", accept: "text/html" }, null))?.headers.get("location")).toBe("https://localhost/auth");
    expect((await visit({ accept: "application/json" }, null))?.status).toBe(401);
  });

  it("uses the existing dashboard for roles without an assistant page", async () => {
    expect((await visit({ "sec-fetch-mode": "navigate" }, "project"))?.headers.get("location")).toBe("https://localhost/projects/dashboard");
  });
});
