"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Info, RefreshCw } from "lucide-react";

interface CouponPopupProps {
  formData: any;
  setFormData: (fn: (prev: any) => any) => void;
  isViewOnly: boolean;
}

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function CouponPopup({ formData, setFormData, isViewOnly }: CouponPopupProps) {
  const update = (key: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [key]: value }));
  };

  const updateNested = (outerKey: string, innerKey: string, value: any) => {
    setFormData((prev: any) => ({
      ...prev,
      [outerKey]: { ...(prev[outerKey] || {}), [innerKey]: value },
    }));
  };

  const Field = ({
    label,
    required,
    hint,
    children,
  }: {
    label: string;
    required?: boolean;
    hint?: boolean;
    children: React.ReactNode;
  }) => (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className={required ? "text-red-500" : "text-foreground"}>
          {label}{required && "*"}
        </Label>
        {hint && <Info className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      {children}
    </div>
  );

  return (
    <div className="space-y-0 overflow-y-auto max-h-[75vh]">
      {/* Basic Info */}
      <div className="p-6 border-b space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" required>
            <Input
              value={formData.name || ""}
              onChange={(e) => update("name", e.target.value)}
              disabled={isViewOnly}
              className="h-9"
              placeholder="Coupon name"
            />
          </Field>
          <Field label="Coupon Code" required>
            <div className="space-y-1">
              <Input
                value={formData.couponCode || ""}
                onChange={(e) => update("couponCode", e.target.value.toUpperCase())}
                disabled={isViewOnly}
                className="h-9"
                placeholder="e.g. SUMMER20"
              />
              {!isViewOnly && (
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  onClick={() => update("couponCode", generateCode())}
                >
                  <RefreshCw className="h-3 w-3" />
                  Generate Code
                </button>
              )}
            </div>
          </Field>
        </div>
        <Field label="Description">
          <Textarea
            value={formData.description || ""}
            onChange={(e) => update("description", e.target.value)}
            disabled={isViewOnly}
            rows={2}
            className="resize-none text-sm"
          />
        </Field>
      </div>

      {/* Discount Details */}
      <div className="p-6 border-b space-y-4">
        <h3 className="text-base font-semibold text-foreground">Discount Details</h3>
        <div className="space-y-4">
          <Field label="Discount Type" required>
            <Select
              value={formData.discountType || "item-level"}
              onValueChange={(v) => update("discountType", v)}
              disabled={isViewOnly}
            >
              <SelectTrigger className="h-9 max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="item-level">Item-Level</SelectItem>
                <SelectItem value="order-level">Order-Level</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Applicable Products" required>
            <Select
              value={formData.applicableProducts || "all"}
              onValueChange={(v) => update("applicableProducts", v)}
              disabled={isViewOnly}
            >
              <SelectTrigger className="h-9 max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                <SelectItem value="specific">Specific Products</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Applicable Items" required>
            <Select
              value={formData.applicableItems || "all"}
              onValueChange={(v) => update("applicableItems", v)}
              disabled={isViewOnly}
            >
              <SelectTrigger className="h-9 max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                <SelectItem value="specific">Specific Items</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Redemption Type" required hint>
            <Select
              value={formData.redemptionType || "one-time"}
              onValueChange={(v) => update("redemptionType", v)}
              disabled={isViewOnly}
            >
              <SelectTrigger className="h-9 max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one-time">One-Time</SelectItem>
                <SelectItem value="unlimited">Unlimited</SelectItem>
                <SelectItem value="limited">Limited</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="space-y-2">
            <Label className="text-foreground">Discount By</Label>
            <div className="flex items-center gap-6">
              {[
                { val: "percentage", label: "Percentage" },
                { val: "flat-rate", label: "Flat Rate" },
              ].map((opt) => (
                <label key={opt.val} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="discountBy"
                    value={opt.val}
                    checked={(formData.discountBy || "flat-rate") === opt.val}
                    onChange={() => update("discountBy", opt.val)}
                    disabled={isViewOnly}
                    className="accent-blue-600"
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <Field label="Discount Value" required>
            <div className="flex max-w-xs">
              <Input
                type="number"
                min="0"
                value={formData.discountValue ?? ""}
                onChange={(e) => update("discountValue", parseFloat(e.target.value) || 0)}
                disabled={isViewOnly}
                className="rounded-r-none h-9"
                placeholder="0"
              />
              <span className="flex items-center px-3 bg-muted border border-l-0 rounded-r-md text-sm text-muted-foreground">
                {formData.discountBy === "percentage"
                  ? "%"
                  : formData.currency || "INR"}
              </span>
            </div>
          </Field>
        </div>
      </div>

      {/* Limitations & Restrictions */}
      <div className="p-6 border-b space-y-4">
        <h3 className="text-base font-semibold text-foreground">Limitations &amp; Restrictions</h3>

        <Field label="Eligible Customers" required>
          <Select
            value={formData.eligibleCustomers || "all"}
            onValueChange={(v) => update("eligibleCustomers", v)}
            disabled={isViewOnly}
          >
            <SelectTrigger className="h-9 max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              <SelectItem value="specific">Specific Customers</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Minimum Order Amount" hint>
            <div className="flex">
              <span className="flex items-center px-3 bg-muted border border-r-0 rounded-l-md text-sm text-muted-foreground">
                {formData.currency || "INR"}
              </span>
              <Input
                type="number"
                min="0"
                value={formData.minimumOrderAmount ?? 0}
                onChange={(e) => update("minimumOrderAmount", parseFloat(e.target.value) || 0)}
                disabled={isViewOnly}
                className="rounded-l-none h-9"
              />
            </div>
          </Field>

          <Field label="Maximum Redemptions" hint>
            <div className="flex gap-2">
              <Select
                value={formData.maximumRedemptions?.type || "unlimited"}
                onValueChange={(v) => updateNested("maximumRedemptions", "type", v)}
                disabled={isViewOnly}
              >
                <SelectTrigger className="h-9 w-36 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unlimited">Unlimited</SelectItem>
                  <SelectItem value="limited">Limited</SelectItem>
                </SelectContent>
              </Select>
              {formData.maximumRedemptions?.type === "limited" && (
                <Input
                  type="number"
                  min="1"
                  value={formData.maximumRedemptions?.value ?? ""}
                  onChange={(e) => updateNested("maximumRedemptions", "value", parseInt(e.target.value) || 0)}
                  disabled={isViewOnly}
                  className="h-9"
                  placeholder="Count"
                />
              )}
            </div>
          </Field>

          <Field label="Maximum Redemptions Per Customer" hint>
            <div className="flex gap-2">
              <Select
                value={formData.maximumRedemptionsPerCustomer?.type || "unlimited"}
                onValueChange={(v) => updateNested("maximumRedemptionsPerCustomer", "type", v)}
                disabled={isViewOnly}
              >
                <SelectTrigger className="h-9 w-36 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unlimited">Unlimited</SelectItem>
                  <SelectItem value="limited">Limited</SelectItem>
                </SelectContent>
              </Select>
              {formData.maximumRedemptionsPerCustomer?.type === "limited" && (
                <Input
                  type="number"
                  min="1"
                  value={formData.maximumRedemptionsPerCustomer?.value ?? ""}
                  onChange={(e) => updateNested("maximumRedemptionsPerCustomer", "value", parseInt(e.target.value) || 0)}
                  disabled={isViewOnly}
                  className="h-9"
                  placeholder="Count"
                />
              )}
            </div>
          </Field>
        </div>
      </div>

      {/* Availability */}
      <div className="p-6 space-y-4">
        <h3 className="text-base font-semibold text-foreground">Availability</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Valid From">
            <Input
              type="datetime-local"
              value={
                formData.validFrom
                  ? new Date(formData.validFrom).toISOString().slice(0, 16)
                  : new Date().toISOString().slice(0, 16)
              }
              onChange={(e) => update("validFrom", e.target.value ? new Date(e.target.value) : null)}
              disabled={isViewOnly}
              className="h-9"
            />
          </Field>

          <Field label="Valid Till">
            <Input
              type="datetime-local"
              value={
                formData.validTill
                  ? new Date(formData.validTill).toISOString().slice(0, 16)
                  : ""
              }
              onChange={(e) => update("validTill", e.target.value ? new Date(e.target.value) : null)}
              disabled={isViewOnly || formData.neverExpires}
              className="h-9"
            />
            <div className="flex items-center gap-2 mt-2">
              <input
                id="neverExpires"
                type="checkbox"
                checked={!!formData.neverExpires}
                onChange={(e) => update("neverExpires", e.target.checked)}
                disabled={isViewOnly}
                className="accent-blue-600 h-4 w-4 cursor-pointer"
              />
              <label htmlFor="neverExpires" className="text-sm cursor-pointer">
                Never Expires
              </label>
            </div>
          </Field>
        </div>
      </div>
    </div>
  );
}
