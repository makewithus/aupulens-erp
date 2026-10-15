"use client";

import { useEffect, useState } from "react";
import type { UserDepartment } from "@/lib/admin/departmentModules";

export function useUserMetadata(open: boolean) {
  const [departments, setDepartments] = useState<UserDepartment[]>([]);
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [metadataReady, setMetadataReady] = useState(false);
  const [metadataError, setMetadataError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let refreshing = false;
    setDepartments([]);
    setEnabledModules([]);
    setMetadataReady(false);
    setMetadataError("");

    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      try {
        const [departmentResponse, entitlementResponse] = await Promise.all([
          fetch("/api/hr/departments", { cache: "no-store" }),
          fetch("/api/admin/entitlements", { cache: "no-store" }),
        ]);
        if (!departmentResponse.ok || !entitlementResponse.ok) throw new Error("Metadata request failed");
        const [departmentData, entitlementData] = await Promise.all([
          departmentResponse.json(), entitlementResponse.json(),
        ]);
        if (!entitlementData.success || !Array.isArray(entitlementData.data?.modules) || !Array.isArray(departmentData.items)) {
          throw new Error("Invalid metadata response");
        }
        if (cancelled) return;
        setDepartments(departmentData.items);
        setEnabledModules(entitlementData.data.modules);
        setMetadataReady(true);
        setMetadataError("");
      } catch {
        if (cancelled) return;
        setDepartments([]);
        setEnabledModules([]);
        setMetadataReady(false);
        setMetadataError("Unable to load approved roles. Please reopen this dialog to try again.");
      } finally {
        refreshing = false;
      }
    }

    void refresh();
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [open]);

  return { departments, enabledModules, metadataReady, metadataError };
}
