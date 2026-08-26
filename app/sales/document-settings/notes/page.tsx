"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, FileText, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const DOCUMENT_TYPES = [
  { value: "invoice", label: "Invoice" },
  { value: "purchase", label: "Purchase" },
  { value: "salesReturn", label: "Sales Return" },
  { value: "purchaseReturn", label: "Purchase Return" },
  { value: "purchaseOrder", label: "Purchase Order" },
  { value: "deliveryChallan", label: "Delivery Challan" },
  { value: "salesOrder", label: "Sales Order" },
  { value: "quotation", label: "Quotation" },
];

interface Row { _id: string; title: string; content: string; kind: string; documentType: string; }

export default function DocumentNotesPage() {
  const { data: session } = useSession();
  const [kind, setKind] = useState<"notes" | "terms">("notes");
  const [docType, setDocType] = useState("invoice");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRows = () => {
    setLoading(true);
    fetch(`/api/sales/document-notes?kind=${kind}&documentType=${docType}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setRows(d.data); })
      .finally(() => setLoading(false));
  };

  useEffect(fetchRows, [kind, docType]);

  const create = async () => {
    if (!title.trim()) return toast.error("Title is required");
    setSaving(true);
    try {
      const res = await fetch("/api/sales/document-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, documentType: docType, title, content }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Saved");
        setTitle(""); setContent(""); setDialogOpen(false);
        fetchRows();
      } else toast.error(data.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/sales/document-notes/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) { toast.success("Deleted"); fetchRows(); }
  };

  const docLabel = DOCUMENT_TYPES.find((d) => d.value === docType)?.label;

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Notes and Terms"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Document Settings", href: "/sales/document-settings" }, { label: "Notes and Terms" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">Document Notes</h1>
          <Button className="font-mono text-[11px] uppercase tracking-wider" onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" /> New {docLabel} {kind === "notes" ? "Notes" : "Terms"}</Button>
        </div>

        <Tabs value={kind} onValueChange={(v) => setKind(v as any)}>
          <TabsList className="rounded-none">
            <TabsTrigger value="notes" className="rounded-none">Notes</TabsTrigger>
            <TabsTrigger value="terms" className="rounded-none">Terms</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={docType} onValueChange={setDocType}>
          <SelectTrigger className="w-56 rounded-none border-border/40"><SelectValue /></SelectTrigger>
          <SelectContent className="rounded-none">
            {DOCUMENT_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="bg-card border border-border/40 rounded-none divide-y divide-border/30">
          {loading ? (
            <div className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="p-16 text-center">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground text-sm">No {docLabel?.toLowerCase()} {kind} yet.</p>
            </div>
          ) : (
            rows.map((r) => (
              <div key={r._id} className="p-4 flex justify-between items-start">
                <div>
                  <p className="font-medium">{r.title}</p>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.content}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(r._id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New {docLabel} {kind === "notes" ? "Notes" : "Terms"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Standard Note)" />
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Content" className="h-32" />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-none border-border/40 font-mono text-[11px] uppercase tracking-wider" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving} className="font-mono text-[11px] uppercase tracking-wider">{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
