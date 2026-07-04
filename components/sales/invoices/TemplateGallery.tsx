"use client";

import { useEffect, useState } from "react";
import { Check, Star } from "lucide-react";
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
    return <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>;
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
            "border-2 rounded-lg overflow-hidden transition-all cursor-pointer group",
            selectedKey === t.key ? "border-blue-500 shadow-md" : "border-border hover:border-blue-300",
          )}
          onClick={() => onSelect(t.key)}
        >
          <div className="relative aspect-[3/4] bg-muted/30 overflow-hidden">
            <iframe
              src={`/api/sales/invoice-templates/${t.key}/preview`}
              title={t.name}
              className="absolute top-0 left-0 pointer-events-none origin-top-left"
              style={{ width: "800px", height: "1100px", transform: "scale(0.32)" }}
            />
            {selectedKey === t.key && (
              <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-1">
                <Check className="w-3 h-3" />
              </div>
            )}
            {t.isSelected && (
              <div className="absolute top-2 left-2 bg-amber-500 text-white rounded-full p-1" title="Tenant default">
                <Star className="w-3 h-3" />
              </div>
            )}
          </div>
          <div className="p-2 border-t bg-card">
            <p className="text-sm font-medium truncate">{t.name}</p>
            <p className="text-xs text-muted-foreground truncate">{t.previewData?.description}</p>
            {allowSetDefault && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1 text-xs mt-1 text-blue-600"
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
