"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { normalizeModuleList, type TenantModuleKey } from "@/lib/modules/visibility";

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
    const settingsRes = await fetch("/api/admin/org-settings", { cache: "no-store" });
    if (settingsRes.ok) {
      const payload = await settingsRes.json();
      const modules = normalizeModuleList(payload?.data?.settings?.enabledModules ?? payload?.data?.entitlements?.modules);
      if (modules.length) return modules;
    }

    const entitlementRes = await fetch("/api/admin/entitlements", { cache: "no-store" });
    if (entitlementRes.ok) {
      const payload = await entitlementRes.json();
      const modules = normalizeModuleList(payload?.data?.modules ?? payload?.modules);
      if (modules.length) return modules;
    }

    return [];
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
  const [modules, setModules] = useState<TenantModuleKey[] | null>(null);
  const [loaded, setLoaded] = useState(!shouldLoad);

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
      setLoaded(false);
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
