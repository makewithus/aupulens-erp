"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, MessageCircle, Pencil, Trash2, IndianRupee } from "lucide-react";
import { toast } from "sonner";

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewOrientation, setPreviewOrientation] = useState<"portrait" | "landscape">("portrait");

  useEffect(() => {
    fetch(`/api/sales/invoices/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setInvoice(data.data);
        else toast.error(data.message || "Invoice not found");
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  // Renders the invoice through the same template fragment the PDF route
  // produces, injected directly rather than framed — this app's CSP sends
  // `frame-ancestors 'none'` + `X-Frame-Options: DENY` on every response,
  // which blocks framing even same-origin content, so an <iframe> pointed
  // at the PDF route always showed a blank box here.
  useEffect(() => {
    fetch(`/api/sales/invoices/${params.id}/pdf?embed=1`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setPreviewHtml(data.data.html);
          setPreviewOrientation(data.data.orientation || "portrait");
        }
      })
      .catch(() => {});
  }, [params.id]);

  const handleDelete = async () => {
    if (!confirm("Delete this invoice? This cannot be undone.")) return;
    const res = await fetch(`/api/sales/invoices/${params.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      toast.success("Invoice deleted");
      router.push("/sales/invoices");
    } else {
      toast.error(data.message || "Failed to delete invoice");
    }
  };

  const whatsappShare = () => {
    const url = `${window.location.origin}/api/sales/invoices/${params.id}/pdf`;
    const message = encodeURIComponent(`Here is your invoice ${invoice?.number}: ${url}`);
    window.open(`https://wa.me/?text=${message}`, "_blank");
  };

  if (loading) {
    return (
      <DashboardLayout sidebarSections={salesSidebarConfig} companyName="Aupulens" dashboardTitle="Sales" pageName="Invoice">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!invoice) {
    return (
      <DashboardLayout sidebarSections={salesSidebarConfig} companyName="Aupulens" dashboardTitle="Sales" pageName="Invoice">
        <div className="p-10 text-center text-muted-foreground">Invoice not found.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName={invoice.number}
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Invoices", href: "/sales/invoices" }, { label: invoice.number }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/sales/invoices"><Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button></Link>
            <div>
              <h1 className="text-xl font-bold">{invoice.number}</h1>
              <p className="text-sm text-muted-foreground capitalize">{invoice.status.replace("_", " ")}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={whatsappShare}><MessageCircle className="w-4 h-4 mr-2" /> WhatsApp</Button>
            <a href={`/api/sales/invoices/${invoice._id}/pdf`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-2" /> Download PDF</Button>
            </a>
            {["saved", "overdue", "partially_paid"].includes(invoice.status) && (
              <Link href={`/sales/payments/new?customerId=${invoice.customerId?._id || invoice.customerId}&invoiceId=${invoice._id}`}>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                  <IndianRupee className="w-4 h-4 mr-2" /> Record Payment
                </Button>
              </Link>
            )}
            <Link href={`/sales/invoices/${invoice._id}/edit`}><Button size="sm"><Pencil className="w-4 h-4 mr-2" /> Edit</Button></Link>
            <Button variant="destructive" size="sm" onClick={handleDelete}><Trash2 className="w-4 h-4 mr-2" /> Delete</Button>
          </div>
        </div>

        <div className="bg-card border rounded-lg p-4">
          {previewHtml ? (
            <div
              style={{ width: previewOrientation === "landscape" ? "297mm" : "210mm", margin: "0 auto" }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : (
            <div className="flex justify-center items-center h-64 text-muted-foreground text-sm">Loading preview…</div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
