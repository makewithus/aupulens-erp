"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ModularModal } from "./ModularModal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Item {
  value: string;
  label: string;
  code?: string;
}

interface SelectSearchAddProps {
  items: any[]; // Changed from Item[] to allow raw objects if mapping fields provide
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  addButtonLabel?: string;
  dialogTitle?: string;
  onAdd?: (newItem: any) => Promise<any>;
  onAddClick?: () => void;
  className?: string;
  keyField?: string;
  labelField?: string;
  secondaryField?: string;
  defaultAccountType?: string;
  disabled?: boolean;
}

export function SelectSearchAdd({
  items,
  value,
  onValueChange,
  placeholder = "Select item...",
  searchPlaceholder = "Search...",
  emptyMessage = "No item found.",
  addButtonLabel = "Add New",
  dialogTitle = "Create New",
  onAdd,
  onAddClick,
  className,
  keyField = "value",
  labelField = "label",
  secondaryField = "code",
  defaultAccountType = "income",
  disabled = false,
}: SelectSearchAddProps) {
  const [open, setOpen] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isAdding, setIsAdding] = React.useState(false);

  // Helper to get field value from object path (simple version)
  const getValue = (obj: any, path: string) => {
    return path.split(".").reduce((acc, part) => acc && acc[part], obj);
  };

  const normalizedItems: Item[] = React.useMemo(() => {
    return items.map((item) => ({
      value: getValue(item, keyField),
      label: getValue(item, labelField),
      code: getValue(item, secondaryField),
    }));
  }, [items, keyField, labelField, secondaryField]);

  // New Account State
  const [newAccount, setNewAccount] = React.useState({
    code: "",
    name: "",
    account_type: defaultAccountType,
    reconcile: false,
  });

  // Sync default type if it changes
  React.useEffect(() => {
    setNewAccount((prev) => ({ ...prev, account_type: defaultAccountType }));
  }, [defaultAccountType]);

  const handleCreate = async () => {
    if (!onAdd) return;
    if (!newAccount.code || !newAccount.name) {
      toast.error("Code and Name are required");
      return;
    }
    setIsAdding(true);
    try {
      const created = await onAdd(newAccount);
      if (created) {
        setIsDialogOpen(false);
        setNewAccount({
          code: "",
          name: "",
          account_type: "income",
          reconcile: false,
        });
        // Select the newly created item
        onValueChange(created._id);
        setOpen(false);
      }
    } catch (error) {
      console.error("Error adding item:", error);
    } finally {
      setIsAdding(false);
    }
  };

  const effectiveValue = React.useMemo(() => {
    if (typeof value === "object" && value !== null) {
      return String(getValue(value, keyField) || (value as any)._id || "");
    }
    return value ? String(value) : "";
  }, [value, keyField]);

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between font-normal rounded-none text-foreground border-border",
              className,
            )}
            disabled={disabled}
          >
            {effectiveValue
              ? normalizedItems.find((item) => item.value === effectiveValue)
                  ?.label || placeholder
              : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0 rounded-none border-border shadow-xl">
          <Command className="rounded-none">
            <CommandInput placeholder={searchPlaceholder} className="h-9" />
            <CommandList className="max-h-[300px]">
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {normalizedItems.map((item) => (
                  <CommandItem
                    key={item.value}
                    value={`${item.code} ${item.label}`}
                    onSelect={() => {
                      onValueChange(item.value);
                      setOpen(false);
                    }}
                    className="flex items-center justify-between py-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Check
                        className={cn(
                          "h-4 w-4",
                          value === item.value ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="font-medium">{item.code}</span>
                      <span className="text-muted-foreground">
                        {item.label}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            {(onAdd || onAddClick) && (
              <div className="border-t p-1 sticky bottom-0 bg-popover">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-none h-9 px-2"
                  onClick={() => {
                    if (onAddClick) {
                      onAddClick();
                    } else {
                      setIsDialogOpen(true);
                    }
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {addButtonLabel}
                </Button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>

      <ModularModal
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={dialogTitle}
        description="Create a new account for your chart of accounts."
        className="sm:max-w-[425px]"
        footer={
          <Button
            type="submit"
            onClick={handleCreate}
            disabled={isAdding}
            className="w-full sm:w-auto"
          >
            {isAdding ? "Creating..." : "Save Account"}
          </Button>
        }
      >
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="code" className="text-right">
              Code
            </Label>
            <Input
              id="code"
              value={newAccount.code}
              onChange={(e) =>
                setNewAccount({ ...newAccount, code: e.target.value })
              }
              className="col-span-3"
              placeholder="e.g. 400005"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={newAccount.name}
              onChange={(e) =>
                setNewAccount({ ...newAccount, name: e.target.value })
              }
              className="col-span-3"
              placeholder="e.g. Sales"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="type" className="text-right">
              Type
            </Label>
            <Select
              value={newAccount.account_type}
              onValueChange={(v) =>
                setNewAccount({ ...newAccount, account_type: v })
              }
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="income_other">Other Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="expense_depreciation">
                  Depreciation
                </SelectItem>
                <SelectItem value="expense_direct_cost">Direct Cost</SelectItem>
                <SelectItem value="asset_receivable">Receivable</SelectItem>
                <SelectItem value="asset_cash">Cash</SelectItem>
                <SelectItem value="asset_current">Current Asset</SelectItem>
                <SelectItem value="asset_non_current">
                  Non-current Asset
                </SelectItem>
                <SelectItem value="asset_prepayments">Prepayments</SelectItem>
                <SelectItem value="asset_fixed">Fixed Asset</SelectItem>
                <SelectItem value="liability_payable">Payable</SelectItem>
                <SelectItem value="liability_credit_card">
                  Credit Card
                </SelectItem>
                <SelectItem value="liability_current">
                  Current Liability
                </SelectItem>
                <SelectItem value="liability_non_current">
                  Non-current Liability
                </SelectItem>
                <SelectItem value="equity">Equity</SelectItem>
                <SelectItem value="equity_unaffected">
                  Current Year Earnings
                </SelectItem>
                <SelectItem value="off_balance">Off-Balance Sheet</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </ModularModal>
    </div>
  );
}
