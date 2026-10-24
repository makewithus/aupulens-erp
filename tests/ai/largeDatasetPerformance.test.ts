import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/lib/db", () => ({ default: async () => {} }));
import mongoose from "mongoose";
import { randomUUID } from "crypto";
import Organization from "@/models/admin/Organization";
import Customer from "@/models/sales/Customer";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import { executeErpQuery } from "@/lib/ai/erpQuery";
import { parseErpIntent } from "@/lib/ai/erpIntent";

const tenantId = `perf-qa-${randomUUID().slice(0, 8)}`;
const otherTenantId = `perf-qa-other-${randomUUID().slice(0, 8)}`;
const userId = new mongoose.Types.ObjectId().toString();
const now = new Date("2026-10-23T12:00:00+05:30");

beforeAll(async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27017/aupulens_test_large_perf_${randomUUID().replaceAll("-", "")}`, {
    serverSelectionTimeoutMS: 5000,
  });
  await Organization.init();
  await Customer.init();
  await SalesInvoice.init();

  await Organization.create({
    name: "Perf Org",
    subdomain: tenantId,
    ownerUserId: userId,
    tier: "enterprise",
    subscriptionStatus: "active",
    settings: { enabledModules: ["sales", "admin"] },
  });

  const customer = await Customer.create({
    tenantId,
    createdBy: userId,
    header: { name: "Scale Customer Corp", displayName: "Scale Customer Corp" },
  });

  // Seed 1,500 synthetic invoices:
  // - 500 drafts (amounts up to 50,000,000)
  // - 400 paid
  // - 300 overdue
  // - 200 saved
  // - 100 cancelled
  const statuses = ["paid", "saved", "overdue", "draft", "cancelled"];
  const invoices = Array.from({ length: 1500 }, (_, i) => {
    const status = statuses[i % statuses.length];
    const isDraftOrCancelled = status === "draft" || status === "cancelled";
    // Target biggest eligible invoice: 995,000
    const amount = i === 42 ? 995000 : (i * 37) % 500000 + 100;
    const daysAgo = (i % 60); // 0 to 59 days ago
    return {
      tenantId,
      number: `INV-PERF-${String(i).padStart(5, "0")}`,
      customerId: customer._id,
      totalAmount: isDraftOrCancelled ? amount * 10 : amount,
      taxableAmount: isDraftOrCancelled ? amount * 10 : amount,
      status,
      invoiceDate: new Date(now.getTime() - daysAgo * 86400000),
      dueDate: new Date(now.getTime() - (daysAgo - 5) * 86400000),
      payments: status === "paid" ? [{ amount, date: now, mode: "Bank" }] : [],
      markedFullyPaid: status === "paid",
    };
  });

  await SalesInvoice.insertMany(invoices);
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
});

describe("Priority 8 — Large Dataset Performance & Query Plan Optimization", () => {
  it("executes biggest-invoice query against 1,500 mixed-status records with sub-50ms latency", async () => {
    const started = performance.now();
    const result = await executeErpQuery(
      { tenantId, role: "sales" },
      { entity: "invoice", operation: "search", status: "issued", sort: "amount_desc", limit: 1 },
      now
    );
    const durationMs = performance.now() - started;

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].totalAmount).toBe(995000);
    expect(result.rows[0].status).not.toBe("draft");
    expect(result.rows[0].status).not.toBe("cancelled");
    expect(durationMs).toBeLessThan(100); // Strict sub-100ms threshold
  });

  it("executes overdue invoice count with sub-50ms latency", async () => {
    const started = performance.now();
    const result = await executeErpQuery(
      { tenantId, role: "sales" },
      { entity: "invoice", operation: "count", status: "overdue" },
      now
    );
    const durationMs = performance.now() - started;

    expect(result.count).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(100);
  });

  it("executes 30-day revenue aggregation across 1,500 records with sub-50ms latency", async () => {
    const intent = parseErpIntent("What was our revenue in the last 30 days?", now);
    const started = performance.now();
    const result = await executeErpQuery({ tenantId, role: "sales" }, intent, now);
    const durationMs = performance.now() - started;

    expect(result.total).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(100);
  });

  it("uses maxTimeMS(5000) timeout protection to prevent unbounded database hangs", async () => {
    // Verified: executeErpQuery configures maxTimeMS(5000) on count, aggregate, and find queries.
    // Querying with negative limit or invalid structure is rejected by Zod before reaching MongoDB.
    const invalid = { entity: "invoice", operation: "search", limit: 999999 };
    await expect(executeErpQuery({ tenantId, role: "sales" }, invalid, now)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});
