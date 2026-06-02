"use client";

import { useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import {
  StatsRowSkeleton,
  TableSkeleton,
} from "@/components/ui/loading-skeletons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function InventoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/inventory");
    } else if (status === "authenticated") {
      if (
        session?.user?.role === "inventory" ||
        session?.user?.role === "admin"
      ) {
        // Redirect to summary (Dashboard) but show skeleton meanwhile
        router.push("/inventory/summary");
      } else {
        router.push("/auth/inventory");
      }
    }
  }, [status, router, session]);

  // Skeleton UI that matches /inventory/summary
  return (
    <DashboardLayout
      sidebarSections={inventorySidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Inventory Dashboard"
      pageName="Inventory"
      breadcrumbs={[{ label: "Dashboard", href: "/inventory/summary" }]}
      userName={session?.user?.name || "User"}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role || "inventory"}
      onSignOut={() => signOut({ callbackUrl: "/auth/inventory" })}
    >
      <div className="space-y-6">
        <div>
          <div className="h-9 w-72 bg-muted animate-pulse rounded mb-2" />
          <div className="h-5 w-96 bg-muted animate-pulse rounded" />
        </div>
        <StatsRowSkeleton count={4} />
        <Card>
          <CardHeader>
            <div className="h-6 w-48 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <TableSkeleton rows={5} columns={3} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
