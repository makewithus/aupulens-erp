export const TENANT_MODULE_KEYS = [
  "admin",
  "sales",
  "inventory",
  "finance",
  "manufacturing",
  "hr",
  "crm",
  "project",
] as const;

export type TenantModuleKey = (typeof TENANT_MODULE_KEYS)[number];

const MODULE_ALIASES: Record<string, TenantModuleKey> = {
  admin: "admin",
  sales: "sales",
  inventory: "inventory",
  finance: "finance",
  manufacturing: "manufacturing",
  hr: "hr",
  crm: "crm",
  project: "project",
  projects: "project",
};

const STANDALONE_ADMIN_PATHS = [
  "/migration",
  "/integrations",
  "/document-intelligence",
  "/studio",
  "/marketplace",
];

export function normalizeModuleKey(value: unknown): TenantModuleKey | null {
  if (typeof value !== "string") return null;
  return MODULE_ALIASES[value.trim().toLowerCase()] ?? null;
}

export function normalizeModuleList(modules: unknown): TenantModuleKey[] {
  if (!Array.isArray(modules)) return [];
  const seen = new Set<TenantModuleKey>();
  for (const module of modules) {
    const key = normalizeModuleKey(module);
    if (key) seen.add(key);
  }
  return Array.from(seen);
}

export function moduleForHref(href: string | undefined): TenantModuleKey | null {
  if (!href) return null;

  let pathname = href;
  let moduleParam: string | null = null;
  try {
    const parsed = new URL(href, "http://local.invalid");
    pathname = parsed.pathname;
    moduleParam = parsed.searchParams.get("module");
  } catch {
    const [pathOnly, query = ""] = href.split("?");
    pathname = pathOnly || href;
    moduleParam = new URLSearchParams(query).get("module");
  }

  const queryModule = normalizeModuleKey(moduleParam);
  if (queryModule) return queryModule;

  if (STANDALONE_ADMIN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return "admin";
  }

  const firstSegment = pathname.split("/").filter(Boolean)[0];
  return normalizeModuleKey(firstSegment);
}

export function isHrefVisibleForModules(href: string | undefined, enabledModules: readonly string[]): boolean {
  const module = moduleForHref(href);
  if (!module) return true;
  return enabledModules.includes(module);
}

export function filterSidebarSections<T extends { items?: Array<{ href?: string }> }>(
  sections: T[],
  enabledModules: readonly string[] | null,
): T[] {
  if (!enabledModules) return sections;
  return sections
    .map((section) => ({
      ...section,
      items: (section.items ?? []).filter((item) => isHrefVisibleForModules(item.href, enabledModules)),
    }))
    .filter((section) => section.items.length > 0);
}
