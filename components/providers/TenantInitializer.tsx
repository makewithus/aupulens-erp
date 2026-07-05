"use client";

import { useEffect } from "react";
import { useTenantStore } from "@/store/useTenantStore";
import { useAuthStore } from "@/store/authStore";
import { signOut } from "next-auth/react";
import { APP_BASE_URL } from "@/lib/config";

function getTenantFromHost(hostname: string): string | null {
  const hostParts = hostname.split(".");

  // For companyx.aupulens.online (and local testing formats)
  // Handles generic subdomain extraction
  if (hostParts.length >= 3) {
    // Check if first part is not 'www' or shared infrastructure
    if (
      hostParts[0] !== "www" &&
      hostParts[0] !== "localhost" &&
      hostParts[0] !== "aupulens-erp"
    ) {
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
        const searchParams = new URLSearchParams(window.location.search);
        if (searchParams.get("session_active") === "true") {
          sessionStorage.setItem("session_active", "true");
          searchParams.delete("session_active");
          const queryStr = searchParams.toString();
          const newUrl = window.location.pathname + (queryStr ? `?${queryStr}` : "") + window.location.hash;
          window.history.replaceState({}, "", newUrl);
        }

        const hostname = window.location.hostname;
        const extractedTenant = getTenantFromHost(hostname) || "default-tenant";

        setTenantId(extractedTenant);

        const path = window.location.pathname;
        const isAuthPage = path.startsWith("/auth") || path.startsWith("/onboarding");

        // Fetch session once on mount
        await checkSession(false);

        const currentUser = useAuthStore.getState().user;
        if (currentUser && !isAuthPage) {
          const isSessionActive = sessionStorage.getItem("session_active") === "true";
          if (!isSessionActive) {
            // Fresh tab or browser load, but session cookie was preserved.
            // Log out immediately to require login credentials!
            useAuthStore.getState().logout();
            await signOut({ callbackUrl: "/auth/admin" });
            return;
          }
        }

        if (extractedTenant === "default-tenant") {
          setIsActive(true);
          return;
        }

        try {
          const res = await fetch(
            `/api/tenant/status?subdomain=${extractedTenant}`,
          );
          if (res.ok) {
            const data = await res.json();
            setIsActive(data.isActive);
          } else if (res.status === 404) {
            setIsActive(false);
            window.location.href = APP_BASE_URL;
          } else {
            setIsActive(false);
          }
        } catch (error) {
          setIsActive(true);
        }
      }
    };

    initializeTenant();
  }, [setTenantId, setIsActive, checkSession]);

  return null;
}
