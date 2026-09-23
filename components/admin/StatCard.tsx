"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  visual?: React.ReactNode;
  rightContent?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  visual,
  rightContent,
  className,
}: StatCardProps) {
  // Adaptive font: shrink a LITTLE as the value gets longer so big ₹ amounts fit
  // fully on one line — never truncated with "…" and never split mid-number.
  // Caps are conservative so it fits even in the narrow 4-column pipeline tiles.
  const valueLen =
    typeof value === "string" ? value.length : typeof value === "number" ? String(value).length : 0;
  const valueSize =
    valueLen > 12
      ? "text-xl sm:text-2xl"
      : valueLen > 9
      ? "text-2xl sm:text-3xl"
      : valueLen > 6
      ? "text-3xl sm:text-4xl"
      : "text-4xl sm:text-5xl";
  return (
    <Card
      className={cn(
        "group overflow-hidden border-0 shadow-none transition-all duration-500",
        className
      )}
    >
      <CardContent className="p-4 sm:p-6 relative">
        <div className="flex items-start justify-between gap-3 sm:gap-4 relative z-10">
          <div className="min-w-0 flex-1 space-y-2 sm:space-y-4">
            <p className="font-mono text-[11px] text-muted-foreground/60">
              {title}
            </p>

            <h2 className={cn(
              "font-sans tabular-nums font-bold leading-none tracking-tighter transition-opacity duration-500 group-hover:opacity-80",
              valueSize,
            )}>
              {value}
            </h2>

            {subtitle && (
              <p className="text-sm text-muted-foreground/50 truncate" title={subtitle}>
                {subtitle}
              </p>
            )}
          </div>

          {rightContent && (
            <div className="flex flex-col items-end gap-4">
              {rightContent}
            </div>
          )}
        </div>
        
        {visual && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none opacity-100 transition-opacity duration-500 group-hover:opacity-70 z-0 sm:-right-2">
            {visual}
          </div>
        )}
      </CardContent>
    </Card>
  );
}