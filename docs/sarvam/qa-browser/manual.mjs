// Runs the SARVAM_TEST.md steps (Groups A–E) in a real browser and prints what ACTUALLY happened, so the guide's expectations are observed, not assumed.
import path from "node:path";
import { loginContext, tenantUrl, openChat, say, bodyText, formValues, mongo, OUT } from "./lib.mjs";
const pw = await import(process.env.PLAYWRIGHT_CORE || "playwright-core");
const chromium = pw.chromium ?? pw.default.chromium;
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const ctx = await loginContext(browser, "demo-acme", process.env.QA_USER || "owner@demo-acme.demo");
const fresh = async () => { const p = await ctx.newPage(); await p.goto(tenantUrl("demo-acme", "/sales/summary"), { waitUntil: "domcontentloaded", timeout: 180000 }); await openChat(p); return p; };
const show = (id, typed, j, extra = "") => console.log(`\n### ${id}  typed: ${JSON.stringify(typed)}\n   kind=${j?.kind} handled=${j?.handled} lang=${j?.language?.detected} degraded=${j?.language?.degraded} english=${JSON.stringify(j?.english)} ${extra}\n   MESSAGE: ${(j?.message ?? "(no guided-flow response — normal assistant path)").replace(/\n/g, " ⏎ ").slice(0, 700)}`);
const group = process.argv[2] || "all";

if (group === "A" || group === "all") {
  const p = await fresh(); let calls = 0; p.on("request", (r) => { if (r.url().includes("/api/ai/task-flow")) calls++; });
  const ta = p.locator('textarea[placeholder="Ask Anything"]').first();
  for (const q of ["what is my cash balance", "show unpaid invoices", "how many customers do I have"]) {
    const t0 = Date.now(); await ta.fill(q); await ta.press("Enter");
    await p.waitForFunction((n) => document.body.innerText.length > n + 60, (await bodyText(p)).length, { timeout: 25000 }).catch(() => {});
    console.log(`\n### A  typed: ${JSON.stringify(q)}  → first assistant text after ${Date.now() - t0} ms; guided-flow requests so far: ${calls}; url=${p.url().replace(/^https?:\/\/[^/]+/, "")}`);
    await p.waitForTimeout(4000);
    console.log("   TAIL:", (await bodyText(p)).slice(-260));
  }
  await p.close();
}
if (group === "B" || group === "all") {
  let p = await fresh();
  const seq = async (id, msgs) => { for (const m of msgs) show(id, m, await say(p, m)); };
  await seq("B1", ["Create an invoice for Acme Trading, 45000, due 30 days, consulting services"]); await say(p, "cancel");
  await seq("B2", ["Create an invoice", "Kamal", "1", "5000", "skip"]);
  await say(p, "cancel");
  await seq("B3", ["Create an invoice for Kamal", "Skip the questions and open the form"]);
  p = await fresh();
  await seq("B4", ["Create an invoice for Kamal, 500", "Repairs", "back", "cancel"]);
  await seq("B5", ["Create an invoice for Kamal, 500"]);
  await p.reload({ waitUntil: "domcontentloaded" }); await openChat(p);
  await seq("B5-resume", ["continue"]); await say(p, "cancel");
  await p.close();
}
if (group === "C" || group === "all") {
  let p = await fresh();
  for (const m of ["mujhe invoice banana hai", "Acme Industries ke liye"]) show("C-roman", m, await say(p, m));
  await say(p, "cancel"); p = await fresh();
  show("C-tamil", "Acme க்கு இன்வாய்ஸ் உருவாக்கு", await say(p, "Acme க்கு இன்வாய்ஸ் உருவாக்கு")); await say(p, "cancel"); p = await fresh();
  show("C-hindi", "Acme के लिए 45000 रुपये का इनवॉइस बनाओ", await say(p, "Acme के लिए 45000 रुपये का इनवॉइस बनाओ")); await say(p, "cancel"); p = await fresh();
  show("C-mixed", "invoice banao for Acme Trading, amount 45000 rupees", await say(p, "invoice banao for Acme Trading, amount 45000 rupees")); await say(p, "cancel");
  await p.close();
}
if (group === "D" || group === "all") {
  let p = await fresh();
  show("D-whatsapp", "(multi-line WhatsApp paste)", await say(p, "hi ​please​ create  invoice\n\nfor   Acme Trading 😊😊\n45,000 rs   due 30 days\n\n\nthx 🙏")); await say(p, "cancel"); p = await fresh();
  show("D-typos", "create an invoce for Kamal, 45k", await say(p, "create an invoce for Kamal, 45k")); await say(p, "cancel"); p = await fresh();
  show("D-caps", "PLEASEEEE CREATE AN INVOICE FOR KAMAL 500", await say(p, "PLEASEEEE CREATE AN INVOICE FOR KAMAL 500")); await say(p, "cancel"); p = await fresh();
  await say(p, "Create an invoice for Kamal, 700");
  show("D-quoted", 'item "Reciept Pad"', await say(p, 'item "Reciept Pad"')); show("D-quoted-2", "skip", await say(p, "skip"));
  await say(p, "cancel"); await p.close();
}
if (group === "E" || group === "all") {
  let p = await fresh();
  show("E-name", "Create an invoice for Recipt Traders, 500", await say(p, "Create an invoice for Recipt Traders, 500")); await say(p, "cancel"); p = await fresh();
  show("E-name-roman", "Recipt Traders ke liye invoice banao 500", await say(p, "Recipt Traders ke liye invoice banao 500")); await say(p, "cancel"); p = await fresh();
  await say(p, "Create an invoice for Kamal, 500");
  show("E-invno", 'item "INV-0O42 adjustment"', await say(p, 'item "INV-0O42 adjustment"')); await say(p, "cancel"); p = await fresh();
  show("E-gstin", "Kamal ke liye invoice banao 500, GSTIN 27AAPFU0939F1ZV", await say(p, "Kamal ke liye invoice banao 500, GSTIN 27AAPFU0939F1ZV")); await say(p, "cancel");
  await p.close();
}
await browser.close();
