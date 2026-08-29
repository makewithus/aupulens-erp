/**
 * Stale/invalid model-override classifier tests.
 *
 * The classifier is the core of the deploy-time + admin-visible health check
 * that flags any tenant whose settings.ai.model won't resolve to a deployed
 * Azure model (which would otherwise silently 400 every AI call for them).
 */
import { describe, it, expect, vi } from "vitest";

// classifyModelOverride is pure, but importing the module pulls in @/lib/db
// (used by checkTenantModelOverrides) whose top-level guard throws without
// MONGODB_URI. Mock the DB + model so the pure function can be imported.
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/models/admin/Organization", () => ({ default: function Organization() {} }));

import { classifyModelOverride } from "@/lib/ai/modelHealth";

const DEPLOYED = ["gpt-4o"];

describe("classifyModelOverride", () => {
  it("accepts a deployed chat deployment name", () => {
    expect(classifyModelOverride("gpt-4o", DEPLOYED)).toEqual({ valid: true });
  });

  it("flags a stale Anthropic (claude-*) name with a migration-specific reason", () => {
    const r = classifyModelOverride("claude-sonnet-4-6", DEPLOYED);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/anthropic|pre-azure/i);
  });

  it("flags an embedding deployment used as a chat model", () => {
    const r = classifyModelOverride("text-embedding-ada-002", DEPLOYED);
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/embedding/i);
  });

  it("flags an arbitrary/typo model name and names the deployed set", () => {
    const r = classifyModelOverride("gpt-4o-typo", DEPLOYED);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("gpt-4o");
  });

  it("supports multiple deployed chat deployments", () => {
    expect(classifyModelOverride("gpt-4o-mini", ["gpt-4o", "gpt-4o-mini"])).toEqual({ valid: true });
  });

  it("flags everything when nothing is deployed", () => {
    expect(classifyModelOverride("gpt-4o", []).valid).toBe(false);
  });
});
