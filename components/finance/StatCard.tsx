"use client";

import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: {
    value: string;
    isPositive: boolean;
  };
  icon: LucideIcon;
  accentColor?: "primary" | "success" | "warning" | "destructive" | "muted";
  className?: string;
}

const colorClasses = {
  primary: {
    border: "border-l-primary",
    bg: "bg-primary/5",
    iconBg: "bg-primary/10",
    iconText: "text-primary",
    text: "text-primary",
  },
  success: {
    border: "border-l-emerald-500",
    bg: "bg-emerald-500/5",
    iconBg: "bg-emerald-500/10",
    iconText: "text-emerald-600 dark:text-emerald-400",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    border: "border-l-amber-500",
    bg: "bg-amber-500/5",
    iconBg: "bg-amber-500/10",
    iconText: "text-amber-600 dark:text-amber-400",
    text: "text-amber-600 dark:text-amber-400",
  },
  destructive: {
    border: "border-l-destructive",
    bg: "bg-destructive/5",
    iconBg: "bg-destructive/10",
    iconText: "text-destructive",
    text: "text-destructive",
  },
  muted: {
    border: "border-l-muted-foreground",
    bg: "bg-muted/30",
    iconBg: "bg-muted",
    iconText: "text-muted-foreground",
    text: "text-muted-foreground",
  },
};

export function StatCard({
  title,
  value,
  change,
  icon: Icon,
  accentColor = "primary",
  className,
}: StatCardProps) {
  const colors = colorClasses[accentColor];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-none border-l-4 bg-card p-6 transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5 border-y border-r border-border",
        colors.border,
        className
      )}
    >
      {/* Background gradient */}
      <div className={cn("absolute inset-0 opacity-10", colors.bg)} />

      {/* Content */}
      <div className="relative flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {change && (
            <div className="flex items-center gap-2 mt-1">
              <span
                className={cn(
                  "text-xs font-bold px-1.5 py-0.5 rounded-none",
                  change.isPositive
                    ? "bg-green-500/20 text-green-500"
                    : "bg-red-500/20 text-red-500"
                )}
              >
                {change.value}
              </span>
              <span className="text-[10px] text-muted-foreground">
                vs Last Month
              </span>
            </div>
          )}
        </div>

        {/* Icon */}
        <div className={cn("p-3 rounded-none", colors.iconBg)}>
          <Icon className={cn("h-6 w-6", colors.iconText)} />
        </div>
      </div>
    </div>
  );
}
