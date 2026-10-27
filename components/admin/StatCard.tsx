"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  visual?: React.ReactNode;
  rightContent?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  isLoading?: boolean;
}

export function StatCard({
  title,
  value,
  subtitle,
  visual,
  rightContent,
  footer,
  className,
  isLoading = false,
}: StatCardProps) {
  const isCardLoading = isLoading || value === null || value === undefined;

  // Adaptive font: shrink a LITTLE as the value gets longer so big ₹ amounts fit
  // fully on one line — never truncated with "…" and never split mid-number.
  // Caps are conservative so it fits even in the narrow 4-column pipeline tiles.
  const valueLen =
    typeof value === "string" ? value.length : typeof value === "number" ? String(value).length : 0;
  const valueSize =
    valueLen > 14
      ? "text-lg sm:text-xl lg:text-2xl"
      : valueLen > 10
      ? "text-xl sm:text-2xl lg:text-3xl"
      : valueLen > 7
      ? "text-2xl sm:text-3xl lg:text-4xl"
      : "text-3xl sm:text-4xl lg:text-5xl";

  const renderedVisual =
    React.isValidElement(visual) && rightContent
      ? React.cloneElement(visual as React.ReactElement<{ className?: string }>, {
          className: cn(
            (visual.props as { className?: string })?.className,
            "!h-12 !w-12 sm:!h-14 sm:!w-14"
          ),
        })
      : visual;

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
            <p className="font-mono text-[11px] text-muted-foreground truncate" title={title}>
              {title}
            </p>

            {isCardLoading ? (
              <div className="py-1">
                <Skeleton className="h-8 sm:h-9 w-28 sm:w-36 rounded-none bg-muted-foreground/15 animate-pulse" />
              </div>
            ) : (
              <h2 className={cn(
                "font-sans tabular-nums font-bold leading-tight tracking-tighter transition-opacity duration-500 group-hover:opacity-85 truncate max-w-full",
                valueSize,
              )}>
                {value}
              </h2>
            )}

            {isCardLoading ? (
              <Skeleton className="h-3.5 w-24 rounded-none bg-muted-foreground/10 animate-pulse mt-1" />
            ) : subtitle ? (
              <p className="text-xs sm:text-sm text-muted-foreground truncate" title={subtitle}>
                {subtitle}
              </p>
            ) : null}
          </div>

          {rightContent && (
            <div className="flex flex-col items-end gap-4 relative z-10 shrink-0">
              {rightContent}
            </div>
          )}
        </div>
        
        {visual && (
          <div
            className={cn(
              "absolute pointer-events-none opacity-20 dark:opacity-25 transition-opacity duration-500 group-hover:opacity-35 z-0",
              rightContent
                ? "bottom-2 right-2 sm:bottom-2.5 sm:right-3 [&_svg]:!h-12 [&_svg]:!w-12 sm:[&_svg]:!h-14 sm:[&_svg]:!w-14"
                : "right-0 top-1/2 -translate-y-1/2 sm:-right-2"
            )}
          >
            {renderedVisual}
          </div>
        )}

        {footer && (
          <div className="mt-3 relative z-10">
            {footer}
          </div>
        )}
      </CardContent>
    </Card>
  );
}