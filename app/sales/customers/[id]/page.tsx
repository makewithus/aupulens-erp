"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { CustomerForm, EMPTY_CUSTOMER, type CustomerFormValue } from "@/components/sales/customers/CustomerForm";
import { Loader2 } from "lucide-react";

export default function EditCustomerPage() {
  const { data: session } = useSession();
  const params = useParams();
  const id = params.id as string;
  const [value, setValue] = useState<CustomerFormValue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sales/customers/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const c = data.customer;
        if (!c) return;
        setValue({
          ...EMPTY_CUSTOMER,
          ...c,
          header: { ...EMPTY_CUSTOMER.header, ...c.header, displayName: c.header?.displayName || c.header?.name },
          contact_details: { ...EMPTY_CUSTOMER.contact_details, ...c.contact_details },
          accounting_tab: {
            property_account_receivable_id: c.accounting_tab?.property_account_receivable_id?.toString(),
          },
          sales_purchase_tab: {
            property_payment_term_id: c.sales_purchase_tab?.property_payment_term_id,
          },
          addresses: c.addresses?.length ? c.addresses : EMPTY_CUSTOMER.addresses,
          contactPersons: c.contactPersons || [],
          customFields: c.customFields || {},
          reportingTags: c.reportingTags || [],
          documents: c.documents || [],
        });
      })
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Edit Customer"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Customers", href: "/sales/customers" },
        { label: "Edit" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : value ? (
          <CustomerForm initialValue={value} customerId={id} />
        ) : (
          <div className="py-16 text-center font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Customer not found</div>
        )}
      </div>
    </DashboardLayout>
  );
}
