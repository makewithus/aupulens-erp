"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { toast } from "sonner";
import { Loader2, Save, Palette } from "lucide-react";
import { ScaledHtmlPreview } from "@/components/sales/ScaledHtmlPreview";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";

/**
 * Print-Format Builder (6.3 Low-Code Customization) — sits on top of the
 * existing invoice-template selection system. Pick a base template and tweak
 * the print format (accent colour, striped rows, HSN visibility, font, footer
 * note) with a LIVE preview that re-renders as you change things, then save.
 * Saving persists the options to DocumentSettings (which the PDF/preview
 * renderer already consumes) and sets the chosen template as the default.
 */
const FONTS = ["Stylish", "Classic", "Modern", "Compact"];

export default function PrintFormatBuilder() {
  const { data: session } = useSession();
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateKey, setTemplateKey] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewing, setPreviewing] = useState(false);

  const [opts, setOpts] = useState({
    accentColor: "#276EF1",
    showStripedRows: false,
    hideHsn: false,
    fontStyle: "Stylish",
    pdfFooterText: "",
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [tRes, sRes] = await Promise.all([
          fetch("/api/sales/invoice-templates?category=invoice").then((r) => r.json()),
          fetch("/api/sales/document-settings").then((r) => r.json()),
        ]);
        const tmpls = tRes.success ? tRes.data : [];
        setTemplates(tmpls);
        const selected = tmpls.find((t: any) => t.isSelected) || tmpls[0];
        if (selected) { setTemplateKey(selected.key); setTemplateId(String(selected._id)); }
        const s = sRes.data || sRes;
        setOpts((o) => ({
          ...o,
          accentColor: s?.branding?.accentColor || o.accentColor,
          pdfFooterText: s?.branding?.pdfFooterText || "",
          showStripedRows: s?.display?.showStripedRows ?? o.showStripedRows,
          hideHsn: s?.display?.hideHsn ?? o.hideHsn,
          fontStyle: s?.layout?.fontStyle || o.fontStyle,
        }));
      } finally { setLoading(false); }
    })();
  }, []);

  const renderPreview = useCallback(async () => {
    if (!templateKey) return;
    setPreviewing(true);
    try {
      const res = await fetch(`/api/sales/invoice-templates/${templateKey}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overrides: {
            branding: { accentColor: opts.accentColor, pdfFooterText: opts.pdfFooterText },
            display: { showStripedRows: opts.showStripedRows, hideHsn: opts.hideHsn },
            layout: { fontStyle: opts.fontStyle },
          },
        }),
      });
      const json = await res.json();
      if (json.success) setPreviewHtml(json.data.html);
    } finally { setPreviewing(false); }
  }, [templateKey, opts]);

  // Debounced live preview whenever the template or options change.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(renderPreview, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [renderPreview]);

  const save = async () => {
    setSaving(true);
    try {
      const settingsRes = await fetch("/api/sales/document-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branding: { accentColor: opts.accentColor, pdfFooterText: opts.pdfFooterText },
          display: { showStripedRows: opts.showStripedRows, hideHsn: opts.hideHsn },
          layout: { fontStyle: opts.fontStyle },
        }),
      });
      if (templateId) {
        await fetch("/api/sales/invoice-templates", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId, category: "invoice" }),
        });
      }
      if (settingsRes.ok) toast.success("Print format saved. It now applies to your invoice PDFs.");
      else toast.error("Failed to save print format.");
    } catch { toast.error("Failed to save print format."); } finally { setSaving(false); }
  };

  const layoutProps = {
    sidebarSections: salesSidebarConfig,
    dashboardTitle: "Sales",
    pageName: "Print-Format Builder",
    breadcrumbs: [{ label: "Sales", href: "/sales/summary" }, { label: "Print-Format Builder" }],
    userName: session?.user?.name || "",
    userEmail: session?.user?.email || "",
    userRole: (session?.user as any)?.role,
    onSignOut: () => signOut({ callbackUrl: "/auth/sales" }),
  };

  if (loading) return (
    <DashboardLayout {...layoutProps}>
      <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout {...layoutProps}>
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Palette className="h-6 w-6 text-indigo-500" /> Print-Format Builder</h1>
          <p className="text-sm text-muted-foreground mt-1">Customize your invoice print format with a live preview, then save.</p>
        </div>
        <Link href="/sales/invoices/templates" className="text-xs text-muted-foreground hover:text-foreground">Template gallery</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Controls */}
        <div className="space-y-4">
          <div className="border-2 rounded-xl p-4 space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Base template</label>
            <select
              value={templateKey}
              onChange={(e) => {
                setTemplateKey(e.target.value);
                const t = templates.find((x) => x.key === e.target.value);
                if (t) setTemplateId(String(t._id));
              }}
              className="w-full text-sm border rounded-md px-2 py-1.5 bg-transparent"
            >
              {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
          </div>

          <div className="border-2 rounded-xl p-4 space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Accent colour</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={opts.accentColor} onChange={(e) => setOpts({ ...opts, accentColor: e.target.value })} className="h-8 w-12 rounded border" />
                <input value={opts.accentColor} onChange={(e) => setOpts({ ...opts, accentColor: e.target.value })} className="flex-1 text-sm border rounded px-2 py-1 bg-transparent font-mono" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Font style</label>
              <select value={opts.fontStyle} onChange={(e) => setOpts({ ...opts, fontStyle: e.target.value })} className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background text-foreground mt-1 [&>option]:bg-background [&>option]:text-foreground">
                {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={opts.showStripedRows} onChange={(e) => setOpts({ ...opts, showStripedRows: e.target.checked })} /> Striped table rows
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={opts.hideHsn} onChange={(e) => setOpts({ ...opts, hideHsn: e.target.checked })} /> Hide HSN/SAC column
            </label>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Footer note</label>
              <textarea value={opts.pdfFooterText} onChange={(e) => setOpts({ ...opts, pdfFooterText: e.target.value })} rows={2} placeholder="e.g. Thank you for your business" className="w-full text-sm border rounded px-2 py-1 bg-transparent mt-1" />
            </div>
          </div>

          <button onClick={save} disabled={saving} className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save print format"}
          </button>
        </div>

        {/* Live preview — scaled to fit the panel width so the whole page is
            clear, and re-rendered live as options change. */}
        <div className="border-2 rounded-xl p-4 bg-white overflow-auto relative" style={{ minHeight: 500 }}>
          {previewing && <div className="absolute top-3 right-3 text-xs text-muted-foreground flex items-center gap-1 z-10"><Loader2 className="h-3 w-3 animate-spin" /> updating…</div>}
          {previewHtml
            ? <ScaledHtmlPreview html={previewHtml} className="w-full" />
            : <div className="text-sm text-muted-foreground flex items-center justify-center h-full">Preview will appear here.</div>}
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}
