"use client";

import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AuthSplash } from "@/components/dashboard/AuthSplash";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { Clock3, Store } from "lucide-react";

export default function MarketplacePage() {
  const { data: session, status } = useSession();

  if (status === "loading") return <AuthSplash />;

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      dashboardTitle="Admin"
      pageName="Marketplace"
      breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Marketplace" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={(session?.user as any)?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth" })}
    >
      <div className="mx-auto flex min-h-[55vh] max-w-3xl items-center justify-center">
        <section className="w-full rounded-xl border bg-card px-6 py-12 text-center shadow-sm sm:px-12">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Store className="h-7 w-7" />
          </div>
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" /> Coming Soon
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Marketplace</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            The Marketplace is being prepared. It will be available here soon.
          </p>
        </section>
      </div>
    </DashboardLayout>
  );
}
