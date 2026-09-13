"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORGANIZATION_TYPE_LABELS } from "@/lib/constants/statuses";

const initialState = {
  name: "",
  subdomain: "",
  organizationType: "sme",
  ownerName: "",
  ownerEmail: "",
  ownerPhone: "",
  ownerPassword: "",
  country: "India",
  taxJurisdiction: "",
  planKey: "",
};

interface PlanOption {
  key: string;
  name: string;
  active: boolean;
}

export default function NewOrganizationPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<PlanOption[]>([]);

  useEffect(() => {
    fetch("/api/platform/plans")
      .then((res) => res.json())
      .then((body) => {
        if (body.success) setPlans(body.data.filter((p: PlanOption) => p.active));
      });
  }, []);

  function update<K extends keyof typeof initialState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/platform/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          taxJurisdiction: form.taxJurisdiction.trim() || undefined,
          planKey: form.planKey || undefined,
        }),
      });
      const body = await res.json();
      if (!body.success) {
        toast.error(body.message ?? "Failed to create organisation.");
        return;
      }
      toast.success("Organisation created successfully.");
      router.push(`/platform/organizations/${body.data.subdomain}`);
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New organisation</h1>
        <p className="text-sm text-neutral-500">
          Creates a real tenant: an Organisation record, an owner user, and a seeded Chart of
          Accounts — no simulated preview.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organisation details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="name">Organisation name</Label>
                <Input id="name" required value={form.name} onChange={(e) => update("name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="subdomain">Subdomain</Label>
                <Input
                  id="subdomain"
                  required
                  pattern="[a-z0-9-]+"
                  value={form.subdomain}
                  onChange={(e) => update("subdomain", e.target.value.toLowerCase())}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Organisation type</Label>
              <Select value={form.organizationType} onValueChange={(v) => update("organizationType", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ORGANIZATION_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="country">Country</Label>
                <Input id="country" value={form.country} onChange={(e) => update("country", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="taxJurisdiction">Tax jurisdiction</Label>
                <Input
                  id="taxJurisdiction"
                  placeholder="Defaults from country if left blank"
                  value={form.taxJurisdiction}
                  onChange={(e) => update("taxJurisdiction", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Initial plan (optional)</Label>
              <Select value={form.planKey} onValueChange={(v) => update("planKey", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No plan opinion — leave unassigned for now" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-neutral-400">
                Leaving this unset uses the organisation type&apos;s own default plan, if one is
                configured — otherwise the organisation is created with no plan assigned yet.
              </p>
            </div>

            <div className="border-t pt-4 space-y-4">
              <p className="text-sm font-medium">Owner account</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="ownerName">Owner name</Label>
                  <Input
                    id="ownerName"
                    required
                    value={form.ownerName}
                    onChange={(e) => update("ownerName", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ownerPhone">Owner phone</Label>
                  <Input
                    id="ownerPhone"
                    required
                    value={form.ownerPhone}
                    onChange={(e) => update("ownerPhone", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ownerEmail">Owner email</Label>
                <Input
                  id="ownerEmail"
                  type="email"
                  required
                  value={form.ownerEmail}
                  onChange={(e) => update("ownerEmail", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ownerPassword">Owner password (min. 8 characters)</Label>
                <div className="relative">
                  <Input
                    id="ownerPassword"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={form.ownerPassword}
                    onChange={(e) => update("ownerPassword", e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating…" : "Create organisation"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
