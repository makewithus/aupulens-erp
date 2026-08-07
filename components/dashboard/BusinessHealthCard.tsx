"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

/**
 * Displays the latest AI-generated business-health summary (Phase 4).
 * Renders nothing until a summary exists (the scheduled cron populates it) —
 * so it never shows an empty/placeholder card.
 */
export function BusinessHealthCard() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/admin/business-health")
      .then((res) => res.json())
      .then((d) => { if (d.success) setData(d.data); })
      .catch(() => {});
  }, []);

  if (!data) return null;

  return (
    <div className="border-2 rounded-xl p-6 bg-primary/[0.02]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-500" /> AI Business Health
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {new Date(data.generatedAt).toLocaleDateString()}
        </span>
      </div>
      <p className="text-sm text-foreground/90 mb-4">{data.summary}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.highlights?.length > 0 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Highlights</p>
            <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-0.5">
              {data.highlights.map((h: string, i: number) => <li key={i}>{h}</li>)}
            </ul>
          </div>
        )}
        {data.concerns?.length > 0 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">Concerns</p>
            <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-0.5">
              {data.concerns.map((c: string, i: number) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}
      </div>
      {data.revenueForecast && (
        <p className="text-xs text-muted-foreground mt-4 border-t pt-3">
          <span className="font-bold">Revenue outlook:</span> {data.revenueForecast}
        </p>
      )}
    </div>
  );
}
