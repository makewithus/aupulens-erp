"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateGallery } from "@/components/sales/invoices/TemplateGallery";

export default function AwesomeTemplatesPage() {
  const { data: session } = useSession();
  const [category, setCategory] = useState<"invoice" | "purchase" | "quotation">("invoice");

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Awesome Templates"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Document Settings", href: "/sales/document-settings" }, { label: "Templates" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Awesome Templates</h1>
          <p className="text-sm text-muted-foreground">14 original, print-ready designs. Pick one, preview it live with sample data, and set it as your default.</p>
        </div>

        <Tabs value={category} onValueChange={(v) => setCategory(v as any)}>
          <TabsList>
            <TabsTrigger value="invoice">Invoices</TabsTrigger>
            <TabsTrigger value="purchase">Purchases</TabsTrigger>
            <TabsTrigger value="quotation">Quotations</TabsTrigger>
          </TabsList>
          <TabsContent value={category} className="mt-6">
            <TemplateGallery category={category} onSelect={() => {}} allowSetDefault />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
