"use client";

import { toast } from "sonner";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PlatformDashboardLayout } from "./PlatformDashboardLayout";
import { AdminRoleType } from "@/lib/constants/statuses";

interface AdminIdentity {
  name: string;
  email: string;
  role: AdminRoleType;
}

export function PlatformShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/platform/me")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((body) => {
        if (!cancelled && body.success) setAdmin(body.data);
      })
      .catch(() => {
        if (!cancelled) router.replace("/platform/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSignOut() {
    toast.success("Successfully signed out. Redirecting...");
    await fetch("/api/platform/auth/logout", { method: "POST" });
    router.push("/platform/login");
  }

  return (
    <PlatformDashboardLayout
      companyName="Aupulens"
      dashboardTitle="Platform"
      pageName="Global Admin"
      userName={admin?.name || ""}
      userEmail={admin?.email || ""}
      userRole={admin?.role || ""}
      onSignOut={handleSignOut}
      profilePath="/platform/settings"
    >
      {children}
    </PlatformDashboardLayout>
  );
}
