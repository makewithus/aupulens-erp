/* eslint-disable no-console */
const { MongoClient, ObjectId } = require("mongodb");
const bcrypt = require("bcryptjs");
const { spawn } = require("node:child_process");
const fs = require("node:fs");

const BASE_URL = process.env.ACCEPTANCE_BASE_URL || "http://demo-acme.localhost:3000";
const ROOT_URL = process.env.ACCEPTANCE_ROOT_URL || "http://localhost:3000";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27018/aupulens_browser_qa";
const PASSWORD = "BrowserQaPassword123!";
const EMAIL = "owner@demo-acme.demo";
const TENANT = "demo-acme";
const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const CDP_PORT = Number(process.env.CDP_PORT || 9333);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function seed() {
  assert(/browser_qa/.test(MONGODB_URI), `Refusing to seed non-QA database: ${MONGODB_URI}`);
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();
  await db.dropDatabase();

  const ownerId = new ObjectId();
  const otherOwnerId = new ObjectId();
  const customerId = new ObjectId();
  const vendorId = new ObjectId();
  const otherProductId = new ObjectId();
  const now = new Date();
  const password = await bcrypt.hash(PASSWORD, 10);

  await db.collection("organizations").insertMany([
    {
      _id: new ObjectId(),
      name: "Demo Acme",
      subdomain: TENANT,
      ownerUserId: ownerId,
      isActive: true,
      subscriptionStatus: "active",
      tier: "enterprise",
      maxUsers: 50,
      aiCallsPerMonth: 5000,
      status: "active",
      organizationType: "enterprise",
      settings: {
        country: "India",
        state: "Maharashtra",
        currency: "INR",
        timezone: "Asia/Kolkata",
        isGstRegistered: true,
        gstin: "27AAAAA0000A1Z5",
        enabledModules: ["admin", "finance", "sales", "inventory", "crm"],
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: new ObjectId(),
      name: "Tenant B",
      subdomain: "tenant-b",
      ownerUserId: otherOwnerId,
      isActive: true,
      subscriptionStatus: "active",
      tier: "enterprise",
      maxUsers: 50,
      aiCallsPerMonth: 5000,
      status: "active",
      organizationType: "enterprise",
      settings: { country: "India", enabledModules: ["admin", "finance", "sales", "inventory"] },
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.collection("users").insertMany([
    { _id: ownerId, tenantId: TENANT, name: "Browser QA Owner", email: EMAIL, phone: "9999999999", password, role: "admin", status: "active", permissions: [], createdAt: now, updatedAt: now },
    { _id: otherOwnerId, tenantId: "tenant-b", name: "Tenant B Owner", email: "owner@tenant-b.demo", phone: "9999999999", password, role: "admin", status: "active", permissions: [], createdAt: now, updatedAt: now },
  ]);

  await db.collection("customers").insertMany([
    { _id: customerId, tenantId: TENANT, header: { name: "Browser QA Customer", displayName: "Browser QA Customer", is_company: true }, contact_details: { email: "customer@example.test" }, createdBy: ownerId, createdAt: now, updatedAt: now },
    { _id: vendorId, tenantId: TENANT, header: { name: "Browser QA Vendor", displayName: "Browser QA Vendor", is_company: true }, contact_details: { email: "vendor@example.test" }, createdBy: ownerId, createdAt: now, updatedAt: now },
  ]);

  await db.collection("accountingsettings").insertOne({
    tenantId: TENANT,
    taxSettings: { pricesIncludeTax: false, gstin: "27AAAAA0000A1Z5", requireHsnSacOnInvoices: false },
    createdBy: ownerId,
    createdAt: now,
    updatedAt: now,
  });

  await db.collection("products").insertOne({
    _id: otherProductId,
    tenantId: "tenant-b",
    header: { name: "Tenant B Private Product", sale_ok: true, purchase_ok: true, can_be_expensed: false },
    tab_general_information: { type: "consu", invoice_policy: "order", service_upsell: false, list_price: 100, taxes_id: [], standard_price: 50, hsnSacCode: "TB01", gstRate: 5, gstTreatment: "taxable" },
    tab_sales: { upsell_cross_sell: { optional_product_ids: [] }, extra_info: { tag_ids: [] } },
    tab_prices: { pricelist_item_ids: [] },
    tab_accounting: { cost_and_revenue: {} },
    status: "published",
    createdBy: otherOwnerId,
    createdAt: now,
    updatedAt: now,
  });

  await client.close();
  return { customerId: String(customerId), vendorId: String(vendorId) };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(url, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {}
    await wait(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function openChrome() {
  const userDataDir = "/tmp/aupulens-hsn-gst-chrome";
  fs.rmSync(userDataDir, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--no-sandbox",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    `${BASE_URL}/auth/admin`,
  ], { stdio: ["ignore", "pipe", "pipe"] });

  await waitFor(`http://127.0.0.1:${CDP_PORT}/json/version`);
  const tabs = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  const page = tabs.find((tab) => tab.type === "page" && !tab.url.startsWith("chrome-extension://")) || tabs[0];
  const wsUrl = page.webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
  await send("Runtime.enable");
  await send("Page.enable");
  return { chrome, ws, send };
}

async function evalJs(send, expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const detail =
      result.exceptionDetails.exception?.description ||
      result.exceptionDetails.exception?.value ||
      result.exceptionDetails.text ||
      "Browser evaluation failed";
    throw new Error(detail);
  }
  return result.result.value;
}

async function navigate(send, url) {
  await send("Page.navigate", { url });
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    const ready = await evalJs(send, "document.readyState");
    if (ready === "complete") return;
    await wait(250);
  }
  throw new Error(`Timed out loading ${url}`);
}

async function waitForSelector(send, selector, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await evalJs(send, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    if (found) return;
    await wait(250);
  }
  const snapshot = await evalJs(send, `
    (() => ({
      href: location.href,
      title: document.title,
      body: (document.body?.innerText || "").slice(0, 1600)
    }))()
  `);
  throw new Error(`Timed out waiting for ${selector}: ${JSON.stringify(snapshot)}`);
}

async function login(send) {
  await navigate(send, `${BASE_URL}/auth/admin`);
  await waitForSelector(send, "#email");
  await wait(1000);
  await evalJs(send, `
    (() => {
      const set = (el, value) => {
        if (!el) throw new Error("Missing login input");
        const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set;
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      set(document.querySelector("#email"), ${JSON.stringify(EMAIL)});
      set(document.querySelector("#password"), ${JSON.stringify(PASSWORD)});
      const submit = document.querySelector("button[type='submit']");
      if (!submit) throw new Error("Missing login submit button");
      document.querySelector("form")?.requestSubmit?.(submit) || submit.click();
      return true;
    })()
  `);
  let start = Date.now();
  while (Date.now() - start < 15_000) {
    const href = await evalJs(send, "location.href");
    if (!href.includes("/auth")) return href;
    await wait(500);
  }

  const fallback = await evalJs(send, `
    (async () => {
      const csrfRes = await fetch("/api/auth/csrf", { credentials: "include" });
      const csrf = await csrfRes.json();
      const body = new URLSearchParams({
        csrfToken: csrf.csrfToken,
        email: ${JSON.stringify(EMAIL)},
        password: ${JSON.stringify(PASSWORD)},
        tenantId: "default",
        portal: "/auth/admin",
        redirect: "false",
        json: "true"
      });
      const res = await fetch("/api/auth/callback/credentials?redirect=false", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
      return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
    })()
  `);
  if (fallback.ok && fallback.body?.ok !== false && !fallback.body?.error) {
    await navigate(send, `${BASE_URL}/`);
    start = Date.now();
    while (Date.now() - start < 15_000) {
      const session = await evalJs(send, `fetch("/api/auth/session", { credentials: "include" }).then((res) => res.json().catch(() => null))`);
      if (session?.user?.tenantId) return await evalJs(send, "location.href");
      await wait(500);
    }
  }

  const fallbackJson = JSON.stringify(fallback);
  const snapshot = await evalJs(send, `
    fetch("/api/auth/session", { credentials: "include" })
      .then(async (res) => ({
        href: location.href,
        title: document.title,
        body: (document.body?.innerText || "").slice(0, 1600),
        sessionStatus: res.status,
        session: await res.json().catch(() => null),
        fallback: ${fallbackJson}
      }))
  `);
  throw new Error(`Login did not leave auth page: ${JSON.stringify(snapshot)}`);
}

async function browserFetch(send, path, options = {}) {
  const payload = JSON.stringify(options);
  return evalJs(send, `
    fetch(${JSON.stringify(path)}, Object.assign({ credentials: "include", headers: { "Content-Type": "application/json" } }, ${payload}))
      .then(async (res) => ({ ok: res.ok, status: res.status, body: await res.json().catch(() => null) }))
  `);
}

async function main() {
  const ids = await seed();
  await waitFor(ROOT_URL);
  const { chrome, ws, send } = await openChrome();
  const created = {};
  const results = [];
  const pass = (name) => results.push({ name, ok: true });

  try {
    const loginUrl = await login(send);
    assert(loginUrl.includes("/admin") || loginUrl.includes("/sales") || loginUrl.includes("/finance"), `Unexpected post-login URL: ${loginUrl}`);
    pass("login");

    const productPayload = ({
      name,
      type = "consu",
      listPrice,
      cost = 0,
      hsnSacCode = "",
      gstRate,
      gstTreatment = "taxable",
      defaultCode,
      description = name,
      hsnSacUserConfirmed = true,
    }) => ({
      header: { name, sale_ok: true, purchase_ok: true, can_be_expensed: false },
      tab_general_information: {
        type,
        invoice_policy: "order",
        service_upsell: false,
        list_price: listPrice,
        taxes_id: [],
        standard_price: cost,
        default_code: defaultCode,
        description,
        hsnSacCode,
        gstRate,
        gstTreatment,
        hsnSacUserConfirmed,
        taxReference: { sourceId: "browser-qa", effectiveDate: "2026-04-01", description: "Browser QA reference" },
      },
      tab_sales: { upsell_cross_sell: { optional_product_ids: [] }, extra_info: { tag_ids: [] } },
      tab_prices: { pricelist_item_ids: [] },
      tab_accounting: { cost_and_revenue: {} },
      status: "published",
    });

    let res = await browserFetch(send, "/api/sales/products", { method: "POST", body: JSON.stringify(productPayload({
      name: "Dell 27-inch 4K Monitor",
      type: "consu",
      listPrice: 25000,
      cost: 18000,
      hsnSacCode: "85285200",
      gstRate: 18,
      gstTreatment: "taxable",
      defaultCode: "MON-DELL-27",
    })) });
    assert(res.ok, `Dell monitor product failed ${res.status}: ${JSON.stringify(res.body)}`);
    created.monitor = res.body.product;
    assert(created.monitor.tab_general_information.hsnSacCode === "85285200", "Dell monitor HSN did not persist");
    assert(created.monitor.tab_general_information.gstRate === 18, "Dell monitor GST rate did not persist");
    pass("Scenario A manual goods product");

    res = await browserFetch(send, "/api/sales/products", { method: "POST", body: JSON.stringify(productPayload({
      name: "Professional Bookkeeping Services",
      type: "service",
      listPrice: 10000,
      cost: 0,
      hsnSacCode: "998222",
      gstRate: 18,
      gstTreatment: "taxable",
      defaultCode: "SRV-BKKP-01",
    })) });
    assert(res.ok, `bookkeeping service product failed ${res.status}: ${JSON.stringify(res.body)}`);
    created.bookkeeping = res.body.product;
    assert(created.bookkeeping.tab_general_information.hsnSacCode === "998222", "Bookkeeping SAC did not persist");
    pass("Scenario B manual service product");

    res = await browserFetch(send, "/api/sales/products", { method: "POST", body: JSON.stringify(productPayload({
      name: "Leather Executive Office Chair",
      type: "consu",
      listPrice: 8500,
      cost: 0,
      hsnSacCode: "",
      gstTreatment: "taxable",
      description: "Ergonomic leather executive chair with adjustable armrests and lumbar support.",
      hsnSacUserConfirmed: false,
    })) });
    assert(res.ok && !res.body.product.tab_general_information.hsnSacCode, "Chair product should save before HSN/SAC is known");
    created.chair = res.body.product;
    pass("HSN optional at product setup");

    res = await browserFetch(send, "/api/tax/hsn-sac-lookup", { method: "POST", body: JSON.stringify({
      description: "Ergonomic leather executive chair with adjustable armrests and lumbar support.",
      productType: "goods",
    }) });
    assert(res.ok && res.body.type === "goods" && String(res.body.code).startsWith("9401") && res.body.gstRate === 18, `chair HSN lookup failed ${JSON.stringify(res.body)}`);
    const chairSuggestion = res.body;
    pass("Scenario C AI/reference goods suggestion");

    res = await browserFetch(send, "/api/tax/hsn-sac-lookup", { method: "POST", body: JSON.stringify({ description: "Professional accounting and bookkeeping consultancy for a business.", productType: "service" }) });
    assert(res.ok && res.body.type === "service" && res.body.code === "998222" && res.body.gstRate === 18, `service SAC lookup failed ${JSON.stringify(res.body)}`);
    pass("goods vs service lookup");

    res = await browserFetch(send, `/api/sales/products/${created.chair._id}`, { method: "PATCH", body: JSON.stringify(productPayload({
      name: "Leather Executive Office Chair",
      type: "consu",
      listPrice: 8500,
      cost: 0,
      hsnSacCode: chairSuggestion.code,
      gstRate: chairSuggestion.gstRate,
      gstTreatment: chairSuggestion.gstTreatment,
      description: "Ergonomic leather executive chair with adjustable armrests and lumbar support.",
      hsnSacUserConfirmed: true,
    })) });
    assert(res.ok && String(res.body.product.tab_general_information.hsnSacCode).startsWith("9401"), "AI accepted chair suggestion did not persist");
    created.chair = res.body.product;
    pass("AI accept product persistence");

    res = await browserFetch(send, "/api/sales/products", { method: "POST", body: JSON.stringify(productPayload({
      name: "Fresh Unbranded Wheat Grain",
      type: "consu",
      listPrice: 1500,
      cost: 0,
      hsnSacCode: "1001",
      gstRate: 0,
      gstTreatment: "exempt",
      defaultCode: "WHT-RAW-01",
    })) });
    assert(res.ok && res.body.product.tab_general_information.gstRate === 0, `wheat exempt product failed ${JSON.stringify(res.body)}`);
    created.wheat = res.body.product;
    pass("Scenario D exempt/nil rated product");

    res = await browserFetch(send, `/api/sales/products?hsnSacCode=85285200`);
    assert(res.ok && res.body.items.length === 1 && res.body.items[0]._id === created.monitor._id, "HSN filter failed for monitor");
    res = await browserFetch(send, `/api/sales/products?gstRate=18`);
    assert(res.ok && res.body.items.some((p) => p._id === created.monitor._id) && res.body.items.some((p) => p._id === created.bookkeeping._id), "GST filter failed for 18% products");
    res = await browserFetch(send, `/api/sales/products?missingHsn=true`);
    assert(res.ok && !res.body.items.some((p) => p._id === created.monitor._id), "missing HSN filter should not include completed products");
    pass("product filters");

    const quoteBody = {
      customerId: ids.customerId,
      lineItems: [{ itemId: created.monitor._id, name: "Dell 27-inch 4K Monitor", qty: 2, unitPrice: 25000, discount: 0, discountMode: "percent", taxRate: 18, hsn: "85285200", gstTreatment: "taxable", taxReference: created.monitor.tab_general_information.taxReference }],
      status: "draft",
    };
    res = await browserFetch(send, "/api/sales/quotes", { method: "POST", body: JSON.stringify(quoteBody) });
    assert(
      res.ok &&
        res.body.data.taxableAmount === 50000 &&
        res.body.data.lineItems[0].lineTotal === 59000 &&
        res.body.data.totalAmount === 59000 &&
        res.body.data.totalAmount - res.body.data.taxableAmount === 9000,
      `quote monitor math failed ${JSON.stringify(res.body)}`,
    );
    created.quote = res.body.data;
    pass("Scenario E quote/invoice math: monitor");

    const invoiceBody = {
      customerId: ids.customerId,
      invoiceDate: "2026-10-09",
      dueDate: "2026-10-16",
      lineItems: [{ itemId: created.bookkeeping._id, name: "Professional Bookkeeping Services", qty: 1, unitPrice: 10000, discount: 10, discountMode: "percent", taxRate: 18, hsn: "998222", gstTreatment: "taxable" }],
      status: "draft",
    };
    res = await browserFetch(send, "/api/sales/invoices", { method: "POST", body: JSON.stringify(invoiceBody) });
    const gstBreakup = res.body?.data?.taxes?.gstBreakup || [];
    const cgst = gstBreakup.find((row) => row.label === "CGST")?.amount;
    const sgst = gstBreakup.find((row) => row.label === "SGST")?.amount;
    assert(res.ok && res.body.data.taxableAmount === 9000 && cgst === 810 && sgst === 810 && res.body.data.totalAmount === 10620, `invoice bookkeeping math failed ${JSON.stringify(res.body)}`);
    created.invoiceA = res.body.data;
    pass("Scenario E invoice discount GST: bookkeeping");

    res = await browserFetch(send, "/api/finance/accounting/settings", { method: "PATCH", body: JSON.stringify({ taxSettings: { requireHsnSacOnInvoices: true } }) });
    assert(res.ok, "setting HSN requirement failed");
    res = await browserFetch(send, "/api/sales/invoices", { method: "POST", body: JSON.stringify({ ...invoiceBody, status: "saved", lineItems: [{ ...invoiceBody.lineItems[0], hsn: "" }] }) });
    assert(!res.ok && res.status === 400, "HSN requirement did not block missing HSN");
    res = await browserFetch(send, "/api/finance/accounting/settings", { method: "PATCH", body: JSON.stringify({ taxSettings: { requireHsnSacOnInvoices: false } }) });
    assert(res.ok, "turning HSN requirement off failed");
    pass("invoice HSN requirement gate");

    res = await browserFetch(send, `/api/sales/products/${created.monitor._id}`, { method: "PATCH", body: JSON.stringify(productPayload({
      name: "Dell 27-inch 4K Monitor",
      type: "consu",
      listPrice: 25000,
      cost: 18000,
      hsnSacCode: "85285200",
      gstRate: 12,
      gstTreatment: "taxable",
      defaultCode: "MON-DELL-27",
    })) });
    assert(res.ok, "product GST update failed");
    res = await browserFetch(send, "/api/sales/invoices", { method: "POST", body: JSON.stringify({ ...invoiceBody, lineItems: [{ itemId: created.monitor._id, name: "Historical B", qty: 1, unitPrice: 100, discount: 0, discountMode: "percent", taxRate: 12, hsn: "85285200", gstTreatment: "taxable" }] }) });
    assert(res.ok && res.body.data.lineItems[0].taxRate === 12, "new invoice did not use updated product snapshot");
    res = await browserFetch(send, `/api/sales/invoices/${created.invoiceA._id}`);
    assert(res.ok && res.body.data.lineItems[0].taxRate === 18 && res.body.data.taxableAmount === 9000, "historical invoice changed after product edit");
    pass("historical transaction integrity");

    res = await browserFetch(send, "/api/finance/bills", { method: "POST", body: JSON.stringify({
      partnerId: ids.vendorId,
      invoiceLines: [{ productId: created.monitor._id, name: "Supplier mismatch line", quantity: 1, priceUnit: 100, taxRate: 5, hsnSacCode: "9401", gstTreatment: "taxable" }],
      amountUntaxed: 100,
      amountTax: 5,
      amountTotal: 105,
    }) });
    assert(res.ok && res.body.item.taxMismatchStatus === "mismatch" && res.body.item.manualReviewRequired, "purchase mismatch not flagged");
    created.bill = res.body.item;
    res = await browserFetch(send, `/api/finance/bills/${created.bill._id}`, { method: "PATCH", body: JSON.stringify({ invoiceLines: [{ ...created.bill.invoiceLines[0], taxComparisonDecision: "supplier" }] }) });
    assert(res.ok && res.body.item.invoiceLines[0].taxComparisonDecision === "supplier", "purchase decision did not persist");
    pass("purchase tax comparison");

    await navigate(send, `${BASE_URL}/finance/gst`);
    const reportVisible = await evalJs(send, `document.body.innerText.includes("HSN/SAC Sales Summary")`);
    assert(reportVisible, "GST report UI did not render");
    res = await browserFetch(send, "/api/finance/reports/gst?dateFrom=2026-10-01&dateTo=2026-10-31");
    assert(res.ok && res.body.rows.some((row) => row.hsn === "998222" && row.taxableValue === 9000 && row.taxAmount === 1620), `GST report did not include bookkeeping invoice line: ${JSON.stringify(res.body)}`);
    pass("GST report UI and aggregation");

    res = await browserFetch(send, "/api/sales/products?query=Tenant B Private Product");
    assert(res.ok && res.body.items.length === 0, "tenant isolation failed: tenant A saw tenant B product");
    pass("tenant isolation");

    res = await browserFetch(send, "/api/tax/hsn-sac-lookup", { method: "POST", body: JSON.stringify({ description: "qxvjkzz", productType: "goods" }) });
    assert(!res.ok && res.status === 404, `AI/reference no-match failure not surfaced: ${JSON.stringify(res)}`);
    res = await browserFetch(send, "/api/sales/products", { method: "POST", body: JSON.stringify(productPayload({
      name: "Manual After AI Failure",
      type: "consu",
      listPrice: 100,
      cost: 0,
      hsnSacCode: "3001",
      gstRate: 18,
      gstTreatment: "taxable",
    })) });
    assert(res.ok, "manual product after AI failure failed");
    pass("AI failure manual fallback");

    await navigate(send, `${BASE_URL}/sales/products?hsnSacCode=85285200`);
    const productVisibleStart = Date.now();
    let productVisible = false;
    while (Date.now() - productVisibleStart < 15_000) {
      productVisible = await evalJs(send, `document.body.innerText.includes("Dell 27-inch 4K Monitor")`);
      if (productVisible) break;
      await wait(500);
    }
    if (!productVisible) {
      const productPage = await evalJs(send, `({ href: location.href, body: (document.body?.innerText || "").slice(0, 2000) })`);
      throw new Error(`products UI filter page did not show expected product: ${JSON.stringify(productPage)}`);
    }
    pass("browser product list page");

    console.log(JSON.stringify({ ok: true, environment: { baseUrl: BASE_URL, database: MONGODB_URI.replace(/\/\/.*@/, "//***@"), browser: CHROME }, results }, null, 2));
  } finally {
    ws.close();
    chrome.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
