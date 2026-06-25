"use client";

import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  iconContainerClassName?: string;
  iconClassName?: string;
  valueClassName?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  iconContainerClassName = "bg-primary/5 group-hover:bg-primary",
  iconClassName = "",
  valueClassName = "",
}: StatCardProps) {
  return (
    <Card className="none-3xl border-2 shadow-xl overflow-hidden group">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div
            className={`h-12 w-12 none-xl flex items-center justify-center transition-all ${iconContainerClassName}`}
          >
            <Icon
              className={`h-6 w-6 group-hover:text-white transition-colors ${iconClassName}`}
            />
          </div>

          <Icon className={`h-8 w-8 opacity-10 ${iconClassName}`} />
        </div>

        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1">
          {title}
        </p>

        <h3
          className={`text-3xl font-black tracking-tighter ${valueClassName}`}
        >
          {value}
        </h3>
      </CardContent>
    </Card>
  );
}