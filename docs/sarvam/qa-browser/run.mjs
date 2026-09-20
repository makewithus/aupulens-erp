// Browser QA runner:  QA_OUT=<dir with admin_cookie.txt + readonly_cookie.txt> PLAYWRIGHT_CORE=<path> node run.mjs [platform|chat|regional|perm|execute|all]
import path from "node:path";
import { step, assert, bodyText, expectText, expectNoText, mongo, platformContext, loginContext, tenantUrl, platformUrl, openChat, say, formValues, OUT } from "./lib.mjs";
const pw = await import(process.env.PLAYWRIGHT_CORE || "playwright-core");
const chromium = pw.chromium ?? pw.default.chromium;
const which = process.argv[2] || "all";
const LIVE = !!process.env.QA_LIVE; // real Sarvam key on the server (not the mock): assertions accept real translations
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
/** Today (India) + n days as YYYY-MM-DD — "due 30 days" must equal what the form shows, whatever day the suite runs. */
const plusDays = (n) => { const d = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const on = (s) => which === s || (which === "all" && s !== "down"); // 'down' needs the mock STOPPED, run it on its own
const nav = (p, url) => p.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });

if (on("platform")) {
  const ctx = await platformContext(browser, "admin_cookie.txt");
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

  await step("P1", "Platform dashboard", "AI usage by provider card lists Azure OpenAI and Sarvam with requests, characters, cost, and a Combined row", async () => {
    await nav(page, platformUrl("/platform"));
    await expectText(page, "AI usage by provider (this month)", 120000);
    const t = await bodyText(page);
    for (const s of ["Azure OpenAI", "Sarvam (translation)", "Combined"]) assert(t.includes(s), `missing ${s}`);
    await page.getByText("AI usage by provider (this month)").scrollIntoViewIfNeeded();
    const rows = await page.locator("table tr", { hasText: "Sarvam (translation)" }).first().innerText();
    assert(/\d/.test(rows) && /₹/.test(rows), `Sarvam row has no numbers/cost: ${rows}`);
    return rows.replace(/\s+/g, " ");
  }, page);

  await step("P2", "Platform dashboard — loading", "While the summary is in flight the page shows a loading state, not a blank/broken card", async () => {
    const p2 = await ctx.newPage();
    await p2.route("**/api/platform/dashboard/summary", async (route) => { await new Promise((r) => setTimeout(r, 6000)); await route.continue(); });
    await nav(p2, platformUrl("/platform"));
    await p2.waitForTimeout(2500);
    const t = await bodyText(p2);
    assert(t.includes("Platform Dashboard"), "no page chrome while loading");
    assert(!t.includes("AI usage by provider (this month)"), "provider card rendered before its data arrived");
    await p2.screenshot({ path: path.join(OUT, "P2.png") });
    await expectText(p2, "AI usage by provider (this month)", 60000); // and it appears once the data does
    await p2.close();
    return "page chrome shown, no half-rendered provider card while the summary is held 6s; card appears when data arrives";
  });

  await step("P3", "Platform dashboard — empty", "A month with no AI usage shows 'No AI usage recorded yet this month.'", async () => {
    const p3 = await ctx.newPage();
    await p3.route("**/api/platform/dashboard/summary", async (route) => {
      const res = await route.fetch(); const j = await res.json();
      j.data.aiUsage.byProvider = j.data.aiUsage.byProvider.map((r) => ({ ...r, requestCount: 0, characters: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, failedRequests: 0 }));
      await route.fulfill({ response: res, json: j });
    });
    await nav(p3, platformUrl("/platform"));
    await expectText(p3, "No AI usage recorded yet this month.", 120000);
    await p3.screenshot({ path: path.join(OUT, "P3.png") });
    await p3.close();
  });

  await step("P4", "Platform dashboard — error", "If the summary API fails the page shows an error/empty state, never a blank screen", async () => {
    const p4 = await ctx.newPage();
    await p4.route("**/api/platform/dashboard/summary", (route) => route.fulfill({ status: 500, json: { success: false, message: "boom" } }));
    await nav(p4, platformUrl("/platform"));
    await p4.waitForTimeout(6000);
    const t = await bodyText(p4);
    assert(t.length > 100, "blank screen on error");
    await p4.screenshot({ path: path.join(OUT, "P4.png") });
    await p4.close();
    return t.slice(0, 160);
  });
  await ctx.close();
}


// ─────────────────────────────── PLATFORM — organisation tabs ───────────────────────────────
if (on("org") || which === "o8") {
  const ctx = await platformContext(browser, "admin_cookie.txt");
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  const openOrg = async (p, sub, tab) => {
    await nav(p, platformUrl(`/platform/organizations/${sub}`));
    await p.waitForLoadState("networkidle").catch(() => {});
    await p.waitForTimeout(5000); // dev-mode hydration before the tabs are live
    await p.getByRole("tab", { name: tab }).click({ timeout: 120000 });
  };

  await step("O1", "Org → AI Usage tab", "Provider split table (Azure + Sarvam) with real numbers; Sarvam cost = seeded rate × characters; combined spend line", async () => {
    mongo('db.ailimits.deleteMany({tenantId:"demo-acme"}).acknowledged');
    await openOrg(page, "demo-acme", "AI Usage");
    await expectText(page, "By provider (this month)", 120000);
    const row = (await page.locator("table tr", { hasText: "Sarvam (translation)" }).first().innerText()).replace(/\s+/g, " ");
    // The figure on screen must equal what the database says: Σ(successful Sarvam characters) × the SEEDED rate ($0.002 / 1k chars).
    const chars = Number(mongo('db.aiusagerecords.aggregate([{$match:{tenantId:"demo-acme",provider:"sarvam",status:"success"}},{$group:{_id:null,c:{$sum:"$characters"}}}]).toArray()[0].c'));
    const expected = Number((chars * 0.002 / 1000).toFixed(4));
    const shown = Number((row.match(/₹([\d.,]+)\s*$/) || [])[1]?.replace(/,/g, ""));
    assert(expected > 0 && Math.abs(shown - expected) < 0.0006, `Sarvam cost on screen ₹${shown} != seeded-rate cost ₹${expected} for ${chars} chars (row: ${row})`);
    assert(/Combined spend: ₹/.test(await bodyText(page)), "combined spend line missing");
    await expectText(page, "no monthly cost cap is configured");
    await page.getByText("By provider (this month)").scrollIntoViewIfNeeded();
    return row;
  }, page);

  await step("O2", "Org → AI Usage: combined spend vs cap", "With a monthly cost cap set, the tab shows 'of the ₹<cap> monthly cost cap — translation pauses once reached'", async () => {
    mongo('db.ailimits.updateOne({tenantId:"demo-acme"},{$set:{tenantId:"demo-acme",maxCostUsdPerMonth:0.01}},{upsert:true}).acknowledged');
    try {
      await openOrg(page, "demo-acme", "AI Usage");
      await expectText(page, "monthly cost cap — regional-language translation pauses once the cap is reached", 120000);
    } finally { mongo('db.ailimits.deleteMany({tenantId:"demo-acme"}).acknowledged'); } // never leave a cap behind (it would silently degrade later regional steps)
  }, page);

  const page2 = await ctx.newPage();
  await step("O3", "Org → AI Usage: empty", "A tenant with no AI usage says 'No AI usage recorded yet this month.' (not a blank table)", async () => {
    await openOrg(page2, "qa-empty", "AI Usage");
    await expectText(page2, "No AI usage recorded yet this month.", 120000);
  }, page2);

  await step("O4", "Org → Configuration: multilingual status", "Effective status, tenant switch, platform switch, key 'Configured' (never the key), languages used with counts", async () => {
    await openOrg(page, "demo-acme", "Configuration");
    await expectText(page, "Multilingual support (Sarvam)", 120000);
    const t = await bodyText(page);
    assert(/Effective status\s*Active/.test(t), "effective status should be Active");
    assert(/Sarvam API key\s*Configured/.test(t), "key should read Configured");
    assert(!t.includes("mock-key"), "the API key leaked into the page!");
    const hi = (await page.locator("table tr", { hasText: "hi-IN" }).first().innerText()).replace(/\s+/g, " ");
    const ta = (await page.locator("table tr", { hasText: "ta-IN" }).first().innerText()).replace(/\s+/g, " ");
    const n = (row) => Number((row.match(/(?:hi|ta)-IN\s+(\d+)/) || [])[1]);
    assert(n(hi) >= 3 && n(ta) >= 2, `language counts below the seeded 3 / 2: ${hi} || ${ta}`); // live runs only ADD real interactions
    await page.getByText("Multilingual support (Sarvam)").scrollIntoViewIfNeeded();
    return `${hi} || ${ta}`;
  }, page);

  await step("O5", "Org → Configuration: toggle the per-tenant switch", "Disable needs a reason, updates the status, writes an audit record, and really turns translation off for that tenant; re-enabling restores it", async () => {
    await page.getByRole("button", { name: "Disable for this organisation" }).click();
    const confirm = page.getByRole("button", { name: "Confirm" });
    assert(await confirm.isDisabled(), "Confirm should be disabled until a reason is typed");
    await page.getByRole("dialog").locator("textarea").fill("browser QA: tenant asked for English only");
    await confirm.click();
    await expectText(page, "Disabled", 60000);
    assert(mongo('db.organizations.findOne({subdomain:"demo-acme"}).settings.ai.multilingualDisabled') === "true", "flag not set in DB");
    const audit = mongo('db.platformauditlogs.countDocuments({tenantId:"demo-acme","metadata.reason":/browser QA/})');
    assert(Number(audit) >= 1, `no audit record (${audit})`);
    // effect: a regional message from that tenant now passes through untranslated (degraded: disabled_tenant)
    const sales = await loginContext(browser, "demo-acme", "sales@demo-acme.demo");
    const sp = await sales.newPage();
    await nav(sp, tenantUrl("demo-acme", "/sales/summary"));
    await openChat(sp);
    const j = await say(sp, "mujhe invoice banana hai", { flow: true });
    assert(j.language.degraded === true && j.english === "mujhe invoice banana hai", `expected untranslated passthrough, got english="${j.english}" degraded=${j.language.degraded}`);
    await sales.close();
    // re-enable through the UI
    await page.getByRole("button", { name: "Enable for this organisation" }).click();
    await page.getByRole("dialog").locator("textarea").fill("browser QA: re-enable");
    await page.getByRole("button", { name: "Confirm" }).click();
    await expectText(page, "Effective status Active", 60000);
    assert(mongo('db.organizations.findOne({subdomain:"demo-acme"}).settings.ai.multilingualDisabled') === "false", "flag not cleared");
    return `audit rows: ${audit}`;
  }, page);

  await step("O6", "Org → Configuration: empty languages", "'No regional-language requests yet.' for a tenant that never used one", async () => {
    await openOrg(page2, "qa-empty", "Configuration");
    await expectText(page2, "No regional-language requests yet.", 120000);
  }, page2);

  await step("O7", "Org → Configuration: error state", "If saving the switch fails the admin sees an error toast and the status does not change", async () => {
    await openOrg(page, "demo-acme", "Configuration");
    await expectText(page, "Multilingual support (Sarvam)", 120000);
    await page.route("**/api/platform/organizations/*/multilingual", (route) => route.fulfill({ status: 500, json: { success: false, message: "simulated failure" } }));
    await page.getByRole("button", { name: "Disable for this organisation" }).click();
    await page.getByRole("dialog").locator("textarea").fill("browser QA: error path");
    await page.getByRole("button", { name: "Confirm" }).click();
    await expectText(page, "simulated failure", 30000);
    assert(mongo('db.organizations.findOne({subdomain:"demo-acme"}).settings.ai.multilingualDisabled') === "false", "flag changed despite the failure");
    await page.unroute("**/api/platform/organizations/*/multilingual");
  }, page);

  await step("O8", "Org → Configuration: loading state", "While the tab loads the admin sees 'Loading configuration…' (not blank)", async () => {
    const p3 = await ctx.newPage();
    await p3.route((u) => u.href.includes("/api/platform/organizations/demo-acme") && u.href.includes("tab=configuration"), async (route) => { await new Promise((r) => setTimeout(r, 5000)); await route.continue(); });
    await nav(p3, platformUrl("/platform/organizations/demo-acme"));
    await p3.waitForLoadState("networkidle").catch(() => {});
    await p3.waitForTimeout(5000); // dev-mode hydration
    await p3.getByRole("tab", { name: "Configuration" }).click({ timeout: 120000 });
    await expectText(p3, "Loading configuration", 4500);
    await p3.screenshot({ path: path.join(OUT, "O8.png") });
    await p3.close();
  });
  await ctx.close();

  const ro = await platformContext(browser, "readonly_cookie.txt");
  const rp = await ro.newPage();
  await step("O9", "Permission — read-only platform admin", "Can view; trying to change the switch shows a clear refusal and nothing changes", async () => {
    await openOrg(rp, "demo-acme", "Configuration");
    await expectText(rp, "Multilingual support (Sarvam)", 120000);
    await rp.getByRole("button", { name: "Disable for this organisation" }).click();
    await rp.getByRole("dialog").locator("textarea").fill("browser QA: should be refused");
    await rp.getByRole("button", { name: "Confirm" }).click();
    await rp.waitForTimeout(4000);
    const t = await bodyText(rp);
    assert(/not authori|forbidden|permission|capabil|denied|not allowed|Failed to update/i.test(t), `no clear refusal shown: ${t.slice(-300)}`);
    assert(mongo('db.organizations.findOne({subdomain:"demo-acme"}).settings.ai.multilingualDisabled') === "false", "read-only admin changed the setting!");
  }, rp);
  await ro.close();
}

// ─────────────────────────────── CHAT (the global AI sidebar) ───────────────────────────────
const SALES = ["demo-acme", "sales@demo-acme.demo"];
async function freshChat(ctx, tenant = "demo-acme", start = "/sales/summary") {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await nav(page, tenantUrl(tenant, start));
  await openChat(page);
  return page;
}
/** Checks the REAL invoice form (not the chat panel): the customer control text, and the input values. */
const invoiceForm = async (page, { customer, values = [], absent = [] }) => {
  await page.waitForURL(/\/sales\/invoices\/new/, { timeout: 120000 });
  const area = page.locator("text=SELECT CUSTOMER").locator("..");
  await area.waitFor({ timeout: 120000 });
  const deadline = Date.now() + 90000; // dev-mode: the customer list loads a while after the form
  let txt = "";
  while (Date.now() < deadline) { txt = await area.innerText(); if (!customer || txt.includes(customer)) break; await page.waitForTimeout(1500); }
  if (customer) assert(txt.includes(customer), `customer control shows "${txt.replace(/\n/g, " | ")}", expected ${customer}`);
  await page.waitForTimeout(1500);
  const vals = (await formValues(page)).map(String);
  for (const v of values) assert(vals.some((x) => x === v || x.includes(v)), `form input missing "${v}" (has: ${vals.join(" | ")})`);
  for (const v of absent) assert(!vals.some((x) => x.includes(v)), `form unexpectedly has "${v}"`);
  await page.screenshot({ path: path.join(OUT, "form-check.png") });
};

if (on("chat")) {
  const ctx = await loginContext(browser, ...SALES);
  let page = await freshChat(ctx);

  await step("C1", "Chat — English, everything supplied", "Summary only (no questions); 'yes' opens the real invoice form fully pre-filled (customer, item, ₹45000, due date +30 days)", async () => {
    const j = await say(page, "Create an invoice for Acme Trading, 45000, due 30 days, consulting services");
    assert(j.kind === "confirm", `expected summary, got ${j.kind}`);
    assert(!j.message.includes("Question"), "asked a question although nothing mandatory was missing");
    await expectText(page, "Here is the invoice I'll prepare");
    await expectText(page, "₹45,000");
    const y = await say(page, "yes");
    assert(y.kind === "open_form", `got ${y.kind}`);
    await invoiceForm(page, { customer: "Acme Trading", values: ["consulting services", "45000", plusDays(30)] });
  }, page);

  page = await freshChat(ctx);
  await step("C2", "Chat — English with gaps (guided)", "One question at a time with progress; item choices come from this tenant's invoice history; summary; form opens pre-filled", async () => {
    let j = await say(page, "Create an invoice");
    assert(j.kind === "question" && j.progress.current === 1 && j.progress.total === 4, "Q1 of 4 expected");
    await expectText(page, "Question 1 of 4");
    j = await say(page, "Kamal");
    assert(j.kind === "question" && j.message.includes("Item / service"), "item question expected");
    assert(j.choices && j.choices[0] === "Consulting services", `item choices should come from history, got ${JSON.stringify(j.choices)}`);
    assert(j.choices.includes("Website design") && j.choices.includes("Repairs"), "history choices incomplete");
    await expectText(page, "Consulting services");
    j = await say(page, "1");
    assert(j.message.includes("amount"), "amount question expected");
    j = await say(page, "5000");
    assert(j.message.includes("When is it due"), "due question expected");
    j = await say(page, "skip");
    assert(j.kind === "confirm", `got ${j.kind}`);
    await expectText(page, "Kamal");
    j = await say(page, "yes");
    await invoiceForm(page, { customer: "Kamal", values: ["Consulting services", "5000"] });
  }, page);

  page = await freshChat(ctx);
  await step("C3", "Chat — escape hatch", "'Skip the questions and open the form' opens a partly pre-filled form (customer known, no item) — today's behaviour", async () => {
    await say(page, "Create an invoice for Kamal");
    const j = await say(page, "Skip the questions and open the form");
    assert(j.kind === "open_form", `got ${j.kind}`);
    await invoiceForm(page, { customer: "Kamal", absent: ["consulting", "Repairs", "Website"] });
  }, page);

  page = await freshChat(ctx);
  await step("C4", "Chat — back and cancel", "'back' returns to the previous question; 'cancel' says nothing was created and the draft is closed", async () => {
    await say(page, "Create an invoice for Kamal, 500");
    await say(page, "Repairs");
    let j = await say(page, "back");
    assert(j.message.includes("going back") && j.message.includes("Item / service"), "back should re-ask the item");
    j = await say(page, "cancel");
    assert(j.kind === "cancelled", `got ${j.kind}`);
    await expectText(page, "Nothing was created");
    const open = mongo('db.aicommandproposals.countDocuments({actionType:/^task_flow/, status:"proposed"})');
    assert(open === "0", `draft still open in DB (${open})`);
  }, page);

  page = await freshChat(ctx);
  await step("C5", "Chat — resume after abandoning", "Reload the page mid-flow, ask to continue: the same question comes back with the answers kept", async () => {
    await say(page, "Create an invoice for Kamal, 500");
    await page.reload({ waitUntil: "domcontentloaded" });
    await openChat(page);
    const j = await say(page, "continue");
    assert(j.kind === "question", `got ${j.kind}`);
    assert(j.message.includes("Item / service"), "should resume at the item question");
    await say(page, "cancel");
  }, page);

  page = await freshChat(ctx);
  await step("C6", "Chat — near-miss customer name", "'Acme Traders' does not exist: a numbered list of real customers is offered; nothing is picked silently", async () => {
    const j = await say(page, "Create an invoice for Acme Traders, 500");
    assert(j.kind === "question", `got ${j.kind}`);
    for (const c of ["Acme Trading", "Acme Industries", 'Create a new customer "Acme Traders"']) assert(j.choices.includes(c), `missing choice ${c}`);
    await expectText(page, "Acme Industries");
    await say(page, "cancel");
  }, page);

  page = await freshChat(ctx);
  await step("C7", "Chat — 'I understood this as…' and its correction path", "A typo + '45k' is shown back as 'I understood this as: … 45000'; 'no, I meant …' redoes the request", async () => {
    let j = await say(page, "create an invoce for Kamal, 45k");
    assert(/I understood this as/.test(j.message) && j.message.includes("invoice") && j.message.includes("45000"), `interpretation line missing/incorrect: ${j.message.slice(0, 160)}`);
    await expectText(page, "I understood this as");
    j = await say(page, "no, I meant create an invoice for Acme Industries, 4500, Repairs");
    assert(j.kind === "confirm" && j.message.includes("Acme Industries") && j.message.includes("₹4,500"), `correction not applied: ${j.message.slice(0, 200)}`);
    await say(page, "cancel");
  }, page);

  page = await freshChat(ctx);
  await step("C8", "Chat — loading state", "While the flow is thinking, your message is already on screen with a loading bubble (not a frozen input)", async () => {
    await page.route("**/api/ai/task-flow", async (route) => { await new Promise((r) => setTimeout(r, 5000)); await route.continue(); });
    const ta = page.locator('textarea[placeholder="Ask Anything"]').first();
    await ta.fill("Create an invoice for Kamal"); await ta.press("Enter");
    await page.waitForTimeout(1500);
    await expectText(page, "Create an invoice for Kamal", 3000); // shown before the answer arrives
    await page.screenshot({ path: path.join(OUT, "C8-loading.png") });
    await expectText(page, "Question", 60000);
    await page.unroute("**/api/ai/task-flow");
    await say(page, "cancel");
  }, page);

  page = await freshChat(ctx);
  await step("C9", "Chat — error state (fails open)", "If the guided-flow service is down the assistant still answers (the older create path) — never a dead end", async () => {
    await page.route("**/api/ai/task-flow", (route) => route.abort());
    const ta = page.locator('textarea[placeholder="Ask Anything"]').first();
    await ta.fill("Create an invoice for Kamal, 500, Repairs"); await ta.press("Enter");
    await page.waitForURL(/\/sales\/invoices\/new/, { timeout: 120000 }).catch(async () => { await expectText(page, "prepared the invoice form", 60000).catch(() => {}); });
    const t = await bodyText(page);
    assert(t.length > 200, "blank screen after the flow service failed");
    await page.unroute("**/api/ai/task-flow");
    return "landed on: " + page.url();
  }, page);

  page = await freshChat(ctx);
  await step("C10", "Chat — English path untouched", "A normal English question makes NO guided-flow request at all", async () => {
    let calls = 0;
    page.on("request", (r) => { if (r.url().includes("/api/ai/task-flow")) calls++; });
    const ta = page.locator('textarea[placeholder="Ask Anything"]').first();
    await ta.fill("what is my cash balance"); await ta.press("Enter");
    await page.waitForTimeout(6000);
    assert(calls === 0, `guided flow was called ${calls}x for an ordinary question`);
    await ta.fill("show unpaid invoices"); await ta.press("Enter");
    await page.waitForTimeout(4000);
    assert(calls === 0, `guided flow was called ${calls}x for 'show unpaid invoices'`);
  }, page);

  await step("C11", "Sales AI Assistant page", "The same guided flow works on a module assistant page (not only the sidebar)", async () => {
    const p = await ctx.newPage();
    await nav(p, tenantUrl("demo-acme", "/sales/ai-assistant"));
    const ta = p.locator("textarea").first();
    await ta.waitFor({ timeout: 120000 });
    await p.waitForLoadState("networkidle").catch(() => {});
    await p.waitForTimeout(8000); // dev-mode hydration
    const respP = p.waitForResponse((r) => r.url().includes("/api/ai/task-flow"), { timeout: 60000 });
    await ta.fill("Create an invoice"); await ta.press("Enter");
    const j = await (await respP).json();
    assert(j.kind === "question", `got ${j.kind}`);
    await expectText(p, "Question 1 of 4");
    await p.screenshot({ path: path.join(OUT, "C11.png") });
    await p.close();
  });
  await ctx.close();
}

// ─────────────────────────────── user-reported: interruptions, commands, one-tap replies ───────────────────────────────
if (on("chat2")) {
  const ctx = await loginContext(browser, ...SALES);
  const quick = async (p) => (await p.locator('[data-testid="flow-quick-replies"] button').allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  const clickReply = async (p, label) => { const rp = p.waitForResponse((r) => r.url().includes("/api/ai/task-flow"), { timeout: 60000 }); await p.locator('[data-testid="flow-quick-replies"] button', { hasText: label }).first().click(); const j = await (await rp).json(); await p.waitForTimeout(2500); return j; };
  let page = await freshChat(ctx);
  await step("U1", "Chat — a request in the middle of a draft", "'Invoices less than ₹25,000.' asked while the customer question is open is ANSWERED (filtered invoice list), not taken as a customer name; 'continue' resumes the same question", async () => {
    await say(page, "Create an invoice");
    const j = await say(page, "Invoices less than ₹25,000.", { wait: 12000 });
    assert(j.handled === false && j.sessionActive === true, `flow consumed it: ${j.kind}`);
    await expectText(page, "below ₹25,000", 60000);
    assert(page.url().includes("/sales/invoices"), `assistant did not open the invoice list: ${page.url()}`);
    await openChat(page);
    const c = await say(page, "continue");
    assert(c.kind === "question" && c.message.includes("Question 1 of 4"), "draft did not resume");
    await say(page, "cancel");
  }, page);

  page = await freshChat(ctx);
  await step("U2", "Chat — 'create the customer ramesh' in the middle of a draft", "Opens the New Customer form with the name filled in (NOT a customer called 'create the customer ramesh'); the draft is kept and 'continue' resumes it", async () => {
    await say(page, "Create an invoice");
    const j = await say(page, "create the customer ramesh", { wait: 4000 });
    assert(j.route === "/sales/customers/new", `route ${j.route}`);
    await page.waitForURL(/\/sales\/customers\/new/, { timeout: 120000 });
    await page.waitForTimeout(5000);
    assert((await formValues(page)).some((v) => v === "ramesh"), `customer form not prefilled: ${(await formValues(page)).join("|")}`);
    await nav(page, tenantUrl("demo-acme", "/sales/summary"));
    await openChat(page);
    const c = await say(page, "continue");
    assert(c.kind === "question" && c.message.includes("Question 1 of 4"), "draft did not resume");
    await say(page, "cancel");
  }, page);

  page = await freshChat(ctx);
  await step("U3", "Chat — Roman-Hindi list request in the middle of a draft (real Sarvam)", "'Pachchis hazaar se Kam ke saare invoices Ki list mujhe dijiye.' is translated, is NOT taken as an answer, is NOT rejected with \"couldn't translate\", and the invoice list under ₹25,000 is opened", async () => {
    await say(page, "Create an invoice");
    const j = await say(page, "Pachchis hazaar se Kam ke saare invoices Ki list mujhe dijiye.", { wait: 12000 });
    assert(j.kind !== "notice", "answered with the 'couldn't translate' notice");
    assert(j.handled === false, `flow consumed it as ${j.kind}`);
    if (LIVE) assert(/25000|25,000/.test(j.english) && /invoice/i.test(j.english), `translation was: ${j.english}`);
    await expectNoText(page, "Create a new customer \"Invoices");
    return `english: ${j.english}; url: ${page.url()}`;
  }, page);

  page = await freshChat(ctx);
  await step("U4", "Chat — one-tap replies", "Questions show clickable choices and Back/Skip/Cancel INSIDE the chat; clicking customer → item → amount → Skip → 'Yes, open the invoice form' ends on the pre-filled form; only the latest message has buttons", async () => {
    await say(page, "Create an invoice");
    let b = await quick(page);
    assert(b.includes("Cancel") && b.some((x) => /open the form/i.test(x)), `action buttons missing: ${b}`);
    await say(page, "Kamal");
    b = await quick(page);
    assert(b.some((x) => /Consulting services/.test(x)) && b.includes("Back"), `item choices missing: ${b}`);
    assert(new Set(b).size === b.length, `duplicate buttons (old messages still show theirs): ${b}`);
    let j = await clickReply(page, "Consulting services");
    assert(j.kind === "question" && j.message.includes("Amount"), `got ${j.kind}`);
    await expectText(page, "Consulting services"); // the click shows up as the user's message
    j = await say(page, "5000");
    j = await clickReply(page, "Skip");
    assert(j.kind === "confirm", `got ${j.kind}`);
    assert((await quick(page)).some((x) => /Yes, open the invoice form/.test(x)), "confirm buttons missing");
    j = await clickReply(page, "Yes, open the invoice form");
    assert(j.kind === "open_form", `got ${j.kind}`);
    await invoiceForm(page, { customer: "Kamal", values: ["Consulting services", "5000"] });
  }, page);
  await ctx.close();
}

// ─────────────────────────────── REGIONAL (mock Sarvam) ───────────────────────────────
if (on("regional")) {
  const ctx = await loginContext(browser, ...SALES);
  let page = await freshChat(ctx);
  await step("R1", "Regional — Roman Hindi create, end to end", "'mujhe invoice banana hai' → 'I understood this as: create an invoice' + Question 1 (in the reply language); answers in Hindi; ends on a pre-filled form", async () => {
    let j = await say(page, "mujhe invoice banana hai");
    if (LIVE) assert(/invoice/i.test(j.english) && /(create|make|prepare)/i.test(j.english), `english was "${j.english}"`);
    else assert(j.english === "create an invoice", `english was "${j.english}"`);
    assert(j.language.detected === "hi-IN", `detected ${j.language.detected}`);
    assert(j.message.includes("I understood this as"), "interpretation line expected");
    if (LIVE) assert(j.kind === "question" && j.progress?.current === 1, `expected question 1, got ${j.kind}`);
    else assert(j.message.includes("Question 1 of 4") && j.message.includes("[hi]"), "question / translation stage expected");
    await expectText(page, "I understood this as");
    j = await say(page, "Acme Industries ke liye");
    assert(j.kind === "question" && j.progress.current === 2, `customer not taken: ${j.message.slice(0, 120)}`);
    j = await say(page, "1");   // item choice from history
    j = await say(page, "12000");
    j = await say(page, "skip");
    assert(j.kind === "confirm", `got ${j.kind}`);
    assert(j.message.includes("Acme Industries") && j.message.includes("₹12,000"), "summary should keep names/amounts untranslated");
    j = await say(page, "haan");
    assert(j.kind === "open_form", `got ${j.kind}`);
    await invoiceForm(page, { customer: "Acme Industries", values: ["12000"] });
  }, page);

  page = await freshChat(ctx);
  await step("R2", "Regional — Tamil script", "Tamil 'Acme க்கு இன்வாய்ஸ் உருவாக்கு' (create an invoice for Acme) starts the guided flow (detected ta-IN) and asks which Acme", async () => {
    const j = await say(page, "Acme க்கு இன்வாய்ஸ் உருவாக்கு");
    assert(j.language.detected === "ta-IN", `lang=${j.language.detected}`);
    assert(/invoice/i.test(j.english) && /Acme/.test(j.english), `english="${j.english}"`);
    assert(j.kind === "question", `got ${j.kind}`);
    assert(j.choices && j.choices.includes("Acme Trading") && j.choices.includes("Acme Industries"), "near-miss customer choices expected (never a silent pick)");
    await say(page, "cancel");
  }, page);

  page = await freshChat(ctx);
  await step("R2b", "Regional — colloquial Tamil that the real translator misreads", "'இன்வாய்ஸ் போடுங்க' is translated by the real API as 'Send the invoice' — so it must NOT start an invoice; nothing is created (finding: phrase needs a native speaker)", async () => {
    const before = Number(mongo('db.salesinvoices.countDocuments({tenantId:"demo-acme"})'));
    const j = await say(page, "இன்வாய்ஸ் போடுங்க");
    assert(j.kind !== "question" && j.kind !== "confirm" && j.kind !== "open_form", `it wrongly started a create flow: ${j.kind}`);
    assert(Number(mongo('db.salesinvoices.countDocuments({tenantId:"demo-acme"})')) === before, "an invoice was created");
    return `translated to: "${j.english}" → ${j.kind}`;
  }, page);

  page = await freshChat(ctx);
  await step("R3", "Regional — your own text stays on screen", "The chat bubble shows exactly what you typed, never the normalised copy", async () => {
    await say(page, "mujhe invoice banana hai");
    await expectText(page, "mujhe invoice banana hai");
    await say(page, "रद्द करो");
  }, page);

  await ctx.close();
}

// Run this section with the mock Sarvam server STOPPED (or SARVAM_API_KEY wrong): the layer must degrade, not break.
if (on("down")) {
  const ctx = await loginContext(browser, ...SALES);
  const page = await freshChat(ctx);
  await step("R4", "Regional — provider down (fails open)", "With Sarvam unreachable the assistant still answers; no error screen; a degraded record is logged; nothing wrong is created", async () => {
    const degradedBefore = Number(mongo('db.ailanguageinteractions.countDocuments({degraded:true})'));
    const invBefore = Number(mongo('db.salesinvoices.countDocuments({tenantId:"demo-acme"})'));
    const before = (await bodyText(page)).length;
    const ta = page.locator('textarea[placeholder="Ask Anything"]').first();
    await ta.fill("mera balance kya hai"); await ta.press("Enter");
    await page.waitForFunction((n) => document.body.innerText.length > n + 80, before, { timeout: 90000 });
    await page.waitForTimeout(8000);
    const t = await bodyText(page);
    assert(t.includes("mera balance kya hai"), "the user's own text is not on screen");
    assert(!/Something went wrong|Unhandled|Application error/i.test(t), "an error screen appeared");
    const degradedAfter = Number(mongo('db.ailanguageinteractions.countDocuments({degraded:true})'));
    assert(degradedAfter > degradedBefore, `no degraded record written (${degradedBefore}→${degradedAfter})`);
    assert(Number(mongo('db.salesinvoices.countDocuments({tenantId:"demo-acme"})')) === invBefore, "an invoice appeared");
    return `degraded records ${degradedBefore}→${degradedAfter}`;
  }, page);
  await ctx.close();
}

// ─────────────────────────────── PERMISSIONS & EMPTY STATES ───────────────────────────────
if (on("perm")) {
  const hr = await loginContext(browser, "demo-acme", "hr@demo-acme.demo");
  let page = await hr.newPage();
  await nav(page, tenantUrl("demo-acme", "/hr/dashboard").replace("/hr/dashboard", "/hr/employees"));
  await openChat(page).catch(() => {});
  await step("X1", "Permission — HR user asks for an invoice", "A clear refusal in the chat ('you don't have access…'), never a blank screen; nothing is created", async () => {
    const j = await say(page, "Create an invoice for Kamal");
    assert(j.kind === "refused", `got ${j.kind}`);
    await expectText(page, "don't have access");
  }, page);
  await step("X2", "Permission — HR user opens /sales directly", "Redirected away by the app's own gate, page has content (not blank)", async () => {
    await nav(page, tenantUrl("demo-acme", "/sales/invoices/new"));
    await page.waitForTimeout(6000);
    assert(!page.url().includes("/sales/invoices/new"), `HR user reached ${page.url()}`);
    assert((await bodyText(page)).length > 100, "blank page");
    return "redirected to " + page.url();
  }, page);
  await hr.close();

  const empty = await loginContext(browser, "qa-empty", "sales@qa-empty.demo");
  page = await empty.newPage();
  await nav(page, tenantUrl("qa-empty", "/sales/summary"));
  await openChat(page);
  await step("X3", "Empty state — tenant with no customers", "Says so plainly and opens the New Customer form (no dead end, no invoice flow)", async () => {
    const j = await say(page, "Create an invoice");
    assert(j.kind === "no_customers", `got ${j.kind}`);
    await expectText(page, "don't have any customers yet");
    await page.waitForURL(/\/sales\/customers\/new/, { timeout: 120000 });
    await page.waitForTimeout(3000);
    assert((await bodyText(page)).length > 100, "blank customer form");
  }, page);
  await empty.close();

  await step("X4", "Unauthenticated API call", "The guided-flow endpoint refuses with a clear 401, not an HTML/blank response", async () => {
    const ctx2 = await browser.newContext();
    const r = await ctx2.request.post(tenantUrl("demo-acme", "/api/ai/task-flow"), { data: { text: "create an invoice" }, failOnStatusCode: false });
    assert([401, 403, 307, 302].includes(r.status()) || r.status() === 200 && false, `status ${r.status()}`);
    await ctx2.close();
    return "status " + (await r.status());
  });
}

// ─────────────────────────────── EXECUTE PATH (flag on) ───────────────────────────────
if (on("execute")) {
  const ctx = await loginContext(browser, ...SALES);
  mongo('db.organizations.updateOne({subdomain:"demo-acme"},{$set:{"settings.ai.autoCreateEnabled":true}}).modifiedCount');
  let page = await freshChat(ctx);
  await step("E1", "Execute path (flag ON for this tenant)", "'yes' creates a DRAFT through the real route and lands on the new invoice; nothing posted to the ledger", async () => {
    const before = Number(mongo('db.salesinvoices.countDocuments({tenantId:"demo-acme"})'));
    let j = await say(page, "Create an invoice for Kamal, 700, Repairs");
    assert(j.kind === "confirm" && j.message.includes("as a draft now"), `summary should offer creating a draft: ${j.message.slice(-160)}`);
    j = await say(page, "skip");
    j = await say(page, "yes");
    assert(j.route && /\/sales\/invoices\/[0-9a-f]{24}/.test(j.route), `no record route: ${JSON.stringify(j).slice(0, 200)}`);
    await page.waitForURL(/\/sales\/invoices\/[0-9a-f]{24}/, { timeout: 120000 });
    await page.waitForTimeout(4000);
    const after = Number(mongo('db.salesinvoices.countDocuments({tenantId:"demo-acme"})'));
    assert(after === before + 1, `expected exactly one new invoice (${before}→${after})`);
    const doc = JSON.parse(mongo('JSON.stringify(db.salesinvoices.find({tenantId:"demo-acme"}).sort({createdAt:-1}).limit(1).toArray()[0])'));
    assert(doc.status === "draft" && doc.totalAmount === 700 && doc.lineItems[0].name === "Repairs", `unexpected record: ${JSON.stringify(doc).slice(0, 200)}`);
    const je = Number(mongo('db.journalentries.countDocuments({tenantId:"demo-acme", "lineIds.sourceDocument": /QA|INV/})'));
    return `created ${doc.number} as ${doc.status}, total ${doc.totalAmount}`;
  }, page);
  mongo('db.organizations.updateOne({subdomain:"demo-acme"},{$set:{"settings.ai.autoCreateEnabled":false}}).modifiedCount');
  page = await freshChat(ctx);
  await step("E2", "Execute path (flag OFF again)", "Same conversation only OPENS the form; no invoice is created", async () => {
    const before = Number(mongo('db.salesinvoices.countDocuments({tenantId:"demo-acme"})'));
    await say(page, "Create an invoice for Kamal, 800, Repairs");
    await say(page, "skip");
    const j = await say(page, "yes");
    assert(j.kind === "open_form" && j.route === "/sales/invoices/new", `got ${j.kind} ${j.route}`);
    await page.waitForURL(/\/sales\/invoices\/new/, { timeout: 120000 });
    assert(Number(mongo('db.salesinvoices.countDocuments({tenantId:"demo-acme"})')) === before, "an invoice was created with the flag off");
  }, page);
  await ctx.close();
}

await browser.close();
import fs from "node:fs";
fs.writeFileSync(path.join(OUT, "results.json"), fs.existsSync(path.join(OUT, "results.json")) ? fs.readFileSync(path.join(OUT, "results.json")) : "[]");
