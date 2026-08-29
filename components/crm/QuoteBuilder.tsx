'use client';

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Trash2,
  Plus,
  PackagePlus,
  ChevronDown,
  ChevronUp,
  Info,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  calculateQuoteTotals,
  discountApprovalTier,
  APPROVAL_TIER_LABELS,
} from "@/lib/crm/quoteCalculations";

// âââ Types ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

interface LineItem {
  item_name: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
  is_optional: boolean;
  is_bundled: boolean;
  bundle_name: string;
  line_total?: number;
}

interface QuoteBuilderProps {
  oppId?: string;
  accountId?: string;
  initialData?: any;
  onSaved?: () => void;
  onSave?: (data: any) => Promise<void>;
  readOnly?: boolean;
}

const EMPTY_ITEM: LineItem = {
  item_name: "",
  description: "",
  quantity: 1,
  unit_price: 0,
  discount_percent: 0,
  tax_percent: 18,
  is_optional: false,
  is_bundled: false,
  bundle_name: "",
};

// âââ Approval tier badge ââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function ApprovalTierBadge({ avgDiscount }: { avgDiscount: number }) {
  const tier = discountApprovalTier(avgDiscount);
  if (tier === "auto")
    return (
      <span className="flex items-center gap-1 text-green-400 text-xs">
        <CheckCircle2 className="w-3 h-3" />
        {APPROVAL_TIER_LABELS.auto}
      </span>
    );
  if (tier === "manager")
    return (
      <span className="flex items-center gap-1 text-yellow-400 text-xs">
        <AlertTriangle className="w-3 h-3" />
        {APPROVAL_TIER_LABELS.manager}
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-red-400 text-xs">
      <AlertTriangle className="w-3 h-3" />
      {APPROVAL_TIER_LABELS.executive}
    </span>
  );
}

// âââ QuoteBuilder âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export default function QuoteBuilder({
  oppId,
  accountId,
  initialData,
  onSaved,
  onSave,
  readOnly = false,
}: QuoteBuilderProps) {
  const [items, setItems] = useState<LineItem[]>(
    initialData?.line_items?.length
      ? initialData.line_items.map((i: any) => ({
          ...EMPTY_ITEM,
          ...i,
          description: i.description || "",
          is_optional: i.is_optional || false,
          is_bundled: i.is_bundled || false,
          bundle_name: i.bundle_name || "",
        }))
      : [{ ...EMPTY_ITEM }]
  );

  const [validityDate, setValidityDate] = useState(
    initialData?.validity_date
      ? new Date(initialData.validity_date).toISOString().split("T")[0]
      : ""
  );
  const [terms, setTerms] = useState(initialData?.terms_and_conditions || "");
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [saving, setSaving] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Live calculation
  const { items: calculatedItems, totals } = calculateQuoteTotals(items);

  const updateItem = (index: number, field: keyof LineItem, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      (next[index] as any)[field] = value;
      return next;
    });
  };

  const addItem = () =>
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);

  const addOptionalItem = () =>
    setItems((prev) => [...prev, { ...EMPTY_ITEM, is_optional: true }]);

  const addBundleItem = () =>
    setItems((prev) => [
      ...prev,
      { ...EMPTY_ITEM, is_bundled: true, bundle_name: "Bundle" },
    ]);

  const removeItem = (index: number) =>
    setItems((prev) => prev.filter((_, i) => i !== index));

  const toggleExpanded = (index: number) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const saveQuote = async (submitForApproval: boolean) => {
    if (!validityDate) {
      toast.error("Validity Date is required before saving.");
      return;
    }

    // Auto-filter out any empty rows the user might have left blank
    const validItems = items.filter(item => item.item_name && item.item_name.trim() !== '');

    if (validItems.length === 0) {
      toast.error("You must add at least one valid line item to the quote.");
      return;
    }

    setSaving(true);
    const payload = {
      line_items: validItems,
      validity_date: new Date(validityDate),
      terms_and_conditions: terms,
      notes,
      submitForApproval,
    };

    if (onSave) {
      try {
        await onSave(payload);
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      const res = await fetch("/api/crm/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunity_id: oppId,
          account_id: accountId,
          ...payload,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          submitForApproval ? "Quote submitted for approval!" : "Draft saved!"
        );
        if (onSaved) onSaved();
      } else {
        toast.error(data.message || "Failed to save quote");
      }
    } catch {
      toast.error("Error saving quote");
    } finally {
      setSaving(false);
    }
  };

  // Group by bundle name for display
  const bundleNames = Array.from(
    new Set(items.filter((i) => i.is_bundled && i.bundle_name).map((i) => i.bundle_name))
  );
  const regularItems = items.filter((i) => !i.is_bundled);
  const optionalItems = items.filter((i) => i.is_optional && !i.is_bundled);

  return (
    <div className="space-y-6 bg-card border border-border p-6 rounded-lg">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Quote Builder</h2>
        {!readOnly && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="w-3 h-3 mr-1" /> Add Line
            </Button>
            <Button variant="outline" size="sm" onClick={addBundleItem}>
              <PackagePlus className="w-3 h-3 mr-1" /> Add Bundle
            </Button>
            <Button variant="outline" size="sm" onClick={addOptionalItem}>
              <Plus className="w-3 h-3 mr-1" /> Add Optional
            </Button>
          </div>
        )}
      </div>

      {/* Validity date */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium block mb-1">
            Validity Date <span className="text-red-400">*</span>
          </label>
          <Input
            type="date"
            value={validityDate}
            onChange={(e) => setValidityDate(e.target.value)}
            className="bg-background border-border"
            disabled={readOnly}
          />
        </div>
        <div className="flex items-end pb-1">
          <ApprovalTierBadge avgDiscount={totals.avgDiscountPercent} />
        </div>
      </div>

      {/* Line items table */}
      <div className="space-y-2">
        {/* Header */}
        <div className="grid grid-cols-[1fr_60px_90px_70px_70px_90px_36px_28px] gap-1 text-xs text-muted-foreground font-medium px-2 py-1 border-b border-border">
          <span>Item / Description <span className="text-red-400">*</span></span>
          <span>Qty</span>
          <span>Unit Price</span>
          <span>Disc %</span>
          <span>Tax %</span>
          <span className="text-right">Line Total</span>
          <span></span>
          <span></span>
        </div>

        {items.map((item, i) => {
          const calc = calculatedItems[i];
          const isExpanded = expandedRows.has(i);

          return (
            <div
              key={i}
              className={`border rounded-md ${
                item.is_optional
                  ? "border-dashed border-border bg-background/50"
                  : item.is_bundled
                  ? "border-blue-800 bg-blue-950/20"
                  : "border-border bg-background"
              }`}
            >
              {/* Badges */}
              {(item.is_optional || item.is_bundled) && (
                <div className="px-2 pt-1.5 flex gap-2">
                  {item.is_optional && (
                    <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                      Optional
                    </Badge>
                  )}
                  {item.is_bundled && (
                    <Badge className="text-xs bg-blue-800 text-blue-100">
                      Bundle: {item.bundle_name || "â"}
                    </Badge>
                  )}
                </div>
              )}

              {/* Main row */}
              <div className="grid grid-cols-[1fr_60px_90px_70px_70px_90px_36px_28px] gap-1 items-center p-2">
                <Input
                  value={item.item_name}
                  onChange={(e) => updateItem(i, "item_name", e.target.value)}
                  placeholder="Item name"
                  className="bg-card border-border h-8 text-sm"
                  disabled={readOnly}
                />
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(i, "quantity", parseFloat(e.target.value) || 0)
                  }
                  className="bg-card border-border h-8 text-sm"
                  disabled={readOnly}
                />
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.unit_price}
                  onChange={(e) =>
                    updateItem(i, "unit_price", parseFloat(e.target.value) || 0)
                  }
                  className="bg-card border-border h-8 text-sm"
                  disabled={readOnly}
                />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={item.discount_percent}
                  onChange={(e) =>
                    updateItem(
                      i,
                      "discount_percent",
                      parseFloat(e.target.value) || 0
                    )
                  }
                  className={`bg-card border-border h-8 text-sm ${
                    item.discount_percent > 20
                      ? "text-red-400"
                      : item.discount_percent > 5
                      ? "text-yellow-400"
                      : ""
                  }`}
                  disabled={readOnly}
                />
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={item.tax_percent}
                  onChange={(e) =>
                    updateItem(i, "tax_percent", parseFloat(e.target.value) || 0)
                  }
                  className="bg-card border-border h-8 text-sm"
                  disabled={readOnly}
                />
                <div className="text-right font-mono text-sm font-bold text-green-400">
                  ₹{(calc?.line_total || 0).toFixed(2)}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => toggleExpanded(i)}
                >
                  {isExpanded ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </Button>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-red-400"
                    onClick={() => removeItem(i)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>

              {/* Expanded: description + bundle name */}
              {isExpanded && (
                <div className="px-2 pb-3 space-y-2 border-t border-border mt-1 pt-2">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-0.5">
                      Description
                    </label>
                    <Input
                      value={item.description}
                      onChange={(e) =>
                        updateItem(i, "description", e.target.value)
                      }
                      placeholder="Optional description..."
                      className="bg-card border-border h-7 text-xs"
                      disabled={readOnly}
                    />
                  </div>
                  {item.is_bundled && (
                    <div>
                      <label className="text-xs text-muted-foreground block mb-0.5">
                        Bundle Name
                      </label>
                      <Input
                        value={item.bundle_name}
                        onChange={(e) =>
                          updateItem(i, "bundle_name", e.target.value)
                        }
                        placeholder="Bundle group name..."
                        className="bg-card border-border h-7 text-xs"
                        disabled={readOnly}
                      />
                    </div>
                  )}
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.is_optional}
                        onChange={(e) =>
                          updateItem(i, "is_optional", e.target.checked)
                        }
                        disabled={readOnly}
                      />
                      Mark as optional
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.is_bundled}
                        onChange={(e) =>
                          updateItem(i, "is_bundled", e.target.checked)
                        }
                        disabled={readOnly}
                      />
                      Part of bundle
                    </label>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="flex justify-end border-t border-border pt-4">
        <div className="w-72 space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>₹{totals.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-red-400">
            <span>Discount</span>
            <span>-₹{totals.discountTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-yellow-400">
            <span>Tax</span>
            <span>+₹{totals.taxTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold text-lg pt-2 border-t border-border text-foreground">
            <span>Grand Total</span>
            <span>₹{totals.grandTotal.toFixed(2)}</span>
          </div>
          <div className="text-xs text-muted-foreground text-right">
            Avg discount: {totals.avgDiscountPercent.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Notes & Terms */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium block mb-1">Notes</label>
          <textarea
            className="w-full bg-background border border-border rounded p-3 h-24 text-sm resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes for this quote..."
            disabled={readOnly}
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">
            Terms & Conditions
          </label>
          <textarea
            className="w-full bg-background border border-border rounded p-3 h-24 text-sm resize-none"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="Payment terms, delivery terms..."
            disabled={readOnly}
          />
        </div>
      </div>

      {/* Action buttons */}
      {!readOnly && (
        <div className="flex gap-3 justify-end border-t border-border pt-4">
          <Button
            variant="outline"
            onClick={() => saveQuote(false)}
            disabled={saving}
          >
            Save Draft
          </Button>
          <Button
            className="bg-primary hover:bg-primary/90"
            onClick={() => saveQuote(true)}
            disabled={saving}
          >
            Submit for Approval
          </Button>
        </div>
      )}
    </div>
  );
}
