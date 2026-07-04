"use client";

import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { SalesTabNav } from "@/components/sales/SalesTabNav";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Repeat, Plus, MoreHorizontal, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// Scaffold tab per the Sales module revamp spec: layout/empty-state now, full
// recurring-billing functionality is an explicit follow-up (no Subscription
// model/API exists yet).
export default function SubscriptionsPage() {
  const { data: session } = useSession();

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Subscriptions"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Subscriptions" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <SalesTabNav />

        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">All Subscriptions</h1>
          <div className="flex items-center gap-2">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" disabled title="Coming soon">
              <Plus className="w-4 h-4 mr-1" /> New
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => toast.info("Nothing to refresh yet")}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Refresh List
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
            <Repeat className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Recurring billing is coming soon</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Automate recurring invoices for your subscription customers. This area is reserved for that
            functionality in a follow-up release.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
