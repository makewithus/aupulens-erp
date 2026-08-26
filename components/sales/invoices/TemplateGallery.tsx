"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Star, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface GalleryTemplate {
  _id: string;
  key: string;
  name: string;
  category: string;
  isSelected?: boolean;
  previewData?: { description?: string };
}

// Renders the template's live HTML fragment scaled down to a thumbnail. Not
// an <iframe> — this app's CSP sends `frame-ancestors 'none'` +
// `X-Frame-Options: DENY` on every response, which blocks framing even
// same-origin content, so an iframe here always showed a blank grey box.
// The preview route now returns the same self-contained fragment the PDF
// route renders (see renderInvoiceTemplateFragment), so this is guaranteed
// to match the printed PDF and is safe to inject directly (server-rendered
// from the tenant's own escaped data, no user-supplied script).
function TemplatePreviewThumbnail({ templateKey }: { templateKey: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sales/invoice-templates/${templateKey}/preview`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.success) {
          setHtml(d.data.html);
          setOrientation(d.data.orientation || "portrait");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [templateKey]);

  const baseWidth = orientation === "landscape" ? 1100 : 800;
  const baseHeight = orientation === "landscape" ? 800 : 1100;

  // Scale the page to exactly fit the card width (responsive), so the preview is
  // crisp and fills the card instead of a fixed 0.32 that clipped/cramped it.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / baseWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [baseWidth]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      {!html ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
      ) : (
        <div
          className="absolute top-0 left-0 pointer-events-none origin-top-left"
          style={{ width: baseWidth, height: baseHeight, transform: `scale(${scale})` }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

export function TemplateGallery({
  category = "invoice",
  selectedKey,
  onSelect,
  allowSetDefault = true,
}: {
  category?: "invoice" | "purchase" | "quotation";
  selectedKey?: string;
  onSelect: (key: string) => void;
  allowSetDefault?: boolean;
}) {
  const [templates, setTemplates] = useState<GalleryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sales/invoice-templates?category=${category}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setTemplates(d.data);
      })
      .finally(() => setLoading(false));
  }, [category]);

  const setDefault = async (t: GalleryTemplate) => {
    setSettingDefault(t.key);
    try {
      const res = await fetch("/api/sales/invoice-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: t._id, category }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${t.name} set as default template`);
        setTemplates((prev) => prev.map((x) => ({ ...x, isSelected: x.key === t.key })));
      }
    } finally {
      setSettingDefault(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        No {category} templates yet — the 14 Awesome Templates currently ship for Invoices only.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {templates.map((t) => (
        <div
          key={t.key}
          className={cn(
            "border-2 rounded-none overflow-hidden transition-all cursor-pointer group",
            selectedKey === t.key ? "border-primary shadow-none" : "border-border/40 hover:border-primary/50",
          )}
          onClick={() => onSelect(t.key)}
        >
          <div className="relative aspect-3/4 bg-muted/30 overflow-hidden">
            <TemplatePreviewThumbnail templateKey={t.key} />
            {selectedKey === t.key && (
              <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                <Check className="w-3 h-3" />
              </div>
            )}
            {t.isSelected && (
              <div className="absolute top-2 left-2 bg-amber-500 text-white rounded-full p-1" title="Tenant default">
                <Star className="w-3 h-3" />
              </div>
            )}
          </div>
          <div className="p-2 border-t border-border/40 bg-card">
            <p className="text-sm font-medium truncate">{t.name}</p>
            <p className="text-xs text-muted-foreground truncate">{t.previewData?.description}</p>
            {allowSetDefault && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1 text-xs mt-1 text-primary"
                disabled={settingDefault === t.key}
                onClick={(e) => { e.stopPropagation(); setDefault(t); }}
              >
                Set as default
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
