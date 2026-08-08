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
  return (
    <Card
      className={cn(
        "group overflow-hidden border-0 shadow-none transition-all duration-500",
        className
      )}
    >
      <CardContent className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4 sm:gap-6">
          <div className="min-w-0 flex-1 space-y-4">
            <p className="font-mono text-[11px] text-muted-foreground/60">
              {title}
            </p>

            {/* Responsive size + min-w-0/break so large ₹ amounts never overflow
                or get clipped on narrow screens. */}
            <h2 className="break-words tabular-nums text-4xl sm:text-5xl xl:text-[56px] font-black leading-none tracking-tighter transition-opacity duration-500 group-hover:opacity-80">
              {value}
            </h2>

            {subtitle && (
              <p className="text-sm text-muted-foreground/50">
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-4">
            {rightContent}

            {visual && (
              <div className="pointer-events-none opacity-100 transition-opacity duration-500 group-hover:opacity-70">
                {visual}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}