// Shared helpers for the browser QA runner. Method = real Chrome driven by playwright-core.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const OUT = process.env.QA_OUT || path.resolve("qa-out");
export const BASE = process.env.QA_BASE || "3100";
export const DB = process.env.QA_DB || "aupulens_browser_qa";
export const PASSWORD = "DemoOwnerPassword123!";
export const tenantUrl = (tenant, p = "") => `http://${tenant}.localhost:${BASE}${p}`;
export const platformUrl = (p = "") => `http://localhost:${BASE}${p}`;
fs.mkdirSync(OUT, { recursive: true });

export const results = fs.existsSync(path.join(OUT, "results.json")) ? JSON.parse(fs.readFileSync(path.join(OUT, "results.json"), "utf8")) : [];
export async function step(id, area, expected, fn, page) {
  const t0 = Date.now();
  const r = { id, area, method: "browser", expected, status: "pass", note: "", screenshot: "", ms: 0 };
  try {
    const note = await fn();
    if (typeof note === "string") r.note = note;
  } catch (e) {
    r.status = "FAIL";
    r.note = String(e?.message || e).split("\n").slice(0, 4).join(" ");
  }
  if (page) {
    r.screenshot = `${id}.png`;
    await page.screenshot({ path: path.join(OUT, r.screenshot), fullPage: false }).catch(() => { r.screenshot = ""; });
  }
  r.ms = Date.now() - t0;
  const at = results.findIndex((x) => x.id === id);
  if (at >= 0) results[at] = r; else results.push(r);
  console.log(`${r.status === "pass" ? "✔" : "✘"} ${id}  ${r.status === "pass" ? "" : r.note}`);
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  return r;
}

export function assert(cond, msg) { if (!cond) throw new Error(msg); }
export async function bodyText(page) { return (await page.locator("body").innerText()).replace(/\s+/g, " "); }
export async function expectText(page, text, timeout = 30000) {
  await page.waitForFunction((t) => document.body.innerText.replace(/\s+/g, " ").includes(t), text, { timeout }).catch(() => { throw new Error(`text not found on page: "${text}"`); });
}
export async function expectNoText(page, text) { assert(!(await bodyText(page)).includes(text), `unexpected text on page: "${text}"`); }

export function mongo(js) {
  return execFileSync("mongosh", ["--quiet", DB, "--eval", js], { encoding: "utf8" }).trim(); // no shell: $set etc. stay intact
}

export async function loginContext(browser, tenant, email, password = PASSWORD) {
  const file = path.join(OUT, `state-${tenant}-${email}.json`);
  if (fs.existsSync(file)) return browser.newContext({ storageState: file, viewport: { width: 1360, height: 900 } });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(tenantUrl(tenant, "/auth"), { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(3000); // dev-mode hydration: submitting earlier does a native GET
  await p.fill("#email", email); await p.fill("#password", password);
  await p.click("text=SIGN IN");
  await p.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 120000 });
  await ctx.storageState({ path: file });
  await p.close();
  return ctx;
}

export async function platformContext(browser, cookieFile) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addCookies([{ name: "aupulens_admin_session", value: fs.readFileSync(path.join(OUT, cookieFile), "utf8").trim(), domain: "localhost", path: "/" }]);
  return ctx;
}

// ── chat (the global AI sidebar) ──────────────────────────────────────────────────
export async function openChat(page) {
  const ta = page.locator('textarea[placeholder="Ask Anything"]');
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(4000); // dev-mode hydration before the toggle is live
  for (let i = 0; i < 4 && !(await ta.count()); i++) {
    await page.locator('button[title="Aupulens Copilot"]').first().click({ timeout: 60000 });
    await ta.first().waitFor({ timeout: 8000 }).catch(() => {});
  }
  await ta.first().waitFor({ timeout: 30000 });
}
/** Send a message; resolves with the /api/ai/task-flow JSON when the flow answered (or null if it was not consulted / not handled). */
export async function say(page, text, { flow = true, wait = 1200 } = {}) {
  const ta = page.locator('textarea[placeholder="Ask Anything"]').first();
  await ta.fill(text);
  const respP = flow ? page.waitForResponse((r) => r.url().includes("/api/ai/task-flow") && r.request().method() === "POST", { timeout: 60000 }).catch(() => null) : null;
  await ta.press("Enter");
  const resp = respP ? await respP : null;
  const json = resp ? await resp.json().catch(() => null) : null;
  await page.waitForTimeout(wait);
  return json;
}
export async function formValues(page) {
  return page.locator("input,textarea,select").evaluateAll((els) => els.map((e) => e.value).filter(Boolean));
}
