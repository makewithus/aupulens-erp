"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PLATFORM_EVENT_CATEGORY_VALUES } from "@/lib/constants/statuses";

interface PolicyRow {
  id: string;
  organizationType?: string;
  country?: string;
  eventCategory?: string;
  eventType?: string;
  retentionDays: number;
  isDefault: boolean;
}

export default function RetentionSettingsPage() {
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retentionDays, setRetentionDays] = useState("90");
  const [eventCategory, setEventCategory] = useState<string>("none");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/platform/retention-policies");
      const text = await res.text();
      try {
        const body = JSON.parse(text);
        if (body.success) setPolicies(body.data);
        else setError(body.message ?? "Failed to load retention policies.");
      } catch (err) {
        setError(`Failed to load data (Server Error: ${res.status}). Response: ${text.slice(0, 50)}`);
      }
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/platform/retention-policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          retentionDays: Number(retentionDays),
          eventCategory: eventCategory === "none" ? undefined : eventCategory,
          isDefault: eventCategory === "none",
        }),
      });
      const body = await res.json();
      if (!body.success) {
        toast.error(body.message ?? "Failed to create policy.");
        return;
      }
      toast.success("Policy created successfully.");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Retention policy</h1>
        <p className="text-sm text-muted-foreground">
          The most specific matching policy wins. A policy with no category set is the platform
          default (30 days if none is configured at all).
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-4 rounded-md font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
          {error}
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="bg-muted/50 border-b border-border">
          <CardTitle className="text-base font-semibold">Add a policy</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 sm:p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Event category (leave unset for default)</Label>
                <Select value={eventCategory} onValueChange={setEventCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Platform default (all categories)</SelectItem>
                    {PLATFORM_EVENT_CATEGORY_VALUES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Retention days</Label>
                <Input type="number" min={1} value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)} className="w-full" />
              </div>
            </div>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? "Saving…" : "Add policy"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="bg-muted/50 border-b border-border">
          <CardTitle className="text-base font-semibold">Configured policies</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 sm:p-6 space-y-2">
            {policies.length === 0 && <p className="text-sm text-muted-foreground italic">No policies configured — the hardcoded 30-day platform default applies.</p>}
            {policies.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm py-4 border-b border-border last:border-0">
                <span className="font-medium text-foreground flex items-center gap-2">
                  {p.eventCategory ?? "All categories"} {p.organizationType ? <span className="text-muted-foreground">· {p.organizationType}</span> : ""}
                  {p.isDefault && <Badge variant="secondary" className="rounded-md">default</Badge>}
                </span>
                <span className="text-muted-foreground font-medium">{p.retentionDays} days</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
