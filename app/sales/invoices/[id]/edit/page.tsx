"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { InvoiceForm } from "@/components/sales/invoices/InvoiceForm";

export default function EditInvoicePage() {
  const params = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/sales/invoices/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setInvoice(data.data);
        else setError(data.message || "Invoice not found");
      })
      .catch(() => setError("Failed to load invoice"))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !invoice) {
    return <div className="flex justify-center items-center h-screen text-muted-foreground">{error || "Invoice not found"}</div>;
  }

  return <InvoiceForm mode="edit" invoiceId={params.id} initialInvoice={invoice} />;
}
