import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Hard Rule 3: "No static data. None. Anywhere." — checked structurally,
 * not just by convention. Every app/platform/**\/page.tsx must fetch its
 * displayed numbers/lists from an API route (a `fetch("/api/platform/...")`
 * call), never from a literal array or hardcoded numeric constant used as
 * display content.
 *
 * This is necessarily a heuristic, not a perfect static-data detector — it
 * is tuned against the real files in this codebase (checked by hand once,
 * see the allowlist below for the few legitimate literals: page-size
 * constants, threshold labels, and the fixed tab-name lists that are UI
 * routing, not business data). A new page that fails this test should be
 * fixed by fetching real data, not by widening the allowlist without
 * checking first.
 */

const ROOT = path.resolve(__dirname, "../..");
const PLATFORM_UI_DIR = path.join(ROOT, "app/platform");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

// Fixed UI vocabulary — routing/config, not business data.
const ALLOWED_LITERAL_ARRAYS = [
  // tab keys (a route's own tab set, not tenant/platform data)
  /const TABS = \[/,
  // form option lists sourced from a real enum (statuses.ts), not invented
  /PLAN_KEY_VALUES|PLATFORM_EVENT_CATEGORY_VALUES|PLATFORM_SEVERITY_VALUES|ORGANIZATION_TYPE_LABELS|ORGANIZATION_STATUS_LABELS/,
];

describe("no static data in any Global Admin UI page (Hard Rule 3)", () => {
  const pages = walk(PLATFORM_UI_DIR);

  it("found at least the expected number of platform pages (sanity check on the walk itself)", () => {
    expect(pages.length).toBeGreaterThanOrEqual(10);
  });

  it.each(pages.map((p) => [path.relative(ROOT, p), p] as const))(
    "%s fetches its data from a real API route",
    (_relPath, fullPath) => {
      const content = readFileSync(fullPath, "utf8");
      // Every page that renders any numbers/lists must call fetch(...) against
      // a real /api/platform/** endpoint — a page with NO fetch call at all
      // and NO real data displayed (pure static routing/forms-only page) is
      // fine; this check only fires for pages that render dynamic-looking
      // interpolated values without ever fetching.
      const hasFetch = /fetch\(\s*[`"']\/api\/platform/.test(content);
      const rendersValue = /\{[a-zA-Z_.]+\?\.[a-zA-Z]/.test(content) || /useState<.*\[\]>/.test(content);
      if (rendersValue) {
        expect(hasFetch).toBe(true);
      }
    },
  );

  it("no page contains a hardcoded array of fake business-looking records (e.g. sample organisation/user objects)", () => {
    const suspiciousPattern = /(const|let)\s+\w*(orgs|organizations|users|alerts|records|rows)\s*[:=]\s*\[\s*\{/i;
    const violations = pages.filter((p) => {
      const content = readFileSync(p, "utf8");
      return suspiciousPattern.test(content) && !ALLOWED_LITERAL_ARRAYS.some((re) => re.test(content));
    });
    expect(violations.map((p) => path.relative(ROOT, p))).toEqual([]);
  });

  it("no page hardcodes a plausible-looking revenue/currency figure (MRR/ARR must stay an honest empty state per OPEN_QUESTIONS.md #4)", () => {
    const revenuePattern = /\b(mrr|arr)\s*[:=]\s*\d/i;
    const violations = pages.filter((p) => revenuePattern.test(readFileSync(p, "utf8")));
    expect(violations.map((p) => path.relative(ROOT, p))).toEqual([]);
  });
});
