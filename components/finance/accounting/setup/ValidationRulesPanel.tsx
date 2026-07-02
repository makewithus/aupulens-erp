"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAccountingSettings } from "./useAccountingSettings";

export function ValidationRulesPanel() {
  const { settings, loading, saving, save } = useAccountingSettings();
  const [preventFutureDated, setPreventFutureDated] = useState(false);
  const [requireReference, setRequireReference] = useState(false);
  const [maxDescriptionLength, setMaxDescriptionLength] = useState(500);

  useEffect(() => {
    if (settings?.journals) {
      setPreventFutureDated(settings.journals.preventFutureDated);
      setRequireReference(settings.journals.requireReference);
      setMaxDescriptionLength(settings.journals.maxDescriptionLength);
    }
  }, [settings]);

  if (loading) return <div className="text-muted-foreground text-sm py-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6 max-w-md">
      <div className="flex items-center space-x-2">
        <Checkbox checked disabled />
        <label className="text-sm text-muted-foreground">Require debit and credit totals to balance exactly (always on)</label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="preventFuture" checked={preventFutureDated} onCheckedChange={(v) => setPreventFutureDated(!!v)} />
        <label htmlFor="preventFuture" className="text-sm">
          Prevent journal entries dated in the future
        </label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="requireRef" checked={requireReference} onCheckedChange={(v) => setRequireReference(!!v)} />
        <label htmlFor="requireRef" className="text-sm">
          Require a reference number on every journal entry
        </label>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Max Description Length</label>
        <Input
          type="number"
          min={50}
          max={2000}
          value={maxDescriptionLength}
          onChange={(e) => setMaxDescriptionLength(Number(e.target.value) || 500)}
          className="w-32"
        />
      </div>
      <Button
        disabled={saving}
        onClick={() => save("journals", { preventFutureDated, requireReference, maxDescriptionLength })}
      >
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
