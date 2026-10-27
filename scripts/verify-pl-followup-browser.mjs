import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.seq = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ready = new Promise((resolve) => this.ws.addEventListener("open", resolve, { once: true }));
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const task = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) task?.reject(new Error(msg.error.message));
        else task?.resolve(msg.result);
      } else {
        this.handlers.get(msg.method)?.(msg.params);
      }
    });
  }

  async send(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result?.value;
  }
}

async function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, label, timeout = 35000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const val = await fn();
      if (val) return val;
    } catch {}
    await pause(250);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

async function captureScreenshot(cdp, filepath) {
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  await fs.writeFile(filepath, Buffer.from(data, "base64"));
}

async function main() {
  const MONGO_URI = "mongodb://127.0.0.1:27183/aupulens_browser_qa";
  const BASE_URL = "http://127.0.0.1:3109";
  const ARTIFACT_DIR = "/home/krrish/.gemini/antigravity-ide/brain/66d4a63e-50ef-456a-979a-f8f7f4d3263f";

  console.log("1. Connecting to database to seed accounts, tenant, user, and journal entries...");
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const tenantId = "qa-tenant";
  const email = "qa-admin@example.com";
  const password = "Password123!";
  const hashedPassword = await bcrypt.hash(password, 10);

  // 1a. Ensure Organization
  await db.collection("organizations").updateOne(
    { subdomain: tenantId },
    {
      $set: {
        name: "QA Tenant",
        subdomain: tenantId,
        isActive: true,
        subscriptionStatus: "active",
        tier: "enterprise",
        settings: {
          ai: {},
          enabledModules: ["admin", "sales", "crm", "finance", "inventory"],
        },
      },
    },
    { upsert: true }
  );

  // 1b. Ensure User
  await db.collection("users").updateOne(
    { email, tenantId },
    {
      $set: {
        name: "QA Admin",
        email,
        phone: "9999999999",
        password: hashedPassword,
        role: "admin",
        status: "active",
        tenantId,
      },
    },
    { upsert: true }
  );

  // 1c. Ensure Plan
  await db.collection("plans").updateOne(
    { key: "enterprise" },
    {
      $set: {
        key: "enterprise",
        name: "Enterprise Plan",
        features: {
          modules: ["admin", "sales", "crm", "finance", "inventory"],
          featureFlags: {},
          aiCreditsPerMonth: 12000,
          aiRequestsPerMonth: 12000,
          maxUsers: 100,
          maxCompanies: 10,
          storageGb: 100,
          apiRequestsPerMonth: 50000,
          automationRunsPerMonth: 5000,
          documentLimitPerMonth: 10000,
          supportLevel: "dedicated",
        },
      },
    },
    { upsert: true }
  );

  // 1d. Seed Accounts
  await db.collection("accounts").deleteMany({ tenantId });
  const revRes = await db.collection("accounts").insertOne({
    tenantId,
    code: "4000",
    name: "Sales Revenue",
    account_type: "income",
    internal_group: "income",
    normal_balance: "credit",
    createdAt: new Date(),
  });
  const revAcc = { _id: revRes.insertedId, code: "4000", name: "Sales Revenue" };

  const cogsRes = await db.collection("accounts").insertOne({
    tenantId,
    code: "5100",
    name: "Cost of Goods Sold",
    account_type: "expense_direct_cost",
    internal_group: "expense",
    normal_balance: "debit",
    createdAt: new Date(),
  });
  const cogsAcc = { _id: cogsRes.insertedId, code: "5100", name: "Cost of Goods Sold" };

  const opexRes = await db.collection("accounts").insertOne({
    tenantId,
    code: "6000",
    name: "Operating Expenses",
    account_type: "expense_operating",
    internal_group: "expense",
    normal_balance: "debit",
    createdAt: new Date(),
  });
  const opexAcc = { _id: opexRes.insertedId, code: "6000", name: "Operating Expenses" };

  const bankRes = await db.collection("accounts").insertOne({
    tenantId,
    code: "1001",
    name: "Main Bank Account",
    account_type: "asset_cash",
    internal_group: "asset",
    normal_balance: "debit",
    createdAt: new Date(),
  });
  const bankAcc = { _id: bankRes.insertedId, code: "1001", name: "Main Bank Account" };

  // 1e. Seed Journal Entries
  await db.collection("journalentries").deleteMany({ tenantId });
  await db.collection("journalentries").insertMany([
    {
      tenantId,
      header: { name: "JE-REC-01", date: new Date("2026-10-15T10:00:00Z"), journalType: "general" },
      voucherStatus: "approved",
      status: "posted",
      lineIds: [
        { accountId: bankAcc._id, debit: 50000, credit: 0 },
        { accountId: revAcc._id, debit: 0, credit: 50000 },
      ],
      totals: { totalDebit: 50000, totalCredit: 50000 },
    },
    {
      tenantId,
      header: { name: "JE-REC-02", date: new Date("2026-10-16T12:00:00Z"), journalType: "general" },
      voucherStatus: "approved",
      status: "posted",
      lineIds: [
        { accountId: cogsAcc._id, debit: 15000, credit: 0 },
        { accountId: bankAcc._id, debit: 0, credit: 15000 },
      ],
      totals: { totalDebit: 15000, totalCredit: 15000 },
    },
    {
      tenantId,
      header: { name: "JE-REC-03", date: new Date("2026-10-17T14:00:00Z"), journalType: "general" },
      voucherStatus: "approved",
      status: "posted",
      lineIds: [
        { accountId: opexAcc._id, debit: 5000, credit: 0 },
        { accountId: bankAcc._id, debit: 0, credit: 5000 },
      ],
      totals: { totalDebit: 5000, totalCredit: 5000 },
    },
    {
      tenantId,
      header: { name: "JE-REC-DRAFT", date: new Date("2026-10-20T14:00:00Z"), journalType: "general" },
      voucherStatus: "draft",
      status: "draft",
      lineIds: [
        { accountId: cogsAcc._id, debit: 5000, credit: 0 },
        { accountId: bankAcc._id, debit: 0, credit: 5000 },
      ],
      totals: { totalDebit: 5000, totalCredit: 5000 },
    },
  ]);

  // Clean chat histories
  await db.collection("chathistories").deleteMany({ tenantId });

  console.log("Seeding complete.");

  console.log("2. Launching headless Chrome...");
  const chrome = spawn("/usr/bin/google-chrome", [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--window-size=1280,950",
    "--remote-debugging-port=9227",
  ]);

  try {
    await waitFor(async () => {
      const r = await fetch("http://127.0.0.1:9227/json/version");
      return r.ok;
    }, "Chrome debugger ready", 10000);

    const target = await (await fetch("http://127.0.0.1:9227/json/new?about:blank", { method: "PUT" })).json();
    const cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    console.log("3. Navigating to auth page...");
    await cdp.send("Page.navigate", { url: `${BASE_URL}/auth` });
    await waitFor(() => cdp.evaluate("location.origin === " + JSON.stringify(BASE_URL)), "Auth page load");

    console.log("4. Logging in as QA admin user...");
    const loginResult = await cdp.evaluate(`(async () => {
      const csrfRes = await fetch('/api/auth/csrf');
      const { csrfToken } = await csrfRes.json();
      const res = await fetch('/api/auth/callback/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
        body: new URLSearchParams({
          csrfToken,
          email: 'qa-admin@example.com',
          password: 'Password123!',
          tenantId: 'qa-tenant'
        })
      });
      return res.status;
    })()`);
    console.log("Login HTTP status:", loginResult);

    console.log("5. Navigating to Sales AI Assistant (/sales/ai-assistant)...");
    await cdp.send("Page.navigate", { url: `${BASE_URL}/sales/ai-assistant` });
    await pause(2000);

    await waitFor(() => cdp.evaluate("!!document.querySelector('textarea')"), "Textarea visible");
    console.log("Sales AI Assistant loaded successfully!");

    // Helper to send message in assistant
    async function sendMessage(text) {
      console.log(`Sending message: "${text.slice(0, 80)}..."`);
      await cdp.evaluate(`(() => {
        const textarea = document.querySelector('textarea');
        if (!textarea) throw new Error("No textarea found");
        textarea.focus();
        textarea.select();
      })()`);
      await pause(200);

      await cdp.send("Input.insertText", { text });
      await pause(400);

      await waitFor(async () => {
        return await cdp.evaluate(`(() => {
          const btn = document.querySelector('button[type="submit"]');
          return btn && !btn.disabled;
        })()`);
      }, "Submit button enabled", 5000);

      await cdp.evaluate(`(() => {
        const btn = document.querySelector('button[type="submit"]');
        if (btn) btn.click();
      })()`);
      console.log("Submit button clicked successfully!");
    }

    async function waitForAssistantReply() {
      console.log("Waiting for assistant response...");
      await pause(1000);
      await waitFor(async () => {
        const isThinking = await cdp.evaluate(`(() => {
          return document.body.innerText.includes('Thinking...') || !!document.querySelector('.animate-spin');
        })()`);
        return !isThinking;
      }, "Assistant reply completed", 35000);
      await pause(1500);
    }

    // --- TURN 1 ---
    console.log("\n=================== TURN 1 ===================");
    const turn1Text = "Analyse the company's overall financial position across all enabled and accessible ERP modules. Use the current organization's real data. State the reporting period, revenue, COGS, expenses, and net profit or loss where supported. Identify which modules and posted records you actually checked. If the financial data is incomplete, do not declare the company profitable or loss-making; explain exactly what is missing.";
    await sendMessage(turn1Text);
    await waitForAssistantReply(2);

    const turn1Dom = await cdp.evaluate(`(() => {
      const text = document.body.innerText;
      return {
        hasProfitLoss: text.includes('Profit & Loss') || text.includes('PROFITABLE') || text.includes('In Profit') || text.includes('Net Profit') || text.includes('₹50,000') || text.includes('50,000'),
        hasPlanCard: text.includes('Workspace Account Plan') || text.includes('AI Credit Limit'),
        textSnippet: text.slice(text.length - 2000)
      };
    })()`);
    console.log("Turn 1 DOM checks:", { hasProfitLoss: turn1Dom.hasProfitLoss, hasPlanCard: turn1Dom.hasPlanCard });
    await captureScreenshot(cdp, `${ARTIFACT_DIR}/pl_turn1_screenshot.png`);

    if (!turn1Dom.hasProfitLoss || turn1Dom.hasPlanCard) {
      console.log("Turn 1 Page Text:\n", turn1Dom.textSnippet);
      throw new Error("Turn 1 failed: Expected Profit & Loss card and no Workspace Account Plan card.");
    }
    console.log("Turn 1 verified successfully.");

    // --- TURN 2 (The reproduction turn) ---
    console.log("\n=================== TURN 2 ===================");
    const turn2Text = "Show the account-level calculation for this all-time profit and loss report. For every included revenue and COGS account, show its account name, amount, and the posted-entry total. Confirm the date range and explain whether any other enabled financial module contains income or expenses not represented in this posted general ledger. Do not repeat the summary card without the requested details.";
    await sendMessage(turn2Text);
    await waitForAssistantReply(4);

    const turn2Dom = await cdp.evaluate(`(() => {
      const text = document.body.innerText;
      return {
        hasPlanCard: text.includes('Workspace Account Plan') || text.includes('AI Credit Limit') || text.includes('Account plan:'),
        hasRevenueBreakdown: text.includes('Revenue Breakdown') || text.includes('Sales Revenue') || text.includes('4000'),
        hasCogsBreakdown: text.includes('Cost of Goods Sold') || text.includes('5100'),
        hasCrossModule: text.includes('Cross-Module') || text.includes('Finance Ledger') || text.includes('double-counting'),
        hasEntryCount: text.includes('entry') || text.includes('entries'),
        textSnippet: text.slice(text.length - 2500)
      };
    })()`);
    console.log("Turn 2 DOM checks:", {
      hasPlanCard: turn2Dom.hasPlanCard,
      hasRevenueBreakdown: turn2Dom.hasRevenueBreakdown,
      hasCogsBreakdown: turn2Dom.hasCogsBreakdown,
      hasCrossModule: turn2Dom.hasCrossModule,
      hasEntryCount: turn2Dom.hasEntryCount,
    });
    await captureScreenshot(cdp, `${ARTIFACT_DIR}/pl_turn2_screenshot.png`);

    if (turn2Dom.hasPlanCard) {
      console.log("Turn 2 Page Text:\n", turn2Dom.textSnippet);
      throw new Error("REGRESSION DETECTED! Turn 2 rendered Workspace Account Plan card!");
    }
    if (!turn2Dom.hasRevenueBreakdown || !turn2Dom.hasCogsBreakdown) {
      console.log("Turn 2 Page Text:\n", turn2Dom.textSnippet);
      throw new Error("Turn 2 failed: Missing account-level revenue or COGS breakdown.");
    }
    console.log("Turn 2 verified successfully: Financial breakdown rendered, zero plan card substitution!");

    // --- TURN 3 (Explicit plan request) ---
    console.log("\n=================== TURN 3 ===================");
    const turn3Text = "Now show me the account plan.";
    await sendMessage(turn3Text);
    await waitForAssistantReply(6);

    const turn3Dom = await cdp.evaluate(`(() => {
      const text = document.body.innerText;
      return {
        hasPlanCard: text.includes('Workspace Account Plan') || text.includes('Account plan: enterprise') || text.includes('Account plan:') || text.includes('Enterprise'),
        textSnippet: text.slice(text.length - 1500)
      };
    })()`);
    console.log("Turn 3 DOM checks:", { hasPlanCard: turn3Dom.hasPlanCard });
    await captureScreenshot(cdp, `${ARTIFACT_DIR}/pl_turn3_screenshot.png`);

    if (!turn3Dom.hasPlanCard) {
      console.log("Turn 3 Page Text:\n", turn3Dom.textSnippet);
      throw new Error("Turn 3 failed: Expected Workspace Account Plan card when explicitly requested.");
    }
    console.log("Turn 3 verified successfully: Account plan correctly displayed on explicit request!");

    console.log("\nALL MANUAL BROWSER VERIFICATIONS PASSED SUCCESSFULLY!");
  } finally {
    try {
      chrome.kill("SIGKILL");
    } catch {}
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("Browser verification failed:", err);
  process.exit(1);
});
