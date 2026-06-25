"use client";

import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  subtitle?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
}: StatCardProps) {
  return (
    <Card
      className="
        group
        overflow-hidden
        shadow-none
        transition-all
        duration-500
        border-0
      "
    >
      <CardContent className="flex min-h-[220px] flex-col justify-between p-8">
        {/* Icons */}
        <div className="flex items-start justify-between">
          {/* <Icon
            className={`h-7 w-7 opacity-60 transition-all duration-500 group-hover:opacity-50`}
          /> */}

          {/* <Icon
            className={`h-8 w-8 opacity-10 transition-all duration-500 group-hover:opacity-20`}
          /> */}
        </div>

        {/* Content */}
        <div>
          <p className="mb-3 font-mono text-[11px] text-muted-foreground/60">
            {title}
          </p>

          <h2
            className={`text-[56px] transition-all duration-500 font-black leading-none tracking-tighter group-hover:opacity-80`}
          >
            {value}
          </h2>

          {/* {subtitle && (
            <p className="mt-4 font-mono text-xs text-muted-foreground">
              {subtitle}
            </p>
          )} */}
        </div>
      </CardContent>
    </Card>
  );
}