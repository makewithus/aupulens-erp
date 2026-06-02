"use client";

import { useTenantStore } from "@/store/useTenantStore";
import TenantSuspendedView from "@/components/auth/TenantSuspendedView";

export default function TenantWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tenantId, isActive } = useTenantStore();

  // Don't lock out the main domain or the master-admin routes.
  const isProtectedPath =
    typeof window !== "undefined" &&
    (window.location.pathname.startsWith("/master-admin") ||
      window.location.pathname.startsWith("/auth/master") ||
      tenantId === "default" ||
      tenantId === "default-tenant");

  if (!isActive && !isProtectedPath && tenantId) {
    return <TenantSuspendedView />;
  }

  return <>{children}</>;
}
