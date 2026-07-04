"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface PickerProduct {
  _id: string;
  header?: { name?: string };
  tab_general_information?: { list_price?: number; default_code?: string };
}

export function ProductPicker({
  products,
  value,
  onChange,
  onCreateNew,
  className,
}: {
  products: PickerProduct[];
  value?: string;
  onChange: (id: string) => void;
  onCreateNew: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = products.find((p) => p._id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" role="combobox" aria-expanded={open} className={cn("w-full justify-between font-medium h-8 px-2 border-0 shadow-none", className)}>
          <span className={cn("truncate text-left", !selected && "text-muted-foreground font-normal")}>
            {selected ? selected.header?.name : "Search or scan barcode for existing products"}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0">
        <Command filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search products..." />
          <CommandList>
            <CommandEmpty>
              <button type="button" onClick={() => { setOpen(false); onCreateNew(); }} className="flex items-center gap-2 px-2 py-1.5 text-sm text-blue-600 hover:underline w-full">
                <Plus className="h-3.5 w-3.5" /> Add new Product
              </button>
            </CommandEmpty>
            <CommandGroup>
              {products.map((p) => (
                <CommandItem
                  key={p._id}
                  value={`${p.header?.name || ""} ${p.tab_general_information?.default_code || ""}`}
                  onSelect={() => {
                    onChange(p._id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === p._id ? "opacity-100" : "opacity-0")} />
                  <div>
                    <div className="font-medium">{p.header?.name}</div>
                    <div className="text-xs text-muted-foreground">₹{p.tab_general_information?.list_price ?? 0}</div>
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
