"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Plus, X, Trash2, Tag, Calendar, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SelectSearchAdd } from "@/components/dashboard/SelectSearchAdd";

export function PricelistPopupContent({
  formData,
  setFormData,
  products,
  isViewOnly,
}: any) {
  const handleAddItem = () => {
    const newItem = {
      applied_on: "3_global",
      compute_price: "fixed",
      fixed_price: 0,
      percent_price: 0,
      min_quantity: 0,
    };
    setFormData({
      ...formData,
      items: [...formData.items, newItem],
    });
  };

  const handleRemoveItem = (index: number) => {
    const newItems = formData.items.filter((_: any, i: number) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div
        className={`space-y-4 ${isViewOnly ? "pointer-events-none opacity-90" : ""}`}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Pricelist Name *</Label>
            <Input
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g. Summer Discount 2024"
              className="text-lg font-bold"
            />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select
              value={formData.currencyId}
              onValueChange={(v) => setFormData({ ...formData, currencyId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="INR" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INR">INR (₹)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="EUR">EUR (€)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Rules Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Layers className="w-4 h-4" /> Price Rules
          </h3>
          {!isViewOnly && (
            <Button variant="outline" size="sm" onClick={handleAddItem}>
              <Plus className="w-3 h-3 mr-1" /> Add a Rule
            </Button>
          )}
        </div>

        <div className="space-y-4">
          {formData.items.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed rounded-xl bg-muted/20">
              <Tag className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-20" />
              <p className="text-sm text-muted-foreground">
                No rules defined yet.
              </p>
            </div>
          ) : (
            formData.items.map((item: any, idx: number) => (
              <Card
                key={idx}
                className="relative group overflow-hidden border-border bg-background/50"
              >
                <CardContent className="p-4 space-y-4">
                  {!isViewOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleRemoveItem(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                        Apply On
                      </Label>
                      <Select
                        value={item.applied_on}
                        onValueChange={(v) =>
                          handleItemChange(idx, "applied_on", v)
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3_global">
                            All Products (Global)
                          </SelectItem>
                          <SelectItem value="2_product_category">
                            Product Category
                          </SelectItem>
                          <SelectItem value="1_product">Product</SelectItem>
                          <SelectItem value="0_product_variant">
                            Product Variant
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {(item.applied_on === "1_product" ||
                      item.applied_on === "0_product_variant") && (
                      <div className="space-y-2 col-span-1 md:col-span-2">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                          Product
                        </Label>
                        <SelectSearchAdd
                          items={products.map((p: any) => ({
                            value: p._id,
                            label: p.header.name,
                          }))}
                          value={item.product_id}
                          onValueChange={(v) =>
                            handleItemChange(idx, "product_id", v)
                          }
                          placeholder="Search product..."
                        />
                      </div>
                    )}

                    {item.applied_on === "2_product_category" && (
                      <div className="space-y-2 col-span-1 md:col-span-2">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                          Category
                        </Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="Category ID or Name..."
                          value={item.categ_id || ""}
                          onChange={(e) =>
                            handleItemChange(idx, "categ_id", e.target.value)
                          }
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                        Min. Qty
                      </Label>
                      <Input
                        type="number"
                        className="h-8 text-xs"
                        value={item.min_quantity}
                        onChange={(e) =>
                          handleItemChange(
                            idx,
                            "min_quantity",
                            parseFloat(e.target.value),
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2 border-t border-border/50">
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                        Price Type
                      </Label>
                      <Select
                        value={item.compute_price}
                        onValueChange={(v) =>
                          handleItemChange(idx, "compute_price", v)
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Fixed Price</SelectItem>
                          <SelectItem value="percentage">
                            Discount (%)
                          </SelectItem>
                          <SelectItem value="formula">Formula</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {item.compute_price === "fixed" && (
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                          Fixed Price
                        </Label>
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={item.fixed_price}
                          onChange={(e) =>
                            handleItemChange(
                              idx,
                              "fixed_price",
                              parseFloat(e.target.value),
                            )
                          }
                        />
                      </div>
                    )}

                    {item.compute_price === "percentage" && (
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">
                          Discount %
                        </Label>
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={item.percent_price}
                          onChange={(e) =>
                            handleItemChange(
                              idx,
                              "percent_price",
                              parseFloat(e.target.value),
                            )
                          }
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-muted-foreground" />{" "}
                        Start Date
                      </Label>
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        value={
                          item.date_start
                            ? new Date(item.date_start)
                                .toISOString()
                                .split("T")[0]
                            : ""
                        }
                        onChange={(e) =>
                          handleItemChange(idx, "date_start", e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-muted-foreground" />{" "}
                        End Date
                      </Label>
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        value={
                          item.date_end
                            ? new Date(item.date_end)
                                .toISOString()
                                .split("T")[0]
                            : ""
                        }
                        onChange={(e) =>
                          handleItemChange(idx, "date_end", e.target.value)
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
