"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface PickerAccount {
  _id: string;
  accountName: string;
  accountCode?: string;
}

export function AccountPicker({
  accounts,
  value,
  onChange,
  placeholder = "Select an account",
  className,
}: {
  accounts: PickerAccount[];
  value?: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find((a) => a._id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? `${selected.accountName}${selected.accountCode ? ` (${selected.accountCode})` : ""}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search accounts..." />
          <CommandList>
            <CommandEmpty>No account found.</CommandEmpty>
            <CommandGroup>
              {accounts.map((a) => (
                <CommandItem
                  key={a._id}
                  value={`${a.accountName} ${a.accountCode || ""}`}
                  onSelect={() => {
                    onChange(a._id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === a._id ? "opacity-100" : "opacity-0")} />
                  {a.accountName} {a.accountCode ? <span className="text-muted-foreground ml-1">({a.accountCode})</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function MultiAccountPicker({
  accounts,
  value,
  onChange,
  placeholder = "None",
  className,
}: {
  accounts: PickerAccount[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = accounts.filter((a) => value.includes(a._id));

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className={cn("w-full justify-between font-normal h-auto min-h-9", className)}>
          {selected.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <div className="flex flex-wrap gap-1 py-1">
              {selected.map((a) => (
                <span
                  key={a._id}
                  className="inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(a._id);
                  }}
                >
                  {a.accountName} <X className="h-3 w-3" />
                </span>
              ))}
            </div>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search accounts..." />
          <CommandList>
            <CommandEmpty>No account found.</CommandEmpty>
            <CommandGroup>
              {accounts.map((a) => (
                <CommandItem key={a._id} value={`${a.accountName} ${a.accountCode || ""}`} onSelect={() => toggle(a._id)}>
                  <Check className={cn("mr-2 h-4 w-4", value.includes(a._id) ? "opacity-100" : "opacity-0")} />
                  {a.accountName} {a.accountCode ? <span className="text-muted-foreground ml-1">({a.accountCode})</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
