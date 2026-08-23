"use client";

import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  subtitle,
  children,
  className,
}: ChartCardProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-lg border border-border/40 shadow-none font-mono",
        className
      )}
    >
      {/* Header — matches the CRM Reports chart cards: uppercase title,
          small muted subtitle, monospace throughout. */}
      <div className="px-6 pt-6">
        <div className="space-y-0.5">
          <h2 className="text-lg font-normal uppercase text-foreground">
            {title}
          </h2>

          {subtitle && (
            <p className="text-[10px] text-muted-foreground/60">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Chart */}
      <CardContent className="p-6 pt-2">
        {children}
      </CardContent>
    </Card>
  );
}