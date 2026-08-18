"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AuthSplash } from "@/components/dashboard/AuthSplash";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { toast } from "sonner";
import {
  ScanText,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  FileText,
} from "lucide-react";

/**
 * Document Intelligence (vNext Expansion Module 12).
 * Upload a vendor bill (PDF/image/DOCX) → OCR + AI extraction → review & edit
 * the structured fields → duplicate warning → confirm to create a DRAFT vendor
 * bill in Finance. Tenant-scoped server-side by /api/document-intelligence/*.
 */

interface LineItem { description: string; quantity: number; unitPrice: number; amount: number }
interface Extraction {
  vendorName: string; vendorGstin: string; billNumber: string; billDate: string; dueDate: string;
  currency: string; poReference: string; lineItems: LineItem[]; subtotal: number; taxAmount: number; totalAmount: number; confidence: number;
}
interface Dup { id: string; reason: string }
interface DocRow { _id: string; fileName: string; status: string; aiConfidence: number; createdAt: string; createdRecordId?: string }

const empty: Extraction = { vendorName: "", vendorGstin: "", billNumber: "", billDate: "", dueDate: "", currency: "INR", poReference: "", lineItems: [], subtotal: 0, taxAmount: 0, totalAmount: 0, confidence: 0 };

export default function DocIntelPage() {
  const { data: session, status } = useSession();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [active, setActive] = useState<{ id: string; ext: Extraction; dups: Dup[]; status: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/document-intelligence");
      const json = await res.json();
      if (json.success) setDocs(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const upload = async () => {
    if (!file) return toast.error("Choose a document");
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("docType", "vendor_bill");
      const res = await fetch("/api/document-intelligence/extract", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.success) return toast.error(json.message || "Extraction failed");
      toast.success(`Extracted with ${json.data.extraction.confidence}% confidence`);
      setFile(null);
      setActive({ id: json.data._id, ext: { ...empty, ...json.data.extraction }, dups: json.data.duplicates || [], status: json.data.status });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const open = async (id: string) => {
    const res = await fetch(`/api/document-intelligence/${id}`);
    const json = await res.json();
    if (!json.success) return toast.error("Failed to open");
    setActive({ id, ext: { ...empty, ...json.data.extraction }, dups: json.data.duplicates || [], status: json.data.status });
  };

  const set = (k: keyof Extraction, v: string | number) => {
    if (!active) return;
    setActive({ ...active, ext: { ...active.ext, [k]: v } });
  };

  const save = async () => {
    if (!active) return;
    setBusy("save");
    try {
      const res = await fetch(`/api/document-intelligence/${active.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ extraction: active.ext }),
      });
      const json = await res.json();
      if (!json.success) return toast.error(json.message || "Save failed");
      toast.success("Saved");
    } finally { setBusy(null); }
  };

  const confirm = async () => {
    if (!active) return;
    await save();
    setBusy("confirm");
    try {
      const res = await fetch(`/api/document-intelligence/${active.id}/confirm`, { method: "POST" });
      const json = await res.json();
      if (!json.success) return toast.error(json.message || "Confirm failed");
      toast.success(json.data.message);
      setActive({ ...active, status: "confirmed" });
      await load();
    } finally { setBusy(null); }
  };

  const del = async (id: string) => {
    if (!window.confirm("Delete this extracted document?")) return;
    await fetch(`/api/document-intelligence/${id}`, { method: "DELETE" });
    if (active?.id === id) setActive(null);
    await load();
  };

  if (status === "loading") return <AuthSplash />;

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      dashboardTitle="Admin"
      pageName="Document Intelligence"
      breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Document Intelligence" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={(session?.user as any)?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
      onRefresh={load}
    >
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ScanText className="h-6 w-6 text-violet-500" /> Document Intelligence
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a vendor bill — it&apos;s read with OCR + AI, checked for duplicates, and turned into a draft bill you review before posting.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4 mb-6">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Upload className="h-4 w-4" /> Upload a document</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-border bg-background hover:bg-accent px-4 py-2 text-sm font-medium transition-colors">
            <Upload className="h-4 w-4" />
            Choose file
            <input
              type="file"
              accept=".pdf,.docx,.txt,.csv,.png,.jpg,.jpeg,.webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
          <span className="text-sm text-muted-foreground truncate max-w-[220px]" title={file?.name}>
            {file ? file.name : "No file chosen"}
          </span>
          <button onClick={upload} disabled={busy === "upload" || !file} className="inline-flex items-center gap-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
            {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />} Extract
          </button>
          <span className="text-xs text-muted-foreground">PDF, image (OCR), DOCX, TXT/CSV</span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[300px_1fr]">
        {/* List */}
        <div className="rounded-xl border bg-card p-3">
          <h2 className="font-semibold mb-2 px-1">Processed</h2>
          {loading ? (
            <div className="p-3 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : docs.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">Nothing yet. Upload a document above.</p>
          ) : (
            <ul className="space-y-1">
              {docs.map((d) => (
                <li key={d._id} className="flex items-center gap-1">
                  <button onClick={() => open(d._id)} className={`flex-1 text-left rounded-md px-3 py-2 text-sm hover:bg-accent ${active?.id === d._id ? "bg-accent" : ""}`}>
                    <span className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      <span className="truncate">{d.fileName}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground ml-5">
                      {d.status === "confirmed" ? "✓ bill created" : `${d.aiConfidence}% conf`}
                    </span>
                  </button>
                  <button onClick={() => del(d._id)} className="text-muted-foreground hover:text-red-500 px-1" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Review */}
        <div className="rounded-xl border bg-card p-4">
          {!active ? (
            <p className="text-sm text-muted-foreground">Upload or select a document to review its extracted fields.</p>
          ) : (
            <div className="space-y-4">
              {active.dups.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-amber-600">Possible duplicate</p>
                    <ul className="text-xs text-muted-foreground list-disc ml-4 mt-1">
                      {active.dups.map((d) => <li key={d.id}>{d.reason}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              {active.status === "confirmed" && (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" /> A draft vendor bill was created from this document.
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Vendor Name" value={active.ext.vendorName} onChange={(v) => set("vendorName", v)} />
                <Field label="Vendor GSTIN" value={active.ext.vendorGstin} onChange={(v) => set("vendorGstin", v)} />
                <Field label="Bill Number" value={active.ext.billNumber} onChange={(v) => set("billNumber", v)} />
                <Field label="Bill Date" value={active.ext.billDate} onChange={(v) => set("billDate", v)} />
                <Field label="PO Reference" value={active.ext.poReference} onChange={(v) => set("poReference", v)} />
                <Field label="Currency" value={active.ext.currency} onChange={(v) => set("currency", v)} />
                <Field label="Subtotal" value={String(active.ext.subtotal)} onChange={(v) => set("subtotal", Number(v) || 0)} />
                <Field label="Tax Amount" value={String(active.ext.taxAmount)} onChange={(v) => set("taxAmount", Number(v) || 0)} />
                <Field label="Total Amount" value={String(active.ext.totalAmount)} onChange={(v) => set("totalAmount", Number(v) || 0)} />
              </div>

              <div>
                <h3 className="font-medium text-sm mb-2">Line items ({active.ext.lineItems.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 pr-3">Description</th><th className="py-1 pr-3">Qty</th><th className="py-1 pr-3">Unit</th><th className="py-1">Amount</th></tr></thead>
                    <tbody>
                      {active.ext.lineItems.map((l, i) => (
                        <tr key={i} className="border-t">
                          <td className="py-1 pr-3">{l.description}</td>
                          <td className="py-1 pr-3">{l.quantity}</td>
                          <td className="py-1 pr-3">{l.unitPrice}</td>
                          <td className="py-1">{l.amount}</td>
                        </tr>
                      ))}
                      {active.ext.lineItems.length === 0 && <tr><td colSpan={4} className="py-2 text-xs text-muted-foreground">No line items extracted.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={save} disabled={!!busy || active.status === "confirmed"} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50">
                  {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save edits"}
                </button>
                <button onClick={confirm} disabled={!!busy || active.status === "confirmed"} className="inline-flex items-center gap-1 rounded-md bg-violet-600 hover:bg-violet-700 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50">
                  {busy === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Create draft bill
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1">{label}</label>
      <input className="w-full border rounded-md px-3 py-2 bg-background text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
