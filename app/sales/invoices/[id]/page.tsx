"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, MessageCircle, Pencil, Trash2, IndianRupee, Loader2 } from "lucide-react";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  paid: "text-emerald-500",
  partially_paid: "text-amber-500",
  draft: "text-muted-foreground",
  saved: "text-blue-500",
  overdue: "text-red-500",
};

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

  const whatsappShare = async () => {
    // Mint a signed, time-limited PUBLIC link (Phase 5) so the recipient —
    // who has no ERP login — can actually open the invoice. Previously this
    // shared the session-gated /pdf route, which 401'd for any external
    // recipient.
    let url = "";
    try {
      const res = await fetch(`/api/sales/invoices/${params.id}/share-link`, { method: "POST" });
      const data = await res.json();
      if (data.success) url = data.data.url;
    } catch {
      /* fall through to the toast below */
    }
    if (!url) {
      toast.error("Could not generate a shareable link. Please try again.");
      return;
    }
    const message = encodeURIComponent(`Here is your invoice ${invoice?.number}: ${url}`);
    window.open(`https://wa.me/?text=${message}`, "_blank");
  };

  if (loading) {
    return (
      <DashboardLayout sidebarSections={salesSidebarConfig} companyName="Aupulens" dashboardTitle="Sales" pageName="Invoice">
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/sales/invoices"><Button variant="ghost" size="icon" className="rounded-none hover:bg-white/5"><ArrowLeft className="w-5 h-5" /></Button></Link>
            <div>
              <h1 className="text-3xl font-black tracking-tighter text-primary">{invoice.number}</h1>
              <Badge className={`rounded-none border-0 bg-transparent px-0 font-mono text-[11px] uppercase tracking-[0.12em] hover:bg-transparent shadow-none ${statusColors[invoice.status] || "text-muted-foreground"}`}>
                {invoice.status.replace("_", " ")}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="h-9 rounded-none border-border/40 font-mono text-[11px] uppercase tracking-wider" onClick={whatsappShare}>
              <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
            </Button>
            <a href={`/api/sales/invoices/${invoice._id}/pdf`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="h-9 rounded-none border-border/40 font-mono text-[11px] uppercase tracking-wider">
                <Download className="w-4 h-4 mr-2" /> Print / Save as PDF
              </Button>
            </a>
            {["saved", "overdue", "partially_paid"].includes(invoice.status) && (
              <Link href={`/sales/payments/new?customerId=${invoice.customerId?._id || invoice.customerId}&invoiceId=${invoice._id}`}>
                <Button size="sm" className="h-9 rounded-none bg-primary text-primary-foreground font-mono text-[11px] uppercase tracking-wider hover:bg-primary/95">
                  <IndianRupee className="w-4 h-4 mr-2" /> Record Payment
                </Button>
              </Link>
            )}
            <Link href={`/sales/invoices/${invoice._id}/edit`}>
              <Button size="sm" className="none-xl h-9 px-4 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[11px] uppercase tracking-wider rounded-none cursor-pointer">
                <Pencil className="w-4 h-4 mr-2" /> Edit
              </Button>
            </Link>
            <Button variant="destructive" size="sm" className="h-9 rounded-none font-mono text-[11px] uppercase tracking-wider" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
          </div>
        </div>

        <div className="bg-card border border-border/40 rounded-none p-4">
          {previewHtml ? (
            <div
              style={{ width: previewOrientation === "landscape" ? "297mm" : "210mm", margin: "0 auto" }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : (
            <div className="flex justify-center items-center h-64 gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading preview…
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
