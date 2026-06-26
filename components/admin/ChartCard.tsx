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
        "overflow-hidden border-0 shadow-none",
        className
      )}
    >
      {/* Header */}
      <div className="border-b border-border/40 px-8 py-6">
        <div className="space-y-1">
          <h2 className="text-[22px] font-medium tracking-[-0.04em] text-foreground">
            {title}
          </h2>

          {subtitle && (
            <p className="text-sm text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Chart */}
      <CardContent className="p-8">
        {children}
      </CardContent>
    </Card>
  );
}