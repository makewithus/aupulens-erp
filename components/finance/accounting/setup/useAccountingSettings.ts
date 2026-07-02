"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export function useAccountingSettings() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/accounting/settings");
      const data = await res.json();
      if (data.success) setSettings(data.data);
      else toast.error(data.message || "Failed to load settings");
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const save = useCallback(async (section: string, patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/finance/accounting/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [section]: patch }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save settings");
      setSettings(data.data);
      toast.success("Settings saved");
      return true;
    } catch (e: any) {
      toast.error(e.message || "Failed to save settings");
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { settings, loading, saving, save, refetch: fetchSettings };
}
