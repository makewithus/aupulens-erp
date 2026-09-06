"use client";

import { useEffect } from "react";
import { useTenantStore } from "@/store/useTenantStore";
import { useAuthStore } from "@/store/authStore";
import { APP_BASE_URL, APP_ROOT_DOMAIN } from "@/lib/config";

function getTenantFromHost(hostname: string): string | null {
  if (hostname.endsWith(".vercel.app")) {
    return null;
  }

  // Exact match for the root domain or www.
  if (hostname === APP_ROOT_DOMAIN || hostname === `www.${APP_ROOT_DOMAIN}`) {
    return null;
  }

  try {
    const baseHost = new URL(APP_BASE_URL).hostname;
    if (hostname === baseHost || hostname === `www.${baseHost}`) {
      return null;
    }
  } catch (e) {
    // Ignore invalid APP_BASE_URL
  }

  // Check if it's a subdomain of APP_ROOT_DOMAIN
  const rootDomainSuffix = `.${APP_ROOT_DOMAIN}`;
  if (hostname.endsWith(rootDomainSuffix)) {
    const subdomain = hostname.slice(0, -rootDomainSuffix.length);
    if (subdomain !== "www") {
      return subdomain;
    }
  }

  // For localhost testing: tenant.localhost
  if (hostname.endsWith(".localhost")) {
    const subdomain = hostname.replace(".localhost", "");
    if (subdomain && subdomain !== "www") {
      return subdomain;
    }
  }

  // Handle localhost:3000
  const hostParts = hostname.split(".");
  if (hostname.includes("localhost") && hostParts.length >= 2) {
    if (hostParts[0] !== "localhost") {
      return hostParts[0];
    }
  }

  // If it's a completely different custom domain (like erp.aupulens.com when root is aupulens.online),
  // treat it as the root domain (default-tenant) to avoid breaking deployments.
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

        // Populate the auth store from the session. A VALID session cookie must
        // keep the user signed in across tab/browser restarts (closing a tab or
        // the PC dying should NOT force re-login) — so we no longer force a
        // logout on fresh loads. An expired/absent session is still rejected by
        // the middleware + server auth, which redirect to login.
        await checkSession(false);

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
