"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { DunningRuleForm, type DunningRuleFormValue } from "@/components/sales/subscriptions/DunningRuleForm";

export default function EditDunningRulePage() {
  const { data: session } = useSession();
  const params = useParams();
  const id = params?.id as string;
  const [value, setValue] = useState<DunningRuleFormValue | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/sales/dunning-rules/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setValue({
            name: d.data.name,
            criteria: d.data.criteria || [],
            paymentMethod: d.data.paymentMethod,
            autocharge: d.data.autocharge,
            manual: d.data.manual,
          });
        }
      });
  }, [id]);

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Edit Dunning Rule"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Subscriptions", href: "/sales/subscriptions" },
        { label: "Dunning Management", href: "/sales/subscriptions/settings/dunning" },
        { label: "Edit Rule" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6">
        {value ? (
          <DunningRuleForm initialValue={value} ruleId={id} />
        ) : (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
        )}
      </div>
    </DashboardLayout>
  );
}
