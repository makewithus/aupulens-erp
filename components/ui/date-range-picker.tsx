"use client";

import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { MiniCalendar } from "@/components/ui/mini-calendar";

interface DateRangePickerProps {
  onUpdate: (range: { from: Date; to: Date } | undefined) => void;
  className?: string;
}

export function DateRangePicker({ onUpdate, className }: DateRangePickerProps) {
  const [from, setFrom] = React.useState<string>("");
  const [to, setTo] = React.useState<string>("");

  React.useEffect(() => {
    if (from && to) {
      onUpdate({
        from: new Date(from),
        to: new Date(to),
      });
    } else {
      onUpdate(undefined);
    }
  }, [from, to, onUpdate]);

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[300px] justify-start text-left font-normal",
              !from && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {from ? (
              to ? (
                <>
                  {format(new Date(from), "LLL dd, y")} -{" "}
                  {format(new Date(to), "LLL dd, y")}
                </>
              ) : (
                format(new Date(from), "LLL dd, y")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4" align="start">
          {/* Both a typed input AND a click-to-pick calendar for each end, so the
              user can type a date or pick it visually — whichever they prefer. */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="w-[220px] space-y-2">
              <label className="text-xs font-medium">From</label>
              <Input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
              <MiniCalendar value={from} onChange={setFrom} />
            </div>
            <div className="w-[220px] space-y-2">
              <label className="text-xs font-medium">To</label>
              <Input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
              <MiniCalendar value={to} onChange={setTo} />
            </div>
          </div>
          <div className="flex items-center justify-end pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
