import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => {
  const work = vi.fn();
  const chain: any = { lean: async () => [], select: () => chain, then: (resolve: any) => Promise.resolve([]).then(resolve) };
  const find = vi.fn(() => { work(); return chain; });
  const run = vi.fn(async () => { work(); return {}; });
  return { work, find, run, model: { find, updateMany: run } };
});
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: (callback: () => void) => { callback(); } }));
vi.mock("@/lib/db", () => ({ default: m.run }));
vi.mock("@/models/crm/Case", () => ({ default: m.model }));
vi.mock("@/models/crm/Activity", () => ({ default: m.model }));
vi.mock("@/models/crm/CrmAuditLog", () => ({ default: m.model }));
vi.mock("@/models/crm/Contract", () => ({ default: m.model }));
vi.mock("@/models/crm/Task", () => ({ default: m.model }));
vi.mock("@/models/crm/Lead", () => ({ default: m.model }));
vi.mock("@/models/crm/Opportunity", () => ({ default: m.model }));
vi.mock("@/models/admin/Organization", () => ({ default: m.model }));
vi.mock("@/models/platform/AdminAccessRequest", () => ({ default: m.model }));
vi.mock("@/models/ai/AiSchedule", () => ({ default: m.model, AI_SCHEDULE_STATUS: { APPROVED: "approved" } }));
vi.mock("@/lib/crm/caseNotifications", () => ({ sendCaseNotification: m.run }));
vi.mock("@/lib/crm/automationEngine", () => ({ triggerAutomation: m.run }));
vi.mock("@/lib/ai/businessHealth", () => ({ generateBusinessHealthSummary: m.run }));
vi.mock("@/lib/platform/audit/retention", () => ({ runRetentionSweep: m.run }));
vi.mock("@/lib/platform/ai/rollup", () => ({ rollupAiUsageForDay: m.run }));
vi.mock("@/lib/platform/alerts/conditions", () => ({ checkAiCostSpike: m.run }));
vi.mock("@/lib/aiRuntime/bootstrap", () => ({ bootstrapAiRuntime: m.run }));
vi.mock("@/lib/aiRuntime/metrics/computeMetrics", () => ({ computeAndPersistTenantMetrics: m.run }));
vi.mock("@/lib/aiRuntime/metrics/drift", () => ({ checkDrift: m.run }));
vi.mock("@/lib/aiRuntime/runtime/eventBus", () => ({ emitEvent: m.run, sweepPendingEvents: m.run }));
vi.mock("@/lib/sales/subscriptionBillingRunner", () => ({ runSubscriptionBilling: m.run }));
vi.mock("@/lib/sales/dunningEngine", () => ({ processDunningRetries: m.run }));
vi.mock("@/lib/sales/reminderEngine", () => ({ evaluateInvoiceReminders: m.run, evaluateBillReminders: m.run }));
vi.mock("@/lib/platform/scheduler/runner", () => ({ runDueJobs: m.run }));
vi.mock("@/lib/aiRuntime/runtime/registry", () => ({ listWorkflows: () => [] }));
import * as route0 from "@/app/api/cron/ai/metrics-snapshot/route";
import * as route1 from "@/app/api/cron/ai/runtime-sweep/route";
import * as route2 from "@/app/api/cron/business-health/route";
import * as route3 from "@/app/api/cron/crm/automations/route";
import * as route4 from "@/app/api/cron/crm/contract-check/route";
import * as route5 from "@/app/api/cron/crm/sla-check/route";
import * as route6 from "@/app/api/cron/platform/access-session-expiry/route";
import * as route7 from "@/app/api/cron/platform/ai-cost-spike-check/route";
import * as route8 from "@/app/api/cron/platform/ai-usage-rollup/route";
import * as route9 from "@/app/api/cron/platform/retention-sweep/route";
import * as route10 from "@/app/api/cron/sales/reminders-evaluation/route";
import * as route11 from "@/app/api/cron/sales/subscriptions-billing/route";
import * as route12 from "@/app/api/platform/scheduler/run-due/route";
const routes = [
  ["/api/cron/ai/metrics-snapshot", route0],
  ["/api/cron/ai/runtime-sweep", route1],
  ["/api/cron/business-health", route2],
  ["/api/cron/crm/automations", route3],
  ["/api/cron/crm/contract-check", route4],
  ["/api/cron/crm/sla-check", route5],
  ["/api/cron/platform/access-session-expiry", route6],
  ["/api/cron/platform/ai-cost-spike-check", route7],
  ["/api/cron/platform/ai-usage-rollup", route8],
  ["/api/cron/platform/retention-sweep", route9],
  ["/api/cron/sales/reminders-evaluation", route10],
  ["/api/cron/sales/subscriptions-billing", route11],
  ["/api/platform/scheduler/run-due", route12]
] as const;
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => vi.unstubAllEnvs());
for (const [path, route] of routes) {
  for (const method of ["GET", "POST"] as const) {
    if (!(method in route)) continue;
    describe(`${method} ${path} secret contract`, () => {
      it.each([
        ["missing token", "audit-test-only-secret", undefined],
        ["wrong token", "audit-test-only-secret", "Bearer wrong"],
        ["undefined placeholder", undefined, "Bearer undefined"],
        ["unconfigured secret", undefined, undefined],
        ["empty bearer", "audit-test-only-secret", "Bearer "],
        ["malformed scheme", "audit-test-only-secret", "Basic bad"],
        ["literal undefined with configured secret", "audit-test-only-secret", "Bearer undefined"],
      ])("rejects %s before protected work", async (_label, secret, header) => {
        vi.stubEnv("CRON_SECRET", secret);
        const request = new NextRequest(`http://localhost${path}`, { method, headers: header ? { authorization: header } : {} });
        const response = await (route as any)[method](request);
        expect(response.status).toBe(path.endsWith("/sla-check") && !secret ? 500 : 401);
        expect(await response.text()).not.toContain("audit-test-only-secret");
        expect(m.work).not.toHaveBeenCalled();
      });
      it("accepts the configured secret and reaches mocked protected work", async () => {
        vi.stubEnv("CRON_SECRET", "audit-test-only-secret");
        const response = await (route as any)[method](new NextRequest(`http://localhost${path}`, { method, headers: { authorization: "Bearer audit-test-only-secret" } }));
        expect(response.status).toBe(200);
        expect(m.work).toHaveBeenCalled();
      });
    });
  }
}
