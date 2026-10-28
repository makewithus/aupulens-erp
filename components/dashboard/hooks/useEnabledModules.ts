"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { normalizeModuleList, type TenantModuleKey } from "@/lib/modules/visibility";

import { cachedFetch } from "@/lib/api/cachedFetch";

const cachedModules = new Map<string, TenantModuleKey[]>();
const inflight = new Map<string, Promise<TenantModuleKey[]>>();

function storageKey(tenantId: string) {
  return `aupulens:enabled-modules:${tenantId}`;
}

function readCachedModules(tenantId: string): TenantModuleKey[] | null {
  const memoryValue = cachedModules.get(tenantId);
  if (memoryValue) return memoryValue;
  if (typeof window === "undefined") return null;

  try {
    const stored = normalizeModuleList(JSON.parse(sessionStorage.getItem(storageKey(tenantId)) ?? "[]"));
    if (stored.length) {
      cachedModules.set(tenantId, stored);
      return stored;
    }
  } catch {
    try {
      sessionStorage.removeItem(storageKey(tenantId));
    } catch {
      // Session storage is an optimization only.
    }
  }
  return null;
}

function cacheModules(tenantId: string, modules: TenantModuleKey[]) {
  cachedModules.set(tenantId, modules);
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(storageKey(tenantId), JSON.stringify(modules));
    } catch {
      // Session storage can be unavailable in privacy-restricted contexts.
    }
  }
}

async function fetchEnabledModules(tenantId: string): Promise<TenantModuleKey[]> {
  const pending = inflight.get(tenantId);
  if (pending) return pending;

  const request = (async () => {
    // Organization settings include the effective module list for legacy
    // tenants. Use it as the common path; ask for central entitlements only
    // when that response has no usable list.
    const settingsResponse = await cachedFetch("/api/admin/org-settings").catch(() => null);
    const settings = settingsResponse?.ok ? await settingsResponse.json().catch(() => null) : null;
    const settingsModules = normalizeModuleList(
      settings?.data?.settings?.enabledModules ?? settings?.data?.entitlements?.modules,
    );
    if (settingsModules.length) return settingsModules;
    const entitlementResponse = await cachedFetch("/api/admin/entitlements").catch(() => null);
    const entitlements = entitlementResponse?.ok ? await entitlementResponse.json().catch(() => null) : null;
    return normalizeModuleList(entitlements?.data?.modules ?? entitlements?.modules);
  })()
    .then((modules) => {
      cacheModules(tenantId, modules);
      return modules;
    })
    .finally(() => {
      inflight.delete(tenantId);
    });

  inflight.set(tenantId, request);
  return request;
}

export function useEnabledModules(shouldLoad: boolean) {
  const { data: session } = useSession();
  const tenantId = session?.user?.tenantId;
  // Keep the first render identical on the server and browser. Reading
  // sessionStorage here made cached tenants render a different sidebar during
  // hydration in production.
  const [modules, setModules] = useState<TenantModuleKey[] | null>(null);
  // Navigation can render from the static module config immediately. The
  // entitlement request only removes unavailable links after the shell paints.
  const [loaded, setLoaded] = useState(true);

  useEffect(() => {
    if (!shouldLoad) {
      setModules(null);
      setLoaded(true);
      return;
    }

    if (!tenantId) return;

    let cancelled = false;
    const priorModules = readCachedModules(tenantId);
    if (priorModules) {
      setModules(priorModules);
      setLoaded(true);
    } else {
      // Module entitlements only control navigation visibility. Render the
      // configured sidebar immediately and reconcile it when the request ends.
      setLoaded(true);
    }

    const refresh = () => fetchEnabledModules(tenantId)
      .then((nextModules) => {
        if (cancelled) return;
        setModules(nextModules);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        // Keep the last confirmed module list through a transient outage. A
        // first-load failure remains unresolved rather than pretending that a
        // tenant has a different entitlement set.
        if (priorModules) {
          setModules(priorModules);
          setLoaded(true);
        }
      });

    void refresh();
    window.addEventListener("focus", refresh);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [shouldLoad, tenantId]);

  return { enabledModules: modules, loaded };
}
