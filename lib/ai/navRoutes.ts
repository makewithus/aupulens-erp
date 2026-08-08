/**
 * Canonical navigation registry for the AI Command Center.
 *
 * The problem this solves: when the LLM classified a "navigate" intent it used
 * to invent a URL path (e.g. "/admin/leads"), which 404'd. Navigation must only
 * ever go to a REAL route. So instead of trusting an AI-guessed URL, we resolve
 * the user's phrase against the app's actual sidebar destinations — the same
 * hrefs the human navigation uses — guaranteeing a valid landing page.
 */
import type { SidebarSection } from "@/components/dashboard/DashboardSidebar";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { crmSidebarConfig } from "@/config/sidebar/crm";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { hrSidebarConfig } from "@/config/sidebar/hr";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { manufacturingSidebarConfig } from "@/config/sidebar/manufacturing";
import { projectsSidebarConfig } from "@/config/sidebar/projects";

export interface NavDestination {
  title: string;
  href: string;
  section?: string;
}

// Order matters for tie-breaks (first wins) — admin/crm/finance/sales first.
const CONFIGS: any[] = [
  adminSidebarConfig,
  crmSidebarConfig,
  financeSidebarConfig,
  salesSidebarConfig,
  hrSidebarConfig,
  inventorySidebarConfig,
  manufacturingSidebarConfig,
  projectsSidebarConfig,
];

/** Flatten every module's sidebar into a de-duplicated list of real routes. */
export const NAV_DESTINATIONS: NavDestination[] = (() => {
  const out: NavDestination[] = [];
  const seen = new Set<string>();
  for (const cfg of CONFIGS as SidebarSection[][]) {
    for (const entry of cfg || []) {
      // Support both {title, items:[...]} sections and flat {title, href} items.
      const items: any[] = (entry as any).items || [entry];
      for (const item of items) {
        const href = item?.href;
        if (typeof href !== "string" || !href.startsWith("/") || seen.has(href)) continue;
        seen.add(href);
        out.push({ title: item.title, href, section: (entry as any).title });
      }
    }
  }
  return out;
})();

const STOP = new Set([
  "go", "to", "the", "a", "an", "open", "navigate", "show", "me", "take", "view",
  "page", "section", "please", "screen", "module", "my", "for", "of", "and", "into",
  "goto", "bring", "up", "list", "all",
]);

function tokens(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
}

/**
 * Resolve a natural-language destination phrase to a real route, or null if
 * nothing matches well enough (so the caller can say "I can't find that page"
 * rather than navigating somewhere wrong).
 */
export function resolveNavDestination(query: string): NavDestination | null {
  const qTokens = tokens(query);
  if (qTokens.length === 0) return null;
  const qJoined = qTokens.join(" ");

  let best: { dest: NavDestination; score: number } | null = null;
  for (const dest of NAV_DESTINATIONS) {
    const titleTokens = tokens(dest.title);
    const titleJoined = titleTokens.join(" ");
    const hrefTokens = dest.href.toLowerCase().split(/[/\-_]/).filter(Boolean);
    let score = 0;

    if (titleJoined && titleJoined === qJoined) score += 100;
    else if (titleJoined && (qJoined.includes(titleJoined) || titleJoined.includes(qJoined))) score += 40;

    for (const t of qTokens) {
      if (titleTokens.includes(t)) score += 12;
      else if (hrefTokens.includes(t)) score += 8;
      else if (titleTokens.some((tt) => tt.startsWith(t) || t.startsWith(tt))) score += 4;
    }

    // The last href segment is the strongest single signal ("/crm/leads" → "leads").
    const lastSeg = hrefTokens[hrefTokens.length - 1];
    if (lastSeg && qTokens.includes(lastSeg)) score += 20;

    if (score > 0 && (!best || score > best.score)) best = { dest, score };
  }

  return best && best.score >= 12 ? best.dest : null;
}

/** A short, friendly list of common destinations for fallback messages. */
export function topNavSuggestions(n = 8): string[] {
  const preferred = ["Leads", "Customers", "Invoices", "Opportunities", "Employees", "Ledger", "Dashboard", "Reports"];
  const titles = new Set(NAV_DESTINATIONS.map((d) => d.title));
  const picks = preferred.filter((p) => titles.has(p));
  return (picks.length ? picks : NAV_DESTINATIONS.map((d) => d.title)).slice(0, n);
}
