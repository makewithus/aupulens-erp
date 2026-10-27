/**
 * UI regression scanner — Phase 0 of the AI-native brief (Part 0.6).
 *
 * Logs in once, then walks every route in artifacts/routes.txt, capturing a
 * lightweight per-route snapshot (HTTP status, console/page errors, a small
 * DOM fingerprint, and — only on failure/errors — a screenshot). Writes one
 * JSON file per route plus a SUMMARY.md.
 *
 * This is a READ-ONLY scan: it navigates and observes only. It never clicks,
 * submits a form, or otherwise mutates data.
 *
 * Usage:
 *   npx tsx scripts/ui-regression-scan.ts [outDir] [routesFile] [baseUrl]
 *
 * Defaults:
 *   outDir     = artifacts/ui-baseline
 *   routesFile = artifacts/routes.txt
 *   baseUrl    = http://localhost:3000
 *
 * Re-run later (once real UI changes exist) with a different outDir, e.g.
 *   npx tsx scripts/ui-regression-scan.ts artifacts/ui-after
 * to produce a comparable "after" snapshot for diffing against the baseline.
 *
 * Login credentials are read from env vars with sane defaults matching the
 * documented admin fixture account, so this can be pointed at other
 * environments/users without editing the script:
 *   UI_SCAN_EMAIL, UI_SCAN_PASSWORD, UI_SCAN_TENANT_ID, UI_SCAN_BASE_URL
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type ConsoleMessage, type Page } from "playwright";

const REPO_ROOT = path.resolve(__dirname, "..");

const outDirArg = process.argv[2];
const routesFileArg = process.argv[3];
const baseUrlArg = process.argv[4];

const BASE_URL =
  baseUrlArg || process.env.UI_SCAN_BASE_URL || "http://localhost:3000";
const ROUTES_FILE = path.resolve(
  REPO_ROOT,
  routesFileArg || "artifacts/routes.txt",
);
const OUT_DIR = path.resolve(
  REPO_ROOT,
  outDirArg || "artifacts/ui-baseline",
);

const LOGIN_EMAIL = process.env.UI_SCAN_EMAIL || "admin@aupulens.com";
const LOGIN_PASSWORD = process.env.UI_SCAN_PASSWORD || "Aupulens@2026";
const LOGIN_TENANT_ID = process.env.UI_SCAN_TENANT_ID || "default-tenant";

// How long to keep listening for console/page errors after navigation settles.
const SETTLE_MS = 1500;
// Hard cap per route so one hanging page can't stall the whole run.
const PER_ROUTE_TIMEOUT_MS = 20_000;

interface RouteResult {
  route: string;
  status: "scanned" | "skipped" | "error";
  reason?: string;
  httpStatus?: number;
  ok?: boolean;
  consoleErrors?: string[];
  pageErrors?: string[];
  title?: string;
  domElementCount?: number;
  bodyTextSnippet?: string;
  screenshot?: string;
  durationMs?: number;
  transientFirstAttempt?: {
    reason?: string;
    httpStatus?: number;
    consoleErrors?: string[];
    pageErrors?: string[];
  };
}

function slugify(route: string): string {
  if (route === "/") return "_root";
  return route.replace(/^\//, "").replace(/\//g, "_");
}

function isDynamicRoute(route: string): boolean {
  return route.includes("[");
}

function readRoutes(file: string): string[] {
  const raw = fs.readFileSync(file, "utf-8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

async function loginAndGetCookies(): Promise<
  { name: string; value: string; domain: string; path: string }[]
> {
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  if (!csrfRes.ok) {
    throw new Error(
      `Failed to fetch CSRF token: ${csrfRes.status} ${csrfRes.statusText}`,
    );
  }
  const setCookieHeaders = getSetCookies(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  if (!csrfToken) throw new Error("No csrfToken returned from /api/auth/csrf");

  // NextAuth can emit more than one Set-Cookie for the same cookie name on a
  // single GET (observed in this app's dev server — the JSON body's
  // csrfToken always matches the LAST such cookie, not the first). Dedupe by
  // cookie name, keeping the last occurrence, so the Cookie header we send
  // back matches what the server actually expects for CSRF double-submit
  // validation.
  const cookieJar = new Map<string, string>();
  for (const raw of setCookieHeaders) {
    const pair = raw.split(";")[0];
    const eqIdx = pair.indexOf("=");
    cookieJar.set(pair.slice(0, eqIdx), pair.slice(eqIdx + 1));
  }
  const csrfCookieHeader = Array.from(cookieJar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  const body = new URLSearchParams({
    email: LOGIN_EMAIL,
    password: LOGIN_PASSWORD,
    tenantId: LOGIN_TENANT_ID,
    csrfToken,
    json: "true",
  });

  const loginRes = await fetch(
    `${BASE_URL}/api/auth/callback/credentials`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: csrfCookieHeader,
      },
      body: body.toString(),
      redirect: "manual",
    },
  );

  const loginSetCookies = getSetCookies(loginRes);
  // Merge, again keeping the last occurrence per cookie name (the login
  // response's own cookies — including a fresh session token — take
  // precedence over the earlier CSRF-fetch cookies of the same name).
  for (const raw of loginSetCookies) {
    const pair = raw.split(";")[0];
    const eqIdx = pair.indexOf("=");
    cookieJar.set(pair.slice(0, eqIdx), pair.slice(eqIdx + 1));
  }
  const allSetCookies = Array.from(cookieJar.entries()).map(
    ([k, v]) => `${k}=${v}`,
  );

  const hasSessionToken = allSetCookies.some((c) =>
    /^(__Secure-)?authjs\.session-token=/.test(c),
  );
  if (!hasSessionToken) {
    throw new Error(
      `Login did not set a session cookie. Response status: ${loginRes.status}. ` +
        `Set-Cookie headers seen: ${JSON.stringify(allSetCookies)}`,
    );
  }

  const url = new URL(BASE_URL);
  const cookies = allSetCookies.map((raw) => {
    const [pair] = raw.split(";");
    const eqIdx = pair.indexOf("=");
    const name = pair.slice(0, eqIdx);
    const value = pair.slice(eqIdx + 1);
    return {
      name,
      value,
      domain: url.hostname,
      path: "/",
    };
  });
  return cookies;
}

function getSetCookies(res: Response): string[] {
  // Node's fetch Headers exposes getSetCookie() for multi-value Set-Cookie.
  const anyHeaders = res.headers as any;
  if (typeof anyHeaders.getSetCookie === "function") {
    return anyHeaders.getSetCookie();
  }
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

/**
 * Single navigation attempt — no retry logic. See scanRoute() for the
 * retry wrapper that calls this.
 */
async function attemptScanRoute(
  page: Page,
  route: string,
): Promise<RouteResult> {
  const start = Date.now();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  };
  const onPageError = (err: Error) => {
    pageErrors.push(err.message || String(err));
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  try {
    const response = await page.goto(`${BASE_URL}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: PER_ROUTE_TIMEOUT_MS,
    });

    // Let async console/page errors surface after the page settles.
    await page.waitForTimeout(SETTLE_MS);

    const httpStatus = response?.status() ?? 0;
    const ok = httpStatus >= 200 && httpStatus < 400;

    const domSnapshot = await page
      .evaluate(() => {
        return {
          title: document.title,
          domElementCount: document.querySelectorAll("*").length,
          bodyTextSnippet: (document.body?.innerText || "").slice(0, 500),
        };
      })
      .catch(() => ({
        title: "",
        domElementCount: 0,
        bodyTextSnippet: "",
      }));

    const result: RouteResult = {
      route,
      status: "scanned",
      httpStatus,
      ok,
      consoleErrors,
      pageErrors,
      title: domSnapshot.title,
      domElementCount: domSnapshot.domElementCount,
      bodyTextSnippet: domSnapshot.bodyTextSnippet,
      durationMs: Date.now() - start,
    };

    const hasIssue =
      !ok || consoleErrors.length > 0 || pageErrors.length > 0;
    if (hasIssue) {
      const slug = slugify(route);
      const screenshotPath = path.join(OUT_DIR, `${slug}.png`);
      try {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        result.screenshot = path.relative(REPO_ROOT, screenshotPath);
      } catch {
        // Screenshot best-effort only; don't fail the scan over it.
      }
    }

    return result;
  } catch (err: any) {
    return {
      route,
      status: "error",
      reason: err?.message || String(err),
      consoleErrors,
      pageErrors,
      durationMs: Date.now() - start,
    };
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }
}

/**
 * Retry wrapper around attemptScanRoute(). The Next.js dev server compiles
 * each route on-demand on its first hit and Fast Refresh can swap chunks
 * mid-navigation — this produces one-off net::ERR_ABORTED nav failures and
 * transient console/page errors that have nothing to do with the app itself
 * (confirmed by re-navigating to the same route in isolation and seeing it
 * come back completely clean). A single retry after a short pause separates
 * that dev-server noise from a real, reproducible issue: if the retry is
 * clean, the first attempt's errors are recorded as `transientFirstAttempt`
 * for transparency but don't count against the route; if the retry still
 * shows a problem, it's real and kept as the canonical result.
 */
async function scanRoute(page: Page, route: string): Promise<RouteResult> {
  const first = await attemptScanRoute(page, route);

  const firstHadIssue =
    first.status === "error" ||
    (first.status === "scanned" &&
      ((first.consoleErrors?.length ?? 0) > 0 ||
        (first.pageErrors?.length ?? 0) > 0));

  if (!firstHadIssue) return first;

  await page.waitForTimeout(750);
  const second = await attemptScanRoute(page, route);

  const secondHadIssue =
    second.status === "error" ||
    (second.status === "scanned" &&
      ((second.consoleErrors?.length ?? 0) > 0 ||
        (second.pageErrors?.length ?? 0) > 0));

  if (!secondHadIssue) {
    second.transientFirstAttempt = {
      reason: first.reason,
      httpStatus: first.httpStatus,
      consoleErrors: first.consoleErrors,
      pageErrors: first.pageErrors,
    };
    return second;
  }

  // Both attempts had a problem — real, not a compile-timing artifact.
  return second;
}

function writeJson(route: string, data: RouteResult) {
  const slug = slugify(route);
  const filePath = path.join(OUT_DIR, `${slug}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function writeSummary(results: RouteResult[], allRoutes: string[]) {
  const scanned = results.filter((r) => r.status === "scanned");
  const skipped = results.filter((r) => r.status === "skipped");
  const errored = results.filter((r) => r.status === "error");

  const clean = scanned.filter(
    (r) =>
      r.ok &&
      (r.consoleErrors?.length || 0) === 0 &&
      (r.pageErrors?.length || 0) === 0,
  );

  const notClean = [
    ...scanned.filter(
      (r) =>
        !r.ok ||
        (r.consoleErrors?.length || 0) > 0 ||
        (r.pageErrors?.length || 0) > 0,
    ),
    ...errored,
  ];

  const lines: string[] = [];
  lines.push("# UI Baseline Scan Summary");
  lines.push("");
  lines.push(`> Generated ${new Date().toISOString()}`);
  lines.push(`> Base URL: ${BASE_URL}`);
  lines.push(`> Output dir: ${path.relative(REPO_ROOT, OUT_DIR)}`);
  lines.push("");
  lines.push(`- Total routes in ${path.relative(REPO_ROOT, ROUTES_FILE)}: ${allRoutes.length}`);
  lines.push(`- Scanned: ${scanned.length}`);
  lines.push(`- Skipped (dynamic route, no fixture id): ${skipped.length}`);
  lines.push(`- Scanner-level errors (navigation threw / timed out): ${errored.length}`);
  lines.push(`- Clean (2xx/3xx status, zero console/page errors): ${clean.length}`);
  lines.push(`- Not clean (non-2xx/3xx status OR console/page errors): ${notClean.length}`);
  lines.push("");

  if (notClean.length > 0) {
    lines.push("## Routes that did NOT come back clean");
    lines.push("");
    lines.push("| Route | HTTP Status | Console Errors | Page Errors | Scanner Error |");
    lines.push("|---|---|---|---|---|");
    for (const r of notClean) {
      const httpStatus = r.httpStatus !== undefined ? String(r.httpStatus) : "-";
      const consoleErrs =
        r.consoleErrors && r.consoleErrors.length > 0
          ? r.consoleErrors
              .slice(0, 3)
              .map((e) => e.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 200))
              .join("<br>") + (r.consoleErrors.length > 3 ? `<br>(+${r.consoleErrors.length - 3} more)` : "")
          : "-";
      const pageErrs =
        r.pageErrors && r.pageErrors.length > 0
          ? r.pageErrors
              .slice(0, 3)
              .map((e) => e.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 200))
              .join("<br>") + (r.pageErrors.length > 3 ? `<br>(+${r.pageErrors.length - 3} more)` : "")
          : "-";
      const scannerErr = r.reason ? r.reason.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 200) : "-";
      lines.push(`| ${r.route} | ${httpStatus} | ${consoleErrs} | ${pageErrs} | ${scannerErr} |`);
    }
    lines.push("");
  } else {
    lines.push("## Routes that did NOT come back clean");
    lines.push("");
    lines.push("None.");
    lines.push("");
  }

  if (skipped.length > 0) {
    lines.push("## Skipped routes (dynamic segments — no fixture id)");
    lines.push("");
    for (const r of skipped) {
      lines.push(`- ${r.route}`);
    }
    lines.push("");
  }

  fs.writeFileSync(path.join(OUT_DIR, "SUMMARY.md"), lines.join("\n"), "utf-8");
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const allRoutes = readRoutes(ROUTES_FILE);
  console.log(`Loaded ${allRoutes.length} routes from ${ROUTES_FILE}`);

  console.log(`Logging in as ${LOGIN_EMAIL} (tenant ${LOGIN_TENANT_ID})...`);
  const cookies = await loginAndGetCookies();
  console.log(`Login succeeded, got ${cookies.length} cookie(s).`);

  let browser: Browser | undefined;
  const results: RouteResult[] = [];
  let warmUpErrors = 0;
  let wi = 0;

  try {
    browser = await chromium.launch();
    const context = await browser.newContext();
    await context.addCookies(cookies);
    // Must run before ANY navigation — TenantInitializer force-signs-out a
    // session that arrives without this sessionStorage flag set (deliberate
    // security behavior for "cookie survived a fresh tab" scenarios).
    await context.addInitScript(() => {
      sessionStorage.setItem("session_active", "true");
    });

    const page = await context.newPage();

    // Warm-up pass (docs/ai/BRIEF-06-BATCH-E.md Part 0.2) — Next.js dev compiles a route lazily
    // on its first hit, and a resumed/cold scan can time out on that first-compile latency alone
    // (confirmed in Chunk 5: 11 routes flagged, all traced to cold-compile timeouts, all clean on
    // a warm re-scan). Hitting every route once first, discarding the result, means the REAL scan
    // below only ever sees genuine timeouts, not compile latency — but a warm-up "timeout" is
    // still worth counting and reporting, since a route that never even compiles once is itself
    // a real signal, not noise to hide.
    console.log(`Warm-up pass: hitting ${allRoutes.filter((r) => !isDynamicRoute(r)).length} route(s) once (results discarded)...`);
    for (const route of allRoutes) {
      if (isDynamicRoute(route)) continue;
      wi++;
      const result = await attemptScanRoute(page, route);
      if (result.status === "error") warmUpErrors++;
      console.log(`[warm-up ${wi}] ${result.status === "error" ? "TIMEOUT/ERR" : "ok"}  ${route}`);
    }
    console.log(`Warm-up pass done: ${warmUpErrors} cold timeout(s)/error(s) out of ${wi} route(s).`);
    console.log("");

    let i = 0;
    for (const route of allRoutes) {
      i++;
      if (isDynamicRoute(route)) {
        const result: RouteResult = {
          route,
          status: "skipped",
          reason: "dynamic route, no fixture id",
        };
        results.push(result);
        writeJson(route, result);
        console.log(`[${i}/${allRoutes.length}] SKIP  ${route}`);
        continue;
      }

      const result = await scanRoute(page, route);
      results.push(result);
      writeJson(route, result);

      const badge =
        result.status === "error"
          ? "ERR "
          : result.ok &&
              (result.consoleErrors?.length || 0) === 0 &&
              (result.pageErrors?.length || 0) === 0
            ? "OK  "
            : "WARN";
      console.log(
        `[${i}/${allRoutes.length}] ${badge}  ${route}  (status=${result.httpStatus ?? "-"}, consoleErrors=${result.consoleErrors?.length ?? 0}, pageErrors=${result.pageErrors?.length ?? 0}${result.reason ? `, reason=${result.reason}` : ""})`,
      );
    }
  } finally {
    await browser?.close();
  }

  writeSummary(results, allRoutes);

  const scanned = results.filter((r) => r.status === "scanned");
  const skipped = results.filter((r) => r.status === "skipped");
  const clean = scanned.filter(
    (r) =>
      r.ok &&
      (r.consoleErrors?.length || 0) === 0 &&
      (r.pageErrors?.length || 0) === 0,
  );

  console.log("");
  console.log("=== Done ===");
  console.log(`Warm-up: ${warmUpErrors} cold timeout(s)/error(s) out of ${wi} route(s) (discarded, not part of the real scan below).`);
  console.log(`Total: ${allRoutes.length}, Scanned: ${scanned.length}, Skipped: ${skipped.length}, Clean: ${clean.length}`);
  console.log(`Real scan errors (post-warm-up, genuine): ${results.filter((r) => r.status === "error").length}`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("Fatal error running UI regression scan:", err);
  process.exit(1);
});
