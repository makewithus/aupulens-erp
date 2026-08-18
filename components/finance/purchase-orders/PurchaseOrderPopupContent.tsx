"use client";

import React, { useEffect, useState } from "react";
import { Building, Calendar, Package, Trash2, Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SelectSearchAdd } from "@/components/dashboard/SelectSearchAdd";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

interface PurchaseOrderPopupContentProps {
  formData: any;
  setFormData: (data: any) => void;
  isViewOnly?: boolean;
}

export default function PurchaseOrderPopupContent({
  formData,
  setFormData,
  isViewOnly = false,
}: PurchaseOrderPopupContentProps) {
  const [vendors, setVendors] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [vendorRes, productRes] = await Promise.all([
          fetch("/api/sales/customers"),
          fetch("/api/sales/products"),
        ]);
        const [vendorData, productData] = await Promise.all([
          vendorRes.json(),
          productRes.json(),
        ]);
        if (!active) return;
        setVendors(vendorData.items || []);
        setProducts(productData.items || []);
      } catch (e) {
        console.error("Fetch purchase order popup resources error:", e);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const updateField = (field: string, value: any) => {
    if (isViewOnly) return;
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const calculateTotals = (lines: any[]) => {
    const amountUntaxed = lines.reduce(
      (acc, line) => acc + (line.priceSubtotal || 0),
      0,
    );
    const amountTax = Number((amountUntaxed * 0.18).toFixed(2));
    const amountTotal = Number((amountUntaxed + amountTax).toFixed(2));
    setFormData((prev: any) => ({
      ...prev,
      orderLines: lines,
      totals: { amountUntaxed, amountTax, amountTotal },
    }));
  };

  const addLine = () => {
    const newLines = [
      ...(formData.orderLines || []),
      {
        productId: null,
        name: "",
        productQty: 1,
        priceUnit: 0,
        priceSubtotal: 0,
      },
    ];
    updateField("orderLines", newLines);
  };

  const removeLine = (index: number) => {
    const newLines = [...(formData.orderLines || [])];
    newLines.splice(index, 1);
    calculateTotals(newLines);
  };

  const updateLine = (index: number, field: string, value: any) => {
    const newLines = [...(formData.orderLines || [])];
    newLines[index] = { ...newLines[index], [field]: value };

    if (field === "productId") {
      const prod = products.find((p) => p._id === value);
      if (prod) {
        newLines[index].name = prod.header?.name;
        newLines[index].priceUnit =
          prod.tab_general_information?.standard_price || 0;
      }
    }

    if (field === "productQty" || field === "priceUnit") {
      newLines[index].priceSubtotal =
        (newLines[index].productQty || 0) * (newLines[index].priceUnit || 0);
    }

    calculateTotals(newLines);
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex items-start gap-6 border-b pb-6">
        <div className="w-24 h-24 bg-primary/10 flex items-center justify-center none-2xl shrink-0">
          <Package className="w-12 h-12 text-primary" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-black tracking-tighter uppercase whitespace-nowrap">
              {formData.name || "Draft Purchase Order"}
            </h1>
            <Badge
              variant="outline"
              className="none-full px-3 uppercase text-[10px] font-black border-2"
            >
              {formData.status}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-muted-foreground" />
              <SelectSearchAdd
                items={vendors}
                value={formData.partnerId}
                onValueChange={(v) => updateField("partnerId", v)}
                placeholder="Select Vendor"
                keyField="_id"
                labelField="header.name"
                className="border-none bg-transparent font-bold h-auto p-0 shadow-none focus-visible:ring-0 text-primary uppercase tracking-tight"
              />
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                disabled={isViewOnly}
                value={
                  formData.dateOrder
                    ? new Date(formData.dateOrder).toISOString().split("T")[0]
                    : ""
                }
                onChange={(e) => updateField("dateOrder", e.target.value)}
                className="border-none bg-transparent font-bold h-auto p-0 shadow-none focus-visible:ring-0 text-sm uppercase tracking-tight w-auto"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Order Lines */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
            Order Lines
          </Label>
          {!isViewOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={addLine}
              className="text-xs font-bold uppercase"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Line
            </Button>
          )}
        </div>
        <div className="rounded-2xl border-2 overflow-hidden bg-muted/5">
          <Table className="w-full">
            <TableHeader className="bg-muted/50 border-b-2">
              <TableRow>
                <TableHead className="p-4 text-left text-[9px] font-black uppercase tracking-widest opacity-40">
                  Product
                </TableHead>
                <TableHead className="p-4 text-left text-[9px] font-black uppercase tracking-widest opacity-40">
                  Label
                </TableHead>
                <TableHead className="p-4 text-center text-[9px] font-black uppercase tracking-widest opacity-40">
                  Qty
                </TableHead>
                <TableHead className="p-4 text-center text-[9px] font-black uppercase tracking-widest opacity-40">
                  Received
                </TableHead>
                <TableHead className="p-4 text-right text-[9px] font-black uppercase tracking-widest opacity-40">
                  Price
                </TableHead>
                <TableHead className="p-4 text-right text-[9px] font-black uppercase tracking-widest opacity-40 w-32">
                  Subtotal
                </TableHead>
                {!isViewOnly && <TableHead className="p-4 w-12"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y-2 border-primary/5">
              {(formData.orderLines || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-10 text-center text-sm text-muted-foreground">
                    No lines yet.
                  </TableCell>
                </TableRow>
              ) : (
                (formData.orderLines || []).map((line: any, idx: number) => (
                  <TableRow key={idx} className="group hover:bg-muted/40">
                    <TableCell className="p-2 w-48">
                      <SelectSearchAdd
                        items={products}
                        value={
                          typeof line.productId === "object"
                            ? line.productId?._id
                            : line.productId
                        }
                        onValueChange={(v) => updateLine(idx, "productId", v)}
                        keyField="_id"
                        labelField="header.name"
                        className="border-none shadow-none bg-transparent hover:bg-primary/5 h-10 font-bold uppercase text-[11px]"
                      />
                    </TableCell>
                    <TableCell className="p-2">
                      <Input
                        value={line.name}
                        disabled={isViewOnly}
                        onChange={(e) => updateLine(idx, "name", e.target.value)}
                        className="border-none shadow-none bg-transparent h-10 text-[11px]"
                      />
                    </TableCell>
                    <TableCell className="p-2 w-20">
                      <Input
                        type="number"
                        disabled={isViewOnly}
                        value={line.productQty}
                        onChange={(e) =>
                          updateLine(idx, "productQty", parseFloat(e.target.value))
                        }
                        className="border-none shadow-none bg-transparent text-center h-10 font-black"
                      />
                    </TableCell>
                    <TableCell className="p-4 text-center font-bold text-[11px] tabular-nums text-muted-foreground">
                      {line.receivedQty || 0}
                    </TableCell>
                    <TableCell className="p-2 w-32">
                      <Input
                        type="number"
                        disabled={isViewOnly}
                        value={line.priceUnit}
                        onChange={(e) =>
                          updateLine(idx, "priceUnit", parseFloat(e.target.value))
                        }
                        className="border-none shadow-none bg-transparent text-right h-10 font-black"
                      />
                    </TableCell>
                    <TableCell className="p-4 text-right font-black text-[11px] tabular-nums">
                      ₹ {(line.priceSubtotal || 0).toLocaleString()}
                    </TableCell>
                    {!isViewOnly && (
                      <TableCell className="p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(idx)}
                          className="text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-full max-w-xs space-y-2 rounded-2xl border-2 bg-muted/5 p-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-bold uppercase text-[10px]">
              Untaxed Amount
            </span>
            <span className="font-bold">
              ₹ {(formData.totals?.amountUntaxed || 0).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground font-bold uppercase text-[10px]">
              Tax (18%)
            </span>
            <span className="font-bold">
              ₹ {(formData.totals?.amountTax || 0).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between text-base border-t pt-2">
            <span className="font-black uppercase text-xs">Total</span>
            <span className="font-black">
              ₹ {(formData.totals?.amountTotal || 0).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
