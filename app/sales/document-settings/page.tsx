"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Palette, FileText, Settings, Hash, MessageSquare, Save, Plus, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "display", label: "Display" },
  { id: "layout", label: "Layout & Fonts" },
  { id: "export", label: "Export" },
  { id: "branding", label: "Branding" },
  { id: "labels", label: "Customize Labels" },
  { id: "templates-comm", label: "Email/WhatsApp" },
];

const DOC_TYPES_FOR_HSN = ["invoice", "purchase", "quotation", "deliveryChallan"];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <Label className="font-normal text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function DocumentSettingsPage() {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState("display");
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState("");

  const refs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    display: useRef(null), layout: useRef(null), export: useRef(null),
    branding: useRef(null), labels: useRef(null), "templates-comm": useRef(null),
  };

  useEffect(() => {
    fetch("/api/sales/document-settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setSettings(data.data);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Failed to load settings");
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/sales/document-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Settings saved successfully");
        setSettings(data.data);
      } else {
        toast.error(data.message || "Failed to save settings");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (section: string, field: string, value: any) => {
    setSettings((prev: any) => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
  };

  const scrollTo = (id: string) => {
    setActiveSection(id);
    refs[id]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleHsnDoc = (type: string) => {
    const current: string[] = settings?.display?.showHsnSummaryOn || [];
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type];
    updateSetting("display", "showHsnSummaryOn", next);
  };

  const handleImageUpload = (section: "branding", field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateSetting(section, field, reader.result as string);
    reader.readAsDataURL(file);
  };

  const openCustomFields = () => {
    setCustomFieldsOpen(true);
    fetch("/api/sales/custom-fields").then((r) => r.json()).then((d) => { if (d.success) setCustomFields(d.data); });
  };

  const addCustomField = async () => {
    if (!newFieldLabel.trim()) return;
    const res = await fetch("/api/sales/custom-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newFieldLabel.trim(), fieldType: "text" }),
    });
    const data = await res.json();
    if (data.success) {
      setCustomFields((f) => [data.data, ...f]);
      setNewFieldLabel("");
    } else toast.error(data.message);
  };

  if (loading) {
    return (
      <DashboardLayout sidebarSections={salesSidebarConfig} companyName="Aupulens" dashboardTitle="Sales" pageName="Document Settings">
        <div className="flex justify-center items-center h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Document Settings"
      breadcrumbs={[{ label: "Sales", href: "/sales/summary" }, { label: "Document Settings" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-5xl mx-auto space-y-6 pb-24">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Document Settings</h1>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Save className="w-4 h-4 mr-2" /> {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-4">
          <Link href="/sales/invoices/templates">
            <Button variant="outline" className="h-24 w-full flex flex-col items-center justify-center gap-2 border-dashed">
              <Palette className="w-6 h-6 text-blue-500" /> <span className="font-medium">Invoice Templates</span>
            </Button>
          </Link>
          <Button variant="outline" onClick={openCustomFields} className="h-24 flex flex-col items-center justify-center gap-2 border-dashed">
            <FileText className="w-6 h-6 text-green-500" /> <span className="font-medium">Custom Fields</span>
          </Button>
          <Link href="/sales/document-settings/prefixes">
            <Button variant="outline" className="h-24 w-full flex flex-col items-center justify-center gap-2 border-dashed">
              <Hash className="w-6 h-6 text-purple-500" /> <span className="font-medium">Prefixes / Suffixes</span>
            </Button>
          </Link>
          <Link href="/sales/document-settings/notes">
            <Button variant="outline" className="h-24 w-full flex flex-col items-center justify-center gap-2 border-dashed">
              <MessageSquare className="w-6 h-6 text-orange-500" /> <span className="font-medium">Notes and Terms</span>
            </Button>
          </Link>
        </div>

        {/* Anchor tab bar */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b flex gap-1 py-2">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md font-medium",
                activeSection === s.id ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* DISPLAY */}
        <section ref={refs.display} id="display" className="bg-card rounded-lg border p-6 space-y-8 scroll-mt-16">
          <h2 className="text-lg font-bold">Display</h2>

          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">General</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2">
              <Row label="Show Images"><Switch checked={settings?.display?.showImages} onCheckedChange={(v) => updateSetting("display", "showImages", v)} /></Row>
              <Row label="Show Net Balance"><Switch checked={settings?.display?.showNetBalance} onCheckedChange={(v) => updateSetting("display", "showNetBalance", v)} /></Row>
              <Row label="Show Due Date"><Switch checked={settings?.display?.showDueDate} onCheckedChange={(v) => updateSetting("display", "showDueDate", v)} /></Row>
              <Row label="Show Dispatch Address"><Switch checked={settings?.display?.showDispatchAddress} onCheckedChange={(v) => updateSetting("display", "showDispatchAddress", v)} /></Row>
              <Row label="Show Payments"><Switch checked={settings?.display?.showPayments} onCheckedChange={(v) => updateSetting("display", "showPayments", v)} /></Row>
              <Row label="Show Round Off"><Switch checked={settings?.display?.showRoundOff} onCheckedChange={(v) => updateSetting("display", "showRoundOff", v)} /></Row>
              <Row label="Show Receiver's Signature"><Switch checked={settings?.display?.showReceiverSignature} onCheckedChange={(v) => updateSetting("display", "showReceiverSignature", v)} /></Row>
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Quantities</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2">
              <Row label="Hide Quantity"><Switch checked={settings?.display?.hideQuantity} onCheckedChange={(v) => updateSetting("display", "hideQuantity", v)} /></Row>
              <Row label="Show Quantity with 3 decimals"><Switch checked={settings?.display?.showQuantity3Decimals} onCheckedChange={(v) => updateSetting("display", "showQuantity3Decimals", v)} /></Row>
              <Row label="Show Quantity Conversion Rate"><Switch checked={settings?.display?.showQuantityConversionRate} onCheckedChange={(v) => updateSetting("display", "showQuantityConversionRate", v)} /></Row>
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Pricing & Discounts</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2">
              <Row label="Hide Discount"><Switch checked={settings?.display?.hideDiscount} onCheckedChange={(v) => updateSetting("display", "hideDiscount", v)} /></Row>
              <Row label="Show Discount Column"><Switch checked={settings?.display?.showDiscountColumn} onCheckedChange={(v) => updateSetting("display", "showDiscountColumn", v)} /></Row>
              <Row label="Decimals for item prices">
                <Select value={String(settings?.display?.priceDecimals)} onValueChange={(v) => updateSetting("display", "priceDecimals", Number(v))}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4, 5, 6].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Row>
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Company & HSN/SAC</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-4">
              <Row label="Hide HSN/SAC"><Switch checked={settings?.display?.hideHsn} onCheckedChange={(v) => updateSetting("display", "hideHsn", v)} /></Row>
              <Row label="Show Company Details"><Switch checked={settings?.display?.showCompanyDetails} onCheckedChange={(v) => updateSetting("display", "showCompanyDetails", v)} /></Row>
              <Row label="Show HSN/SAC Summary"><Switch checked={settings?.display?.showHsnSummary} onCheckedChange={(v) => updateSetting("display", "showHsnSummary", v)} /></Row>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Show HSN/SAC Summary on</p>
              <div className="flex flex-wrap gap-2">
                {DOC_TYPES_FOR_HSN.map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleHsnDoc(t)}
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-full border capitalize",
                      settings?.display?.showHsnSummaryOn?.includes(t) ? "bg-blue-600 text-white border-blue-600" : "bg-background border-border text-muted-foreground",
                    )}
                  >
                    {t.replace(/([A-Z])/g, " $1").trim()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* LAYOUT & FONTS */}
        <section ref={refs.layout} id="layout" className="bg-card rounded-lg border p-6 space-y-6 scroll-mt-16">
          <h2 className="text-lg font-bold">Layout & Fonts</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold">Language & Font</h3>
              <div className="space-y-1">
                <Label className="text-xs">Select Language</Label>
                <Select value={settings?.layout?.language} onValueChange={(v) => updateSetting("layout", "language", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="English">English</SelectItem><SelectItem value="Hindi">Hindi</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Select Font Style</Label>
                <Select value={settings?.layout?.fontStyle} onValueChange={(v) => updateSetting("layout", "fontStyle", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Stylish">Stylish (Inter)</SelectItem>
                    <SelectItem value="Classic">Classic (Roboto)</SelectItem>
                    <SelectItem value="Serif">Serif (Merriweather)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">PDF Font Size</Label>
                <Select value={settings?.layout?.pdfFontSize} onValueChange={(v) => updateSetting("layout", "pdfFontSize", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Small">Small</SelectItem><SelectItem value="Normal">Normal</SelectItem><SelectItem value="Large">Large</SelectItem></SelectContent>
                </Select>
              </div>
            </div>

            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold">Page Setup</h3>
              <div className="space-y-1">
                <Label className="text-xs">PDF Orientation</Label>
                <Select value={settings?.layout?.pdfOrientation} onValueChange={(v) => updateSetting("layout", "pdfOrientation", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Portrait">Portrait</SelectItem><SelectItem value="Landscape">Landscape</SelectItem></SelectContent>
                </Select>
              </div>
              <Row label="Repeat Header"><Switch checked={settings?.layout?.repeatHeader} onCheckedChange={(v) => updateSetting("layout", "repeatHeader", v)} /></Row>
            </div>

            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold">Table & Content</h3>
              <Row label="Enable Item Headers"><Switch checked={settings?.layout?.enableItemHeaders} onCheckedChange={(v) => updateSetting("layout", "enableItemHeaders", v)} /></Row>
              <Row label="Show full page"><Switch checked={settings?.layout?.showFullPage} onCheckedChange={(v) => updateSetting("layout", "showFullPage", v)} /></Row>
              <Row label="Show Striped Rows"><Switch checked={settings?.layout?.showStripedRows} onCheckedChange={(v) => updateSetting("layout", "showStripedRows", v)} /></Row>
            </div>

            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold">Margins (px)</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-xs text-muted-foreground">Top (max 250)</span><Input type="number" max={250} value={settings?.layout?.marginTop} onChange={(e) => updateSetting("layout", "marginTop", Number(e.target.value))} /></div>
                <div><span className="text-xs text-muted-foreground">Bottom (max 250)</span><Input type="number" max={250} value={settings?.layout?.marginBottom} onChange={(e) => updateSetting("layout", "marginBottom", Number(e.target.value))} /></div>
                <div><span className="text-xs text-muted-foreground">Left (10-60)</span><Input type="number" min={10} max={60} value={settings?.layout?.marginLeft} onChange={(e) => updateSetting("layout", "marginLeft", Number(e.target.value))} /></div>
                <div><span className="text-xs text-muted-foreground">Right (10-60)</span><Input type="number" min={10} max={60} value={settings?.layout?.marginRight} onChange={(e) => updateSetting("layout", "marginRight", Number(e.target.value))} /></div>
              </div>
            </div>
          </div>
        </section>

        {/* EXPORT */}
        <section ref={refs.export} id="export" className="bg-card rounded-lg border p-6 space-y-4 scroll-mt-16">
          <h2 className="text-lg font-bold">Export</h2>
          <div className="max-w-md space-y-2">
            <Row label="Show Conversion Factor"><Switch checked={settings?.export?.showConversionFactor} onCheckedChange={(v) => updateSetting("export", "showConversionFactor", v)} /></Row>
            <Row label="Show in INR"><Switch checked={settings?.export?.showInInr} onCheckedChange={(v) => updateSetting("export", "showInInr", v)} /></Row>
          </div>
        </section>

        {/* BRANDING */}
        <section ref={refs.branding} id="branding" className="bg-card rounded-lg border p-6 space-y-6 scroll-mt-16">
          <h2 className="text-lg font-bold">Branding</h2>

          <div className="max-w-md">
            <Label className="mb-2 block">PDF Accent Color</Label>
            <div className="flex items-center gap-3">
              <input type="color" value={settings?.branding?.accentColor || "#276EF1"} onChange={(e) => updateSetting("branding", "accentColor", e.target.value)} className="w-10 h-10 rounded cursor-pointer border-0 p-0" />
              <Input value={settings?.branding?.accentColor} onChange={(e) => updateSetting("branding", "accentColor", e.target.value)} className="w-32 uppercase" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { field: "watermarkUrl", label: "Watermark (PNG/JPEG 512x512)" },
              { field: "headerImageUrl", label: "Header Image (PNG/JPEG 1000x125)" },
              { field: "footerImageUrl", label: "Footer Image (PNG/JPEG 1000x125)" },
              { field: "bannerTopUrl", label: "Banner Top (1000x125)" },
              { field: "bannerBottomUrl", label: "Banner Bottom (1000x125)" },
            ].map(({ field, label }) => (
              <div key={field} className="border rounded-lg p-3 space-y-2">
                <Label className="text-xs">{label}</Label>
                {settings?.branding?.[field] && <img src={settings.branding[field]} alt={label} className="h-12 object-contain" />}
                <label className="flex items-center justify-center gap-2 h-9 border border-dashed rounded cursor-pointer text-xs text-muted-foreground hover:bg-muted/30">
                  <Upload className="w-3.5 h-3.5" /> Upload
                  <input type="file" className="hidden" onChange={handleImageUpload("branding", field)} />
                </label>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">PDF Footer Text (max 255 chars)</Label>
              <Input value={settings?.branding?.pdfFooterText || ""} onChange={(e) => updateSetting("branding", "pdfFooterText", e.target.value)} maxLength={255} placeholder="Thank you for your business!" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Thermal Print Footer (max 255 chars)</Label>
              <Input value={settings?.branding?.thermalFooterText || ""} onChange={(e) => updateSetting("branding", "thermalFooterText", e.target.value)} maxLength={255} />
            </div>
          </div>

          <div className="border-t pt-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold">Signatures</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = () => {
                    const file = input.files?.[0];
                    if (!file) return;
                    const name = prompt("Signature name (e.g. Director)") || "Signature";
                    const reader = new FileReader();
                    reader.onload = () => {
                      setSettings((prev: any) => ({ ...prev, signatures: [...(prev?.signatures || []), { name, imageUrl: reader.result }] }));
                    };
                    reader.readAsDataURL(file);
                  };
                  input.click();
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Signature
              </Button>
            </div>
            <div className="flex flex-wrap gap-3">
              {(settings?.signatures || []).map((s: any, i: number) => (
                <div key={i} className="border rounded-lg p-2 flex items-center gap-2">
                  <img src={s.imageUrl} alt={s.name} className="h-8" />
                  <span className="text-xs">{s.name}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => setSettings((prev: any) => ({ ...prev, signatures: prev.signatures.filter((_: any, idx: number) => idx !== i) }))}
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              ))}
              {(!settings?.signatures || settings.signatures.length === 0) && <p className="text-xs text-muted-foreground">No signatures added yet.</p>}
            </div>
          </div>
        </section>

        {/* CUSTOMIZE LABELS */}
        <section ref={refs.labels} id="labels" className="bg-card rounded-lg border p-6 space-y-4 scroll-mt-16">
          <h2 className="text-lg font-bold">Customize Labels</h2>
          <p className="text-sm text-muted-foreground">Override the default field labels shown on invoices and the create-invoice form.</p>
          <div className="grid grid-cols-2 gap-4 max-w-2xl">
            {["Invoice", "Bill To", "Ship To", "Total Amount", "Terms & Conditions", "HSN/SAC"].map((defaultLabel) => (
              <div key={defaultLabel} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{defaultLabel}</Label>
                <Input
                  value={settings?.customLabels?.[defaultLabel] ?? ""}
                  placeholder={defaultLabel}
                  onChange={(e) => setSettings((prev: any) => ({ ...prev, customLabels: { ...prev.customLabels, [defaultLabel]: e.target.value } }))}
                />
              </div>
            ))}
          </div>
        </section>

        {/* EMAIL / WHATSAPP */}
        <section ref={refs["templates-comm"]} id="templates-comm" className="bg-card rounded-lg border p-6 space-y-6 scroll-mt-16">
          <h2 className="text-lg font-bold">Email / WhatsApp Templates</h2>
          <div className="space-y-3 max-w-2xl">
            <h3 className="text-sm font-semibold">Email</h3>
            <Input
              value={settings?.emailTemplate?.subject || ""}
              onChange={(e) => updateSetting("emailTemplate", "subject", e.target.value)}
              placeholder="Subject — supports {{number}}, {{company}}"
            />
            <Textarea
              value={settings?.emailTemplate?.body || ""}
              onChange={(e) => updateSetting("emailTemplate", "body", e.target.value)}
              placeholder="Body — supports {{number}}, {{amount}}, {{customer}}"
              className="h-24"
            />
          </div>
          <div className="space-y-3 max-w-2xl border-t pt-6">
            <h3 className="text-sm font-semibold">WhatsApp</h3>
            <Textarea
              value={settings?.whatsappTemplate?.message || ""}
              onChange={(e) => updateSetting("whatsappTemplate", "message", e.target.value)}
              placeholder="Message — supports {{number}}, {{amount}}, {{customer}}"
              className="h-24"
            />
          </div>
        </section>
      </div>

      <Dialog open={customFieldsOpen} onOpenChange={setCustomFieldsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Custom Fields — Invoice</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {customFields.length === 0 ? (
              <p className="text-sm text-muted-foreground">No custom fields yet.</p>
            ) : (
              customFields.map((f) => (
                <div key={f._id} className="flex justify-between items-center text-sm border rounded px-3 py-2">
                  <span>{f.label}</span>
                  <span className="text-xs text-muted-foreground">{f.fieldType}</span>
                </div>
              ))
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Input value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)} placeholder="Field label" className="flex-1" onKeyDown={(e) => e.key === "Enter" && addCustomField()} />
            <Button onClick={addCustomField}><Plus className="w-4 h-4 mr-1" /> Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
