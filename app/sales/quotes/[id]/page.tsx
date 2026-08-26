"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { QuoteForm, EMPTY_QUOTE, type QuoteFormValue } from "@/components/sales/quotes/QuoteForm";
import { Loader2 } from "lucide-react";

export default function EditQuotePage() {
  const { data: session } = useSession();
  const params = useParams();
  const id = params.id as string;
  const [value, setValue] = useState<QuoteFormValue | null>(null);
  const [quoteNumber, setQuoteNumber] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sales/quotes/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const q = data.data;
        if (!q) return;
        setQuoteNumber(q.quoteNumber);
        setValue({
          ...EMPTY_QUOTE,
          customerId: q.customerId?._id || q.customerId,
          reference: q.reference,
          quoteDate: q.quoteDate ? new Date(q.quoteDate).toISOString().slice(0, 10) : EMPTY_QUOTE.quoteDate,
          expiryDate: q.expiryDate ? new Date(q.expiryDate).toISOString().slice(0, 10) : undefined,
          salesperson: q.salesperson,
          projectName: q.projectName,
          subject: q.subject,
          lineItems: q.lineItems?.length ? q.lineItems : EMPTY_QUOTE.lineItems,
          extraDiscount: q.extraDiscount || 0,
          extraDiscountMode: q.extraDiscountMode || "amount",
          taxes: q.taxes || EMPTY_QUOTE.taxes,
          adjustment: q.adjustment || 0,
          customerNotes: q.customerNotes || EMPTY_QUOTE.customerNotes,
          terms: q.terms,
        });
      })
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Edit Quote"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Quotes", href: "/sales/quotes" },
        { label: "Edit" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : value ? (
          <QuoteForm initialValue={value} quoteId={id} quoteNumber={quoteNumber} />
        ) : (
          <div className="py-16 text-center font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Quote not found</div>
        )}
      </div>
    </DashboardLayout>
  );
}
