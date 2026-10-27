import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { NextRequest } from "next/server";
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "507f1f77bcf86cd799439011", role: "admin", tenantId: "perf-a" } }) }));
vi.mock("@/lib/db", () => ({ default: async () => mongoose.connection }));
import Audit from "@/models/crm/CrmAuditLog";
import Activity from "@/models/crm/Activity";
import "@/models/auth/User";
import { GET as activityRoute } from "@/app/api/crm/activities/route";
import Task from "@/models/crm/Task";
import { GET as audit } from "@/app/api/crm/audit/route";
import { GET as conflicts } from "@/app/api/calendar/conflicts/route";
import { getCalendarEvents } from "@/lib/calendar/aggregateEvents";
const from = new Date("2026-10-01T00:00:00Z"), to = new Date("2026-10-31T23:59:59Z");
beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([Audit.init(), Task.init(), Activity.init()]);
  for (const tenantId of ["perf-a", "perf-b"]) {
    await Audit.collection.insertMany(Array.from({ length: 5000 }, (_, i) => ({ tenantId, action: "updated", record_type: "Lead", timestamp: new Date(from.getTime() + i * 60000) })));
    await Activity.collection.insertMany(Array.from({ length: 3000 }, (_, i) => ({ tenantId, type: "Call", subject: `Synthetic activity ${i}`, activity_date: new Date(from.getTime() + i * 60000) })));
    await Task.collection.insertMany(Array.from({ length: 2000 }, (_, i) => ({ tenantId, title: `Synthetic task ${i}`, due_date: i < 500 ? new Date(from.getTime() + i * 3600000) : new Date("2027-01-01") })));
  }
});
afterAll(async () => { if (mongoose.connection.name.startsWith("aupulens_test_")) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
describe("Final audit: CRM audit and calendar current query evidence", () => {
  it("measures indexed, paginated, tenant-scoped queries without inventing a latency threshold", async () => {
    const timings: Record<string, number[]> = { audit: [], activities: [], conflicts: [] };
    for (let i = 0; i < 31; i++) {
      let start = performance.now();
      const response = await audit(new NextRequest("http://localhost/api/crm/audit?page=2&limit=50"));
      timings.audit.push(performance.now() - start);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.total).toBe(5000);
      expect(body.data.logs).toHaveLength(50);
      expect(body.data.logs.every((log: any) => log.tenantId === "perf-a")).toBe(true);
      start = performance.now();
      const activityResponse = await activityRoute(new NextRequest("http://localhost/api/crm/activities?page=2&limit=50"));
      timings.activities.push(performance.now() - start);
      expect(activityResponse.status).toBe(200);
      const activityBody = await activityResponse.json();
      expect(activityBody.data.total).toBe(3000);
      expect(activityBody.data.activities).toHaveLength(50);
      expect(activityBody.data.activities.every((row: any) => row.tenantId === "perf-a")).toBe(true);
      start = performance.now();
      expect((await conflicts(new NextRequest(`http://localhost/api/calendar/conflicts?from=${from.toISOString()}&to=${to.toISOString()}`))).status).toBe(200);
      timings.conflicts.push(performance.now() - start);
    }
    const events = await getCalendarEvents("perf-a", "sales", from, to);
    expect(events).toHaveLength(500);
    expect(events.every(event => event.start >= from.toISOString() && event.start <= to.toISOString())).toBe(true);
    const auditPlan = await Audit.find({ tenantId: "perf-a" }).sort({ timestamp: -1 }).skip(50).limit(50).explain("executionStats");
    const taskPlan = await Task.find({ tenantId: "perf-a", due_date: { $gte: from, $lte: to } }).sort({ due_date: 1 }).limit(1000).explain("executionStats");
    const activitiesPlan = await Activity.find({ tenantId: "perf-a" }).sort({ activity_date: -1 }).limit(50).explain("executionStats");
    const p95Ms = Object.fromEntries(Object.entries(timings).map(([key,samples]) => [key, [...samples.slice(1)].sort((a,b)=>a-b)[Math.ceil((samples.length-1)*0.95)-1]]));
    for (const value of Object.values(p95Ms)) expect(value).toBeLessThan(2000);
    const evidence = { p95Ms, targetMs: 2000, samples: "1 cold + 30 warm per handler", activitiesPlan, dataset: { auditLogs: 10000, activities: 6000, tasks: 4000, tenants: 2, matchingTasksPerTenant: 500 }, timingsMs: timings, auditPlan, taskPlan, baseline: "Original 18.8s/7.5s setup unavailable; these are current local measurements, not before/after or HTTP/network latency." };
    if (process.env.AUP_FINAL_AUDIT_PERFORMANCE_OUTPUT) writeFileSync(process.env.AUP_FINAL_AUDIT_PERFORMANCE_OUTPUT, JSON.stringify(evidence, null, 2));
  });
});
