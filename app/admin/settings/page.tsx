"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Save, Building2, Palette, Receipt, Sparkles } from "lucide-react";
import { COUNTRIES, getCountryInfo } from "@/lib/constants/countries";

export default function OrgSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tier, setTier] = useState("starter");
  const [form, setForm] = useState({
    name: "",
    themeColor: "#3b82f6",
    logo: "",
    emailFooter: "",
    pdfHeader: "",
    currency: "USD",
    country: "",
    state: "",
    isGstRegistered: false,
    gstin: "",
    addressLine1: "",
    city: "",
    aiModel: "",
    aiMaxTokensPerCall: 1024,
    aiDisabled: false,
  });

  useEffect(() => {
    fetch("/api/admin/org-settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const s = data.data.settings || {};
          setTier(data.data.tier);
          setForm({
            name: data.data.name || "",
            themeColor: s.themeColor || "#3b82f6",
            logo: s.logo || "",
            emailFooter: s.branding?.emailFooter || "",
            pdfHeader: s.branding?.pdfHeader || "",
            currency: s.currency || "USD",
            country: s.country || "",
            state: s.state || "",
            isGstRegistered: !!s.isGstRegistered,
            gstin: s.gstin || "",
            addressLine1: s.addressLine1 || "",
            city: s.city || "",
            aiModel: s.ai?.model || "",
            aiMaxTokensPerCall: s.ai?.maxTokensPerCall || 1024,
            aiDisabled: !!s.ai?.disabled,
          });
        }
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/org-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          settings: {
            themeColor: form.themeColor,
            logo: form.logo,
            currency: form.currency,
            country: form.country,
            state: form.state,
            isGstRegistered: form.isGstRegistered,
            gstin: form.gstin,
            addressLine1: form.addressLine1,
            city: form.city,
            branding: { emailFooter: form.emailFooter, pdfHeader: form.pdfHeader },
            ai: {
              model: form.aiModel || undefined,
              maxTokensPerCall: Number(form.aiMaxTokensPerCall) || 1024,
              disabled: form.aiDisabled,
            },
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Settings saved");
      } else {
        toast.error(data.message || "Failed to save settings");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Admin"
      pageName="Workspace Settings"
      breadcrumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "Settings" }]}
    >
      <div className="p-6 max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Workspace Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Branding, tax/GST, currency, and AI preferences for this organization.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <section className="space-y-4 border-2 rounded-xl p-6">
              <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Organization
              </h2>
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Organization Name
                </Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="text-xs text-muted-foreground">
                Current plan: <span className="font-bold uppercase">{tier}</span>
              </div>
            </section>

            <section className="space-y-4 border-2 rounded-xl p-6">
              <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <Palette className="h-4 w-4" /> Branding
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Theme Color
                  </Label>
                  <Input type="color" value={form.themeColor} onChange={(e) => setForm({ ...form, themeColor: e.target.value })} className="h-10 w-full" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Logo URL
                  </Label>
                  <Input value={form.logo} onChange={(e) => setForm({ ...form, logo: e.target.value })} placeholder="https://..." />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Email Footer
                </Label>
                <Input value={form.emailFooter} onChange={(e) => setForm({ ...form, emailFooter: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  PDF Header Text
                </Label>
                <Input value={form.pdfHeader} onChange={(e) => setForm({ ...form, pdfHeader: e.target.value })} />
              </div>
            </section>

            <section className="space-y-4 border-2 rounded-xl p-6">
              <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <Receipt className="h-4 w-4" /> Tax &amp; Currency
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Country</Label>
                  <select
                    value={form.country}
                    onChange={(e) => {
                      const info = getCountryInfo(e.target.value);
                      setForm({ ...form, country: e.target.value, currency: info.currencyCode });
                    }}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {!COUNTRIES.some((c) => c.name === form.country) && form.country && (
                      <option value={form.country}>{form.country}</option>
                    )}
                    {COUNTRIES.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Currency <span className="normal-case font-normal text-muted-foreground/60">(auto from country, editable)</span>
                  </Label>
                  <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">State</Label>
                  <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Address Line / City</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Input value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} placeholder="Address" />
                  <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">GST Registered</Label>
                <Switch checked={form.isGstRegistered} onCheckedChange={(v) => setForm({ ...form, isGstRegistered: v })} />
              </div>
              {form.isGstRegistered && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">GSTIN</Label>
                  <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} />
                </div>
              )}
            </section>

            <section className="space-y-4 border-2 rounded-xl p-6">
              <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> AI Preferences
              </h2>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    AI Features Enabled
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Kill-switch — turning this off blocks every AI call for this workspace immediately (lib/ai/tenantAi.ts).
                  </p>
                </div>
                <Switch checked={!form.aiDisabled} onCheckedChange={(v) => setForm({ ...form, aiDisabled: !v })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Azure Deployment Override
                  </Label>
                  <Input
                    value={form.aiModel}
                    onChange={(e) => setForm({ ...form, aiModel: e.target.value })}
                    placeholder="Leave blank for platform default"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Max Tokens Per Call
                  </Label>
                  <Input
                    type="number"
                    value={form.aiMaxTokensPerCall}
                    onChange={(e) => setForm({ ...form, aiMaxTokensPerCall: Number(e.target.value) })}
                  />
                </div>
              </div>
            </section>

            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Settings
            </Button>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
