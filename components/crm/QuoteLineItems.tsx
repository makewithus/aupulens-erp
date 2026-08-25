'use client';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, PackagePlus, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { calculateQuoteTotals } from "@/lib/crm/quoteCalculations";

interface LineItem {
  item_name: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
  is_optional?: boolean;
  is_bundled?: boolean;
  bundle_name?: string;
  line_total?: number;
}

interface QuoteLineItemsProps {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
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

export default function QuoteLineItems({
  items,
  onChange,
  readOnly = false,
}: QuoteLineItemsProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const update = (index: number, field: keyof LineItem, value: any) => {
    const next = [...items];
    (next[index] as any)[field] = value;
    onChange(next);
  };

  const add = () => onChange([...items, { ...EMPTY_ITEM }]);
  const addOptional = () => onChange([...items, { ...EMPTY_ITEM, is_optional: true }]);
  const addBundle = () =>
    onChange([...items, { ...EMPTY_ITEM, is_bundled: true, bundle_name: "Bundle" }]);
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));

  const toggleExpanded = (index: number) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const { items: calculated, totals } = calculateQuoteTotals(items);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">Line Items</h3>
        {!readOnly && (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={add}>
              <Plus className="w-3 h-3 mr-1" />
              Add
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={addBundle}
            >
              <PackagePlus className="w-3 h-3 mr-1" />
              Bundle
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={addOptional}
            >
              + Optional
            </Button>
          </div>
        )}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_56px_80px_64px_64px_80px_28px_28px] gap-1 text-xs text-muted-foreground px-2">
        <span>Item</span>
        <span>Qty</span>
        <span>Unit $</span>
        <span>Disc%</span>
        <span>Tax%</span>
        <span className="text-right">Total</span>
        <span />
        <span />
      </div>

      {items.map((item, i) => {
        const calc = calculated[i];
        const isExpanded = expandedRows.has(i);

        return (
          <div
            key={i}
            className={`rounded border ${
              item.is_optional
                ? "border-dashed border-border bg-background/50"
                : item.is_bundled
                ? "border-blue-800/60 bg-blue-950/10"
                : "border-border bg-background"
            }`}
          >
            {(item.is_optional || item.is_bundled) && (
              <div className="flex gap-1 px-2 pt-1">
                {item.is_optional && (
                  <Badge variant="outline" className="text-[10px] h-4 border-border text-muted-foreground">
                    Optional
                  </Badge>
                )}
                {item.is_bundled && (
                  <Badge className="text-[10px] h-4 bg-blue-800/70">
                    {item.bundle_name || "Bundle"}
                  </Badge>
                )}
              </div>
            )}

            <div className="grid grid-cols-[1fr_56px_80px_64px_64px_80px_28px_28px] gap-1 items-center p-2">
              <Input
                value={item.item_name}
                onChange={(e) => update(i, "item_name", e.target.value)}
                placeholder="Item name"
                className="h-7 text-xs bg-card border-border"
                disabled={readOnly}
              />
              <Input
                type="number"
                min={0}
                value={item.quantity}
                onChange={(e) =>
                  update(i, "quantity", parseFloat(e.target.value) || 0)
                }
                className="h-7 text-xs bg-card border-border"
                disabled={readOnly}
              />
              <Input
                type="number"
                min={0}
                step={0.01}
                value={item.unit_price}
                onChange={(e) =>
                  update(i, "unit_price", parseFloat(e.target.value) || 0)
                }
                className="h-7 text-xs bg-card border-border"
                disabled={readOnly}
              />
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={item.discount_percent}
                onChange={(e) =>
                  update(i, "discount_percent", parseFloat(e.target.value) || 0)
                }
                className={`h-7 text-xs bg-card border-border ${
                  (item.discount_percent || 0) > 20
                    ? "text-red-400"
                    : (item.discount_percent || 0) > 5
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
                  update(i, "tax_percent", parseFloat(e.target.value) || 0)
                }
                className="h-7 text-xs bg-card border-border"
                disabled={readOnly}
              />
              <div className="text-right text-xs font-mono font-bold text-green-400 pr-1">
                ${(calc?.line_total ?? 0).toFixed(2)}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                onClick={() => toggleExpanded(i)}
              >
                {isExpanded ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </Button>
              {!readOnly ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-red-400"
                  onClick={() => remove(i)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              ) : (
                <div />
              )}
            </div>

            {isExpanded && (
              <div className="px-2 pb-3 pt-2 border-t border-border space-y-2">
                <Input
                  value={item.description}
                  onChange={(e) => update(i, "description", e.target.value)}
                  placeholder="Description (optional)"
                  className="h-7 text-xs bg-card border-border"
                  disabled={readOnly}
                />
                {item.is_bundled && (
                  <Input
                    value={item.bundle_name}
                    onChange={(e) => update(i, "bundle_name", e.target.value)}
                    placeholder="Bundle name"
                    className="h-7 text-xs bg-card border-border"
                    disabled={readOnly}
                  />
                )}
                {!readOnly && (
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!item.is_optional}
                        onChange={(e) =>
                          update(i, "is_optional", e.target.checked)
                        }
                      />
                      Optional
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!item.is_bundled}
                        onChange={(e) =>
                          update(i, "is_bundled", e.target.checked)
                        }
                      />
                      Bundle
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Summary totals */}
      <div className="flex justify-end pt-2 border-t border-border">
        <div className="w-56 text-xs space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>₹{totals.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-red-400">
            <span>Discount</span>
            <span>-${totals.discountTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-yellow-400">
            <span>Tax</span>
            <span>+${totals.taxTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold text-sm text-white border-t border-border pt-1">
            <span>Grand Total</span>
            <span>₹{totals.grandTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
