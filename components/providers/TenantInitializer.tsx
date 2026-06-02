"use client";

import { useEffect } from "react";
import { useTenantStore } from "@/store/useTenantStore";
import { useAuthStore } from "@/store/authStore";

function getTenantFromHost(hostname: string): string | null {
  const hostParts = hostname.split(".");

  // For companyx.aupulens.online (and local testing formats)
  // Handles generic subdomain extraction
  if (hostParts.length >= 3) {
    // Check if first part is not 'www' or shared infrastructure
    if (hostParts[0] !== "www" && hostParts[0] !== "localhost") {
      return hostParts[0];
    }
  }

  // Handle tenant.localhost:3000
  if (hostname.includes("localhost") && hostParts.length >= 2) {
    if (hostParts[0] !== "localhost") {
      return hostParts[0];
    }
  }

  return null;
}

export default function TenantInitializer() {
  const { tenantId, setTenantId, setIsActive } = useTenantStore();
  const { checkSession } = useAuthStore();

  useEffect(() => {
    const initializeTenant = async () => {
      if (typeof window !== "undefined") {
        console.log("[TenantInitializer] Initializing...");
        // Force session check to verify tenant matching
        await checkSession(true);

        const hostname = window.location.hostname;
        const extractedTenant = getTenantFromHost(hostname) || "default-tenant";
        console.log(`[TenantInitializer] Extracted tenant: ${extractedTenant}`);

        // Update tenantId if changed
        if (tenantId !== extractedTenant) {
          setTenantId(extractedTenant);
          console.log(`[TenantStore] Tenant updated: ${extractedTenant}`);
        }

        if (extractedTenant === "default-tenant") {
          setIsActive(true);
          return;
        }

        // Always verify active status on initialization or tenant change
        try {
          const res = await fetch(
            `/api/tenant/status?subdomain=${extractedTenant}`,
          );
          if (res.ok) {
            const data = await res.json();
            setIsActive(data.isActive);
          } else if (res.status === 404) {
            // Tenant not found in DB
            setIsActive(false);
            window.location.href = "https://aupulens.online";
            console.log(
              `[TenantStore] Tenant ${extractedTenant} not found in database.`,
            );
          } else {
            // Other errors
            setIsActive(false);
          }
        } catch (error) {
          console.error("[TenantStore] Failed to fetch tenant status:", error);
          setIsActive(true); // Fallback to active to avoid locking out on network issues
        }
      }
    };

    initializeTenant();
  }, [tenantId, setTenantId, setIsActive, checkSession]);

  return null;
}
