"use client";

import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { UsersGraph } from "./graphics/UsersGraph";

interface StatCardProps {
  title: string;
  value: number;
  subtitle?: string;
  graphic?:React.ReactNode,
}

export function StatCard({
  title,
  value,
  subtitle,
  graphic,
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
      <CardContent className="p-8">
  <div className="flex items-end justify-between">
    <div className="space-y-4">
      <p className="font-mono text-[11px] text-muted-foreground/60">
        {title}
      </p>

      <h2 className="text-[56px] font-black leading-none tracking-tighter transition-all duration-500 group-hover:opacity-80">
        {value}
      </h2>

      {subtitle && (
        <p className="text-sm text-muted-foreground/50">
          {subtitle}
        </p>
      )}
    </div>

    <div className="pointer-events-none self-center opacity-100 transition-opacity duration-500 group-hover:opacity-70">
      {graphic}
    </div>
  </div>
</CardContent>
    </Card>
  );
}