"use client";

import * as React from "react";
import {
  Plus,
  Calendar as CalendarIcon,
  FileText,
  Landmark,
  Calculator,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SelectSearchAdd } from "@/components/dashboard/SelectSearchAdd";
import { toast } from "sonner";

interface AssetPopupContentProps {
  formData: any;
  setFormData: (data: any) => void;
  isViewOnly?: boolean;
}

export function AssetPopupContent({
  formData,
  setFormData,
  isViewOnly = false,
}: AssetPopupContentProps) {
  const [accounts, setAccounts] = React.useState<any[]>([]);

  React.useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/accounting/accounts");
      const data = await res.json();
      setAccounts(data.items || []);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    }
  };

  const onAddAccount = async (newAcc: any) => {
    try {
      const res = await fetch("/api/accounting/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAcc),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create account");
      }
      const data = await res.json();
      const created = data.account;
      await fetchAccounts();
      return created;
    } catch (error: any) {
      toast.error(error.message);
      return null;
    }
  };

  return (
    <div className="space-y-8 py-4 px-1">
      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <FileText className="h-3 w-3" /> Asset Name
            </Label>
            <Input
              value={formData.name || ""}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g. Delivery Truck 01"
              disabled={isViewOnly}
              className="rounded-none border-t-0 border-x-0 border-b-2 bg-transparent focus-visible:ring-0 px-0 h-10 text-lg font-bold"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <CalendarIcon className="h-3 w-3" /> Purchase Date
              </Label>
              <Input
                type="date"
                value={
                  formData.purchaseDate
                    ? new Date(formData.purchaseDate)
                        .toISOString()
                        .split("T")[0]
                    : ""
                }
                onChange={(e) =>
                  setFormData({ ...formData, purchaseDate: e.target.value })
                }
                disabled={isViewOnly}
                className="rounded-none border-t-0 border-x-0 border-b-2 bg-transparent focus-visible:ring-0 px-0 h-9"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Calculator className="h-3 w-3" /> Method
              </Label>
              <Select
                value={formData.method || "linear"}
                onValueChange={(v) => setFormData({ ...formData, method: v })}
                disabled={isViewOnly}
              >
                <SelectTrigger className="rounded-none border-t-0 border-x-0 border-b-2 bg-transparent focus:ring-0 px-0 h-9 font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="linear">Linear</SelectItem>
                  <SelectItem value="degressive">Degressive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="space-y-6 bg-muted/20 p-6 border border-dashed rounded-xl">
          <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
            <Landmark className="h-4 w-4" /> Financial Values
          </h3>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">
                Original Value
              </Label>
              <div className="relative">
                <span className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                  ₹
                </span>
                <Input
                  type="number"
                  value={formData.originalValue || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      originalValue: parseFloat(e.target.value) || 0,
                    })
                  }
                  disabled={isViewOnly}
                  className="rounded-none border-t-0 border-x-0 border-b-2 bg-transparent focus-visible:ring-0 pl-4 pr-0 h-9 font-mono font-bold"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">
                Salvage Value
              </Label>
              <div className="relative">
                <span className="absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                  ₹
                </span>
                <Input
                  type="number"
                  value={formData.salvageValue || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      salvageValue: parseFloat(e.target.value) || 0,
                    })
                  }
                  disabled={isViewOnly}
                  className="rounded-none border-t-0 border-x-0 border-b-2 bg-transparent focus-visible:ring-0 pl-4 pr-0 h-9 font-mono font-bold"
                />
              </div>
            </div>
            <div className="space-y-2 col-span-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">
                Duration (Years)
              </Label>
              <Input
                type="number"
                value={formData.durationYears || 5}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    durationYears: parseFloat(e.target.value) || 0,
                  })
                }
                disabled={isViewOnly}
                className="rounded-none border-t-0 border-x-0 border-b-2 bg-transparent focus-visible:ring-0 px-0 h-9 font-mono font-bold"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Accounts Section */}
      <div className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
          <Landmark className="h-4 w-4" /> Account Configuration
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Asset Account
            </Label>
            <SelectSearchAdd
              items={accounts}
              value={formData.accounts?.assetAccountId}
              onValueChange={(v) =>
                setFormData({
                  ...formData,
                  accounts: { ...formData.accounts, assetAccountId: v },
                })
              }
              placeholder="Select Asset Account"
              onAdd={onAddAccount}
              dialogTitle="Create Asset Account"
              keyField="_id"
              labelField="name"
              secondaryField="code"
              defaultAccountType="asset_fixed"
              className="rounded-none border-t-0 border-x-0 border-b-2 h-10 px-0"
            />
            <p className="text-[10px] text-muted-foreground italic">
              Balance sheet account for the asset itself
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">
              Depreciation Account
            </Label>
            <SelectSearchAdd
              items={accounts}
              value={formData.accounts?.depreciationAccountId}
              onValueChange={(v) =>
                setFormData({
                  ...formData,
                  accounts: { ...formData.accounts, depreciationAccountId: v },
                })
              }
              placeholder="Select Depreciation Account"
              onAdd={onAddAccount}
              dialogTitle="Create Depreciation Account"
              keyField="_id"
              labelField="name"
              secondaryField="code"
              defaultAccountType="expense_depreciation"
              className="rounded-none border-t-0 border-x-0 border-b-2 h-10 px-0"
            />
            <p className="text-[10px] text-muted-foreground italic">
              Expense account for annual depreciation
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
