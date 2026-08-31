"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  description?: string;
  colorClass?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  description,
  colorClass = "text-blue-800 dark:text-blue-400",
}: StatCardProps) {
  return (
    <Card className="rounded-none border-0 shadow-none bg-card transition-all duration-200">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </CardTitle>
        <div className={cn("p-2 bg-primary/10 rounded-none")}>
          <Icon className={cn("h-5 w-5", colorClass)} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="font-mono text-2xl font-bold text-foreground">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend && (
          <div className="flex items-center gap-2 mt-2">
            <span
              className={cn(
                "text-xs font-bold px-1.5 py-0.5 rounded-none",
                trend.isPositive
                  ? "bg-green-500/20 text-green-500"
                  : "bg-red-500/20 text-red-500"
              )}
            >
              {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
            </span>
            <span className="text-[10px] text-muted-foreground">
              vs Last Month
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
