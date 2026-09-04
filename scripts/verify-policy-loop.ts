/**
 * One-off browser-level proof (docs/ai/BRIEF-06-BATCH-E.md Part 0.5) that the Policy tab's
 * `maxAutonomyLevel` control changes what a real workflow run actually does — not just that the
 * two share a field name at the mechanism level (already proven exhaustively by every workflow
 * test in this project), but that a human clicking the control in the browser produces a
 * different `autonomyApplied` on the next run.
 *
 * One workflow (AI-05), one browser session, two policy values. To get a clean, deterministic
 * "recommend vs draft" comparison (not just a clamp-reason difference) this creates a small,
 * clearly-tagged fixture (one Customer, one open SalesInvoice, one draft Payment with a matching
 * `unusedAmount`) so AI-05 has a genuine "exact match" allocation candidate and reaches
 * `confidence: 1` — without it, an empty tenant would never clear AI-05's own confidence-
 * threshold gate check regardless of policy, and the test would prove nothing. Every fixture
 * document is deleted in a `finally` block, success or failure.
 *
 * Usage: npx tsx scripts/verify-policy-loop.ts [baseUrl]
 * Requires: the dev server running (npm run dev), reachable at baseUrl (default localhost:3000).
 */
import { chromium } from "playwright";
import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";

// Plain scripts (unlike Next.js itself) don't auto-load .env — parse it directly rather than
// add a dotenv dependency for one script.
for (const line of fs.readFileSync(path.resolve(__dirname, "../.env"), "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
  if (!(key in process.env)) process.env[key] = value;
}

const BASE_URL = process.argv[2] || process.env.UI_SCAN_BASE_URL || "http://localhost:3000";
const LOGIN_EMAIL = process.env.UI_SCAN_EMAIL || "admin@aupulens.com";
const LOGIN_PASSWORD = process.env.UI_SCAN_PASSWORD || "Aupulens@2026";
const LOGIN_TENANT_ID = process.env.UI_SCAN_TENANT_ID || "default-tenant";
const FIXTURE_TAG = "POLICY-LOOP-VERIFY-DELETE-ME";

function getSetCookies(res: Response): string[] {
  const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") return anyHeaders.getSetCookie();
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

async function loginAndGetCookies(): Promise<{ name: string; value: string; domain: string; path: string }[]> {
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  const setCookieHeaders = getSetCookies(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const cookieJar = new Map<string, string>();
  for (const raw of setCookieHeaders) {
    const pair = raw.split(";")[0];
    const eqIdx = pair.indexOf("=");
    cookieJar.set(pair.slice(0, eqIdx), pair.slice(eqIdx + 1));
  }
  const csrfCookieHeader = Array.from(cookieJar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");

  const body = new URLSearchParams({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD, tenantId: LOGIN_TENANT_ID, csrfToken, json: "true" });
  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: csrfCookieHeader },
    body: body.toString(),
    redirect: "manual",
  });
  for (const raw of getSetCookies(loginRes)) {
    const pair = raw.split(";")[0];
    const eqIdx = pair.indexOf("=");
    cookieJar.set(pair.slice(0, eqIdx), pair.slice(eqIdx + 1));
  }
  const allSetCookies = Array.from(cookieJar.entries()).map(([k, v]) => `${k}=${v}`);
  if (!allSetCookies.some((c) => /^(__Secure-)?authjs\.session-token=/.test(c))) {
    throw new Error(`Login failed: ${loginRes.status}`);
  }
  const url = new URL(BASE_URL);
  return allSetCookies.map((raw) => {
    const [pair] = raw.split(";");
    const eqIdx = pair.indexOf("=");
    return { name: pair.slice(0, eqIdx), value: pair.slice(eqIdx + 1), domain: url.hostname, path: "/" };
  });
}

async function setPolicyViaUi(page: import("playwright").Page, workflowId: string, level: string) {
  // The policy GET fires once, on mount (useEffect), not on the tab click — the click below is a
  // pure client-side tab switch over data already in React state. Wait for that mount-time fetch
  // (and hydration) to complete BEFORE clicking, not after.
  const policyGetPromise = page.waitForResponse((res) => res.url().includes("/api/finance/ai-operations/policy") && res.request().method() === "GET", { timeout: 20000 });
  await page.goto(`${BASE_URL}/finance/ai-operations`, { waitUntil: "domcontentloaded" });
  await policyGetPromise;
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  await page.locator('[role="tab"]', { hasText: /policy/i }).click();

  const row = page.locator("tr").filter({ hasText: workflowId }).first();
  try {
    await row.waitFor({ state: "visible", timeout: 15000 });
  } catch (err) {
    const allRows = await page.locator("tr").allTextContents();
    console.log(`DEBUG: ${allRows.length} <tr> found, texts:`, JSON.stringify(allRows.slice(0, 20)));
    await page.screenshot({ path: "/tmp/verify-policy-loop-debug.png", fullPage: true });
    throw err;
  }
  await row.scrollIntoViewIfNeeded();
  const select = row.locator('button[role="combobox"]').first();
  await select.click();
  await page.getByRole("option", { name: new RegExp(`^${level.replace(/_/g, " ")}$`, "i") }).click();
  await page.waitForResponse((res) => res.url().includes(`/api/finance/ai-operations/policy/${workflowId}`) && res.request().method() === "PATCH", { timeout: 10000 });
}

async function main() {
  console.log(`Logging in as ${LOGIN_EMAIL} (tenant ${LOGIN_TENANT_ID})...`);
  const cookies = await loginAndGetCookies();
  console.log("Login OK.");

  await mongoose.connect(process.env.MONGODB_URI!);
  const AiWorkflowPolicy = (await import("../models/ai/AiWorkflowPolicy")).default;
  const AiWorkflowRun = (await import("../models/ai/AiWorkflowRun")).default;
  const Customer = (await import("../models/sales/Customer")).default;
  const { SalesInvoice } = await import("../models/sales/SalesInvoice");
  const Payment = (await import("../models/sales/Payment")).default;
  const User = (await import("../models/auth/User")).default;
  const { bootstrapAiRuntime } = await import("../lib/aiRuntime/bootstrap");
  const { runWorkflow } = await import("../lib/aiRuntime/runtime/executor");
  const { ai05ReceivablesOperations } = await import("../lib/aiRuntime/workflows/ai-05-receivables-operations");
  bootstrapAiRuntime();

  const adminUser = await User.findOne({ tenantId: LOGIN_TENANT_ID, email: LOGIN_EMAIL }).lean();
  if (!adminUser) throw new Error(`No user ${LOGIN_EMAIL} found in tenant ${LOGIN_TENANT_ID}`);
  const actingUserId = String((adminUser as { _id: unknown })._id);

  const originalPolicy = await AiWorkflowPolicy.findOne({ tenantId: LOGIN_TENANT_ID, workflowId: "AI-05" }).lean();
  console.log(`AI-05 policy before test: maxAutonomyLevel=${originalPolicy?.maxAutonomyLevel ?? "(none)"}, killSwitchEnabled=${originalPolicy?.killSwitchEnabled ?? "(none)"}`);

  let customer: any, invoice: any, payment: any;
  let browser: import("playwright").Browser | undefined;

  try {
    // Fixture: a genuine "exact match" allocation candidate, so AI-05 reaches confidence: 1
    // regardless of what else exists in this tenant.
    customer = await Customer.create({ tenantId: LOGIN_TENANT_ID, header: { name: FIXTURE_TAG, is_company: true }, contact_details: {}, createdBy: actingUserId });
    invoice = await (SalesInvoice as any).create({
      tenantId: LOGIN_TENANT_ID,
      number: `${FIXTURE_TAG}-INV`,
      customerId: customer._id,
      status: "saved",
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() - 2 * 86400000),
      lineItems: [],
      taxableAmount: 1000,
      totalAmount: 1000,
      payments: [],
    });
    payment = await Payment.create({
      tenantId: LOGIN_TENANT_ID,
      customerId: customer._id,
      paymentNumber: `${FIXTURE_TAG}-PAY`,
      paymentDate: new Date(),
      amountReceived: 1000,
      allocations: [],
      unusedAmount: 1000,
      status: "draft",
    });
    console.log(`Fixture created: Customer ${customer._id}, SalesInvoice ${invoice._id}, Payment ${payment._id}`);

    await AiWorkflowPolicy.findOneAndUpdate(
      { tenantId: LOGIN_TENANT_ID, workflowId: "AI-05" },
      { $set: { killSwitchEnabled: true, confidenceThreshold: 0.85 } },
      { upsert: true },
    );

    browser = await chromium.launch();
    const context = await browser.newContext();
    await context.addCookies(cookies);
    await context.addInitScript(() => sessionStorage.setItem("session_active", "true"));
    const page = await context.newPage();

    // ── State A: policy clamps below AI-05's own declared ceiling ──
    console.log("\nSetting AI-05 maxAutonomyLevel -> observe (via the Policy tab UI)...");
    await setPolicyViaUi(page, "AI-05", "observe");
    const policyA = await AiWorkflowPolicy.findOne({ tenantId: LOGIN_TENANT_ID, workflowId: "AI-05" }).lean();
    console.log(`DB confirms: maxAutonomyLevel=${policyA?.maxAutonomyLevel}`);

    const envelopeA = await runWorkflow(ai05ReceivablesOperations, { tenantId: LOGIN_TENANT_ID, eventKey: "ai.sweep.hourly", payload: { actingUserId } });
    const runA = await AiWorkflowRun.findById(envelopeA.runId).lean();
    console.log(`Run A: autonomyApplied=${runA?.autonomyApplied}, status=${runA?.status}`);

    // ── State B: policy allows AI-05's own declared ceiling (draft) through ──
    console.log("\nSetting AI-05 maxAutonomyLevel -> draft (via the Policy tab UI)...");
    await setPolicyViaUi(page, "AI-05", "draft");
    const policyB = await AiWorkflowPolicy.findOne({ tenantId: LOGIN_TENANT_ID, workflowId: "AI-05" }).lean();
    console.log(`DB confirms: maxAutonomyLevel=${policyB?.maxAutonomyLevel}`);

    const envelopeB = await runWorkflow(ai05ReceivablesOperations, { tenantId: LOGIN_TENANT_ID, eventKey: "ai.sweep.hourly", payload: { actingUserId } });
    const runB = await AiWorkflowRun.findById(envelopeB.runId).lean();
    console.log(`Run B: autonomyApplied=${runB?.autonomyApplied}, status=${runB?.status}`);

    console.log("\n=== RESULT ===");
    console.log(`Policy=observe -> autonomyApplied=${runA?.autonomyApplied}`);
    console.log(`Policy=draft   -> autonomyApplied=${runB?.autonomyApplied}`);
    if (runA?.autonomyApplied !== runB?.autonomyApplied) {
      console.log("PASS: the Policy tab changed AI-05's effective autonomy end to end.");
    } else {
      console.log("NO CHANGE OBSERVED — see confidence/gate details above.");
      process.exitCode = 1;
    }
  } finally {
    await browser?.close();
    // Restore the tenant's original policy row exactly as found.
    if (originalPolicy) {
      await AiWorkflowPolicy.updateOne(
        { tenantId: LOGIN_TENANT_ID, workflowId: "AI-05" },
        { $set: { maxAutonomyLevel: originalPolicy.maxAutonomyLevel, killSwitchEnabled: originalPolicy.killSwitchEnabled, confidenceThreshold: originalPolicy.confidenceThreshold } },
      );
      console.log(`\nRestored AI-05 policy to maxAutonomyLevel=${originalPolicy.maxAutonomyLevel}, killSwitchEnabled=${originalPolicy.killSwitchEnabled}`);
    }
    // Delete every fixture document this script created.
    if (payment) await Payment.deleteOne({ _id: payment._id });
    if (invoice) await (SalesInvoice as any).deleteOne({ _id: invoice._id });
    if (customer) await Customer.deleteOne({ _id: customer._id });
    console.log("Fixture cleanup done.");
    await mongoose.connection.close();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});
