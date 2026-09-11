"use client";

import { useEffect, useState } from "react";
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
    const res = await fetch("/api/platform/retention-policies");
    const body = await res.json();
    if (body.success) setPolicies(body.data);
    else setError(body.message ?? "Failed to load retention policies.");
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
        setError(body.message ?? "Failed to create policy.");
        return;
      }
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Retention policy</h1>
        <p className="text-sm text-neutral-500">
          The most specific matching policy wins. A policy with no category set is the platform
          default (30 days if none is configured at all).
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a policy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Event category (optional — leave unset for the platform default)</Label>
              <Select value={eventCategory} onValueChange={setEventCategory}>
                <SelectTrigger>
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
            <div className="space-y-1">
              <Label>Retention days</Label>
              <Input type="number" min={1} value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)} />
            </div>
          </div>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? "Saving…" : "Add policy"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Configured policies</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {policies.length === 0 && <p className="text-sm text-neutral-400 italic">No policies configured — the hardcoded 30-day platform default applies.</p>}
          {policies.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm border-b pb-2">
              <span>
                {p.eventCategory ?? "All categories"} {p.organizationType ? `· ${p.organizationType}` : ""}
                {p.isDefault && <Badge variant="secondary" className="ml-2">default</Badge>}
              </span>
              <span className="text-neutral-500">{p.retentionDays} days</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
