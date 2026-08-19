"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function BusinessHealthCardSkeleton() {
  return (
    <Card className="overflow-hidden border-0 shadow-none animate-pulse">
      {/* Header Skeleton */}
      <div className="border-b border-border/40 px-8 py-6 flex items-center justify-between">
        <Skeleton className="h-6 w-[200px]" />
        <Skeleton className="h-3.5 w-[80px]" />
      </div>

      {/* Content Skeleton */}
      <CardContent className="p-8 sm:p-10 space-y-6">
        {/* Summary text skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[92%]" />
          <Skeleton className="h-4 w-[85%]" />
        </div>

        {/* Grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Highlights box skeleton */}
          <div className="border border-border/20 bg-muted/5 p-6 space-y-3">
            <Skeleton className="h-3 w-[80px]" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-[90%]" />
              <Skeleton className="h-3 w-[85%]" />
              <Skeleton className="h-3 w-[70%]" />
            </div>
          </div>
          {/* Concerns box skeleton */}
          <div className="border border-border/20 bg-muted/5 p-6 space-y-3">
            <Skeleton className="h-3 w-[80px]" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-[88%]" />
              <Skeleton className="h-3 w-[82%]" />
              <Skeleton className="h-3 w-[75%]" />
            </div>
          </div>
        </div>

        {/* Revenue Forecast skeleton */}
        <div className="mt-6 border-t border-border/40 pt-4 space-y-2">
          <Skeleton className="h-3 w-[100px]" />
          <Skeleton className="h-3.5 w-[60%]" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Displays the latest AI-generated business-health summary (Phase 4).
 * Renders nothing until a summary exists (the scheduled cron populates it) —
 * so it never shows an empty/placeholder card.
 */
export function BusinessHealthCard() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetch("/api/admin/business-health")
      .then((res) => res.json())
      .then((d) => {
        if (d.success) setData(d.data);
      })
      .catch(() => {})
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  if (isLoading) return <BusinessHealthCardSkeleton />;
  if (!data) return null;

  return (
    <Card className="group overflow-hidden border-0 shadow-none transition-all duration-500">
      {/* Header */}
      <div className="border-b border-border/40 px-8 py-6 flex items-center justify-between">
        <h2 className="text-[22px] font-medium tracking-[-0.04em] text-foreground">
          AI Business Health
        </h2>
        <span className="font-mono text-[10px] text-muted-foreground/60">
          Generated: {new Date(data.generatedAt).toLocaleDateString()}
        </span>
      </div>

      <CardContent className="p-8 sm:p-10">
        <p className="text-sm text-foreground/90 leading-relaxed mb-6">
          {data.summary}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data.highlights?.length > 0 && (
            <div className="border border-emerald-500/20 bg-emerald-500/5 p-6">
              <p className="font-mono text-[11px] uppercase tracking-wider text-emerald-500 mb-3">
                Highlights
              </p>
              <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
                {data.highlights.map((h: string, i: number) => (
                  <li key={i} className="text-foreground/80">
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.concerns?.length > 0 && (
            <div className="border border-amber-500/20 bg-amber-500/5 p-6">
              <p className="font-mono text-[11px] uppercase tracking-wider text-amber-500 mb-3">
                Concerns
              </p>
              <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-1">
                {data.concerns.map((c: string, i: number) => (
                  <li key={i} className="text-foreground/80">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {data.revenueForecast && (
          <div className="mt-6 border-t border-border/40 pt-6">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-2">
              Revenue Outlook
            </p>
            <p className="text-sm text-foreground/90 font-medium leading-relaxed">
              {data.revenueForecast}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

