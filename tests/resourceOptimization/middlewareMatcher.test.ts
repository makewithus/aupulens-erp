import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { pathToRegexp } from "next/dist/compiled/path-to-regexp";

// Evaluate the real matcher array out of middleware.ts so the test cannot drift from production config.
const src = fs.readFileSync(path.resolve(__dirname, "../../middleware.ts"), "utf8");
const block = /export const config = \{\s*matcher:\s*(\[[\s\S]*?\]),?\s*\};/.exec(src)![1];
const matchers: string[] = new Function(`return ${block}`)();
const regexes = matchers.map((m) => pathToRegexp(m));
const runsMiddleware = (p: string) => regexes.some((r) => r.test(p));

describe("G9 — middleware matcher", () => {
  it.each([
    "/logo-white.png", "/logo-dark.png", "/images/hero.webp", "/styles/app.css", "/chunk.js",
    "/fonts/inter.woff2", "/_next/static/chunks/main.js", "/_next/image", "/favicon.ico",
    "/robots.txt", "/sitemap.xml", "/manifest.json", "/api/auth/session",
  ])("static / public asset %s does not invoke middleware", (p) => {
    expect(runsMiddleware(p)).toBe(false);
  });

  it.each([
    "/api/sales/invoice-templates/x.json",
    "/api/sales/invoice-templates/x.txt",
    "/api/sales/email-templates/welcome.xml",
    "/api/platform/plans/pro.json",
    "/api/finance/accounting/accounts/export.json",
    "/api/admin/org-settings.js",
    "/api/hr/employees/a.png",
    "/api/finance/invoices",
    "/api/sales/products",
    "/api/internal/org-tier",
    "/api/cron/ai/runtime-sweep",
    "/api/crm/leads/abc.json",
  ])("API route %s always passes through middleware", (p) => {
    expect(runsMiddleware(p)).toBe(true);
  });

  it.each(["/", "/auth", "/finance/dashboard", "/admin/users", "/hr/employees", "/platform/waitlist", "/finance/report.json"])(
    "page route %s passes through middleware", (p) => {
      expect(runsMiddleware(p)).toBe(true);
    },
  );
});
