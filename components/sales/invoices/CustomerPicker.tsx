"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface PickerCustomer {
  _id: string;
  header?: { name?: string };
  gstin?: string;
  tags?: string[];
  contact_details?: { email?: string; phone?: string };
}

export function CustomerPicker({
  customers,
  value,
  onChange,
  onCreateNew,
  className,
}: {
  customers: PickerCustomer[];
  value?: string;
  onChange: (id: string) => void;
  onCreateNew: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = customers.find((c) => c._id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className={cn("w-full justify-between font-normal h-10", className)}>
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.header?.name : "Search customers by name, company, GSTIN, tags..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search customers..." />
          <CommandList>
            <CommandEmpty>
              <button type="button" onClick={() => { setOpen(false); onCreateNew(); }} className="flex items-center gap-2 px-2 py-1.5 text-sm text-blue-600 hover:underline w-full">
                <Plus className="h-3.5 w-3.5" /> Create Customer
              </button>
            </CommandEmpty>
            <CommandGroup>
              {customers.map((c) => (
                <CommandItem
                  key={c._id}
                  value={`${c.header?.name || ""} ${c.gstin || ""} ${(c.tags || []).join(" ")}`}
                  onSelect={() => {
                    onChange(c._id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === c._id ? "opacity-100" : "opacity-0")} />
                  <div>
                    <div className="font-medium">{c.header?.name}</div>
                    {(c.gstin || c.contact_details?.email) && (
                      <div className="text-xs text-muted-foreground">{c.gstin || c.contact_details?.email}</div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
