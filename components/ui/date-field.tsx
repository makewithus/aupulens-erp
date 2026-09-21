"use client";

import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { cn } from "@/lib/utils";

const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const display = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

/**
 * Calendar-popover replacement for <input type="date">. Keeps the same
 * contract (ISO yyyy-mm-dd value, onChange receives an event-like object with
 * target.value) so every existing date input/filter gets a real date picker
 * without changing its call site. Rendered by <Input type="date" />.
 */
export const DateField = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, value, defaultValue, onChange, min, max, disabled, name, id, placeholder, required, ...rest }, ref) => {
    const [inner, setInner] = React.useState<string>(String(defaultValue ?? ""));
    const controlled = value !== undefined;
    const current = controlled ? String(value ?? "") : inner;
    const [open, setOpen] = React.useState(false);

    const commit = (next: string) => {
      if (next && min && next < String(min)) return;
      if (next && max && next > String(max)) return;
      if (!controlled) setInner(next);
      const target = { value: next, name, id, type: "date" };
      onChange?.({ target, currentTarget: target } as unknown as React.ChangeEvent<HTMLInputElement>);
      setOpen(false);
    };

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-label={(rest as any)["aria-label"]}
            className={cn(
              "flex h-9 w-full items-center justify-between gap-2 rounded-none border border-input bg-transparent px-3 py-1 text-left text-base text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
              !current && "text-muted-foreground",
              className,
            )}
          >
            <span className="truncate">{current ? display(current) : placeholder || "dd-mm-yyyy"}</span>
            <CalendarIcon className="h-4 w-4 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto rounded-none border-0 bg-transparent p-0 shadow-none">
          <MiniCalendar value={current || undefined} onChange={commit} />
          <div className="mt-1 flex justify-between border border-border/60 bg-popover px-3 py-2 text-xs">
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => commit(toISO(new Date()))}>
              Today
            </button>
            {current && !required && (
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => commit("")}>
                Clear
              </button>
            )}
          </div>
        </PopoverContent>
        <input ref={ref} type="hidden" name={name} value={current} readOnly />
      </Popover>
    );
  },
);
DateField.displayName = "DateField";
