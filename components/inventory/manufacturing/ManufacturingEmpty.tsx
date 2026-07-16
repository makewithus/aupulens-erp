"use client";

import { Card, CardContent } from "@/components/ui/card";

interface ManufacturingEmptyProps {
  title: string;
  description: string;
}

export function ManufacturingEmpty({
  title,
  description,
}: ManufacturingEmptyProps) {
  return (
    <Card className="overflow-hidden border-border/40 shadow-none">
      <CardContent className="flex flex-col items-center justify-center px-8 py-24 text-center">
        <h2 className="text-[34px] font-medium tracking-[-0.05em]">
          {title}
        </h2>

        <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}