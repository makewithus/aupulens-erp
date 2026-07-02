"use client";

import { Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Native <input type="date"> already supports both manual typing and a
 * calendar picker in every evergreen browser — this just gives it a
 * consistent, themed look (with an explicit calendar affordance) across the
 * accounting module instead of the browser's unstyled default.
 */
export function DateField({
  value,
  onChange,
  className,
  placeholder,
  min,
  max,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  required?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        required={required}
        placeholder={placeholder}
        className="pr-9 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-9 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
      <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
    </div>
  );
}
