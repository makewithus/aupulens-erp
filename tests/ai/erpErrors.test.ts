import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/db", () => ({ default: async () => {} }));
import { providerFailure, safeErpError } from "@/lib/ai/erpAssistant";
describe("safe provider error contract", () => {
  it.each([["APIConnectionTimeoutError", undefined, 504, "PROVIDER_TIMEOUT"], ["APIError", 429, 429, "RATE_LIMITED"], ["APIError", 503, 503, "PROVIDER_UNAVAILABLE"]])("categorizes %s/%s without leaking diagnostics", (name, status, expected, code) => {
    const source = Object.assign(new Error("secret internal provider details"), { name, status });
    const result = safeErpError(providerFailure(source), "request-qa");
    expect(result.status).toBe(expected); expect(result.body.code).toBe(code);
    expect(JSON.stringify(result)).not.toContain("secret internal");
    expect(result.body.requestId).toBe("request-qa");
  });
});
