"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Check, X, Loader2 } from "lucide-react";
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

interface Row { _id: string; value: string; isDefault: boolean; documentType: string; kind: string; }

export default function PrefixesSuffixesPage() {
  const { data: session } = useSession();
  const [kind, setKind] = useState<"prefix" | "suffix">("prefix");
  const [docType, setDocType] = useState("invoice");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [newValue, setNewValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const fetchRows = () => {
    setLoading(true);
    fetch(`/api/sales/document-prefixes?documentType=${docType}&kind=${kind}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setRows(d.data); })
      .finally(() => setLoading(false));
  };

  useEffect(fetchRows, [kind, docType]);

  const addRow = async () => {
    if (!newValue.trim()) return;
    const res = await fetch("/api/sales/document-prefixes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentType: docType, kind, value: newValue.trim() }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success("Added");
      setNewValue("");
      fetchRows();
    } else {
      toast.error(data.message);
    }
  };

  const setDefault = async (id: string) => {
    const res = await fetch(`/api/sales/document-prefixes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    const data = await res.json();
    if (data.success) { toast.success("Default updated"); fetchRows(); }
  };

  const saveEdit = async (id: string) => {
    const res = await fetch(`/api/sales/document-prefixes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: editValue }),
    });
    const data = await res.json();
    if (data.success) { setEditingId(null); fetchRows(); }
    else toast.error(data.message);
  };

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Prefixes / Suffixes"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Document Settings", href: "/sales/document-settings" }, { label: "Prefixes / Suffixes" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">Document Prefixes / Suffixes</h1>

        <Tabs value={kind} onValueChange={(v) => setKind(v as any)}>
          <TabsList>
            <TabsTrigger value="prefix">Prefixes</TabsTrigger>
            <TabsTrigger value="suffix">Suffixes</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap gap-2">
          {DOCUMENT_TYPES.map((d) => (
            <button
              key={d.value}
              onClick={() => setDocType(d.value)}
              className={`font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-none border ${docType === d.value ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border/40 text-muted-foreground"}`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="bg-card border border-border/40 rounded-none overflow-hidden">
          <div className="divide-y divide-border/30">
            {loading ? (
              <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">No {kind}es yet for {DOCUMENT_TYPES.find((d) => d.value === docType)?.label}.</div>
            ) : (
              rows.map((row) => (
                <div key={row._id} className="flex items-center justify-between p-4 group transition-colors duration-300 hover:bg-white/[0.015]">
                  {editingId === row._id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="h-8 w-40" />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEdit(row._id)}><Check className="h-4 w-4 text-emerald-500" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <span className="font-medium text-foreground/80">{row.value}</span>
                  )}
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      Default <Switch checked={row.isDefault} onCheckedChange={() => setDefault(row._id)} />
                    </label>
                    {editingId !== row._id && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(row._id); setEditValue(row.value); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="p-4 border-t border-border/40 flex items-center gap-2 bg-muted/20">
            <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder={kind === "prefix" ? "e.g. INV-" : "e.g. -A"} className="h-9 w-48" onKeyDown={(e) => e.key === "Enter" && addRow()} />
            <Button onClick={addRow} size="sm" className="font-mono text-[11px] uppercase tracking-wider"><Plus className="w-4 h-4 mr-1" /> Add {kind === "prefix" ? "Prefix" : "Suffix"}</Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
