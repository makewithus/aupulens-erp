"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, CreditCard, Banknote, QrCode, CheckCircle2, ShoppingCart } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { formatSalesCurrency } from "@/lib/sales/formatters";

interface PosItem {
  id: string;
  itemId?: string;
  name: string;
  qty: number;
  unitPrice: number;
  taxRate: number;
}

export function PosBillingDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [items, setItems] = useState<PosItem[]>([
    { id: crypto.randomUUID(), name: "", qty: 1, unitPrice: 0, taxRate: 0 },
  ]);
  const [paymentMode, setPaymentMode] = useState<string>("cash");
  const [receivedAmount, setReceivedAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const loadData = async () => {
      try {
        const [cRes, pRes] = await Promise.all([
          cachedFetch("/api/sales/customers?limit=100"),
          cachedFetch("/api/sales/products?limit=100"),
        ]);
        const cData = await cRes.json();
        const pData = await pRes.json();
        if (cData.success && Array.isArray(cData.data)) {
          setCustomers(cData.data);
          const walkIn = cData.data.find(
            (c: any) =>
              c.header?.name?.toLowerCase().includes("walk-in") ||
              c.header?.name?.toLowerCase().includes("cash customer") ||
              c.header?.name?.toLowerCase().includes("retail"),
          );
          if (walkIn) setSelectedCustomerId(walkIn._id);
          else if (cData.data.length > 0) setSelectedCustomerId(cData.data[0]._id);
        }
        if (pData.success && Array.isArray(pData.data)) {
          setProducts(pData.data);
        }
      } catch (err) {
        console.error("Failed to load POS reference data:", err);
      }
    };
    loadData();
  }, [open]);

  const subtotal = items.reduce((acc, it) => acc + (it.qty || 0) * (it.unitPrice || 0), 0);
  const tax = items.reduce(
    (acc, it) => acc + (it.qty || 0) * (it.unitPrice || 0) * ((it.taxRate || 0) / 100),
    0,
  );
  const grandTotal = Math.round((subtotal + tax) * 100) / 100;
  const changeDue = Math.max(0, (Number(receivedAmount) || 0) - grandTotal);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", qty: 1, unitPrice: 0, taxRate: 0 },
    ]);
  };

  const removeItem = (lineId: string) => {
    setItems((prev) => prev.length <= 1 ? prev : prev.filter((item) => item.id !== lineId));
  };

  const handleProductSelect = (lineId: string, productId: string) => {
    const prod = products.find((p) => p._id === productId);
    if (!prod) return;
    const name = prod.header?.name || "Product";
    const unitPrice = Number(prod.tab_general_information?.list_price) || 0;
    const taxRate = Number(prod.tab_general_information?.customer_taxes) || 0;
    setItems((prev) =>
      prev.map((item, i) =>
        item.id === lineId
          ? { ...item, itemId: prod._id, name, unitPrice, taxRate }
          : item,
      ),
    );
  };

  const handleCompleteSale = async () => {
    if (!selectedCustomerId) {
      toast.error("Please select a customer for the sale.");
      return;
    }
    const validLines = items.filter((it) => it.name.trim() && it.qty > 0);
    if (validLines.length === 0) {
      toast.error("Please add at least one item with a valid product name and quantity.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        customerId: selectedCustomerId,
        invoiceDate: new Date().toISOString(),
        paymentTerms: "immediate",
        lineItems: validLines.map((it) => ({
          itemId: it.itemId || undefined,
          name: it.name,
          qty: it.qty,
          unitPrice: it.unitPrice,
          taxRate: it.taxRate,
          discount: 0,
          discountMode: "amount",
        })),
        status: "paid",
        markedFullyPaid: true,
        paymentMode,
        customerNotes: `POS Counter Sale (${paymentMode.toUpperCase()})`,
      };

      const res = await cachedFetch("/api/sales/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to process POS sale");
      }

      toast.success(`POS Sale Complete: Invoice ${data.data?.number || "Created"} paid successfully!`);
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to complete POS sale");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-none p-0 overflow-hidden">
        <DialogHeader className="p-6 border-b border-border/40 bg-muted/20">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" />
            <DialogTitle className="text-xl font-medium tracking-tight">Point of Sale (POS) Counter Billing</DialogTitle>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Fast counter billing for retail and walk-in sales. Generates an instant, fully-paid invoice and ledger entry.
          </p>
        </DialogHeader>

        <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto">
          {/* Customer Selection */}
          <div className="space-y-2">
            <Label className="text-xs uppercase font-mono tracking-wider text-muted-foreground">Customer</Label>
            <select
              aria-label="Customer"
              className="w-full h-10 px-3 bg-background border border-border text-sm rounded-none focus:outline-none focus:ring-1 focus:ring-primary"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
            >
              <option value="">-- Select Customer --</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.header?.name || "Customer"} {c.contact_details?.phone ? `(${c.contact_details.phone})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase font-mono tracking-wider text-muted-foreground">Cart Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-8 rounded-none text-xs">
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Product
              </Button>
            </div>

            <div className="border border-border/40 divide-y divide-border/20">
              {items.map((item) => (
                <div key={item.id} className="p-3 flex flex-wrap items-center gap-3 bg-card/40">
                  <div className="flex-1 min-w-[200px]">
                    <select
                      aria-label="Select catalog product"
                      className="w-full h-9 px-2 bg-background border border-border text-xs rounded-none"
                      value={item.itemId || ""}
                      onChange={(e) => handleProductSelect(item.id, e.target.value)}
                    >
                      <option value="">Custom Item / Select Product...</option>
                      {products.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.header?.name || "Product"} ({formatSalesCurrency(p.tab_general_information?.list_price || 0)})
                        </option>
                      ))}
                    </select>
                    {!item.itemId && (
                      <Input
                        aria-label="Item name"
                        className="mt-1 h-8 text-xs rounded-none"
                        placeholder="Item name description"
                        value={item.name}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((it) => (it.id === item.id ? { ...it, name: e.target.value } : it)),
                          )
                        }
                      />
                    )}
                  </div>

                  <div className="w-20">
                    <Label className="text-[10px] text-muted-foreground">Qty</Label>
                    <Input
                      aria-label="Quantity"
                      type="number"
                      min="1"
                      className="h-8 text-xs text-right rounded-none"
                      value={item.qty}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((it) =>
                            it.id === item.id ? { ...it, qty: Math.max(1, Number(e.target.value) || 1) } : it,
                          ),
                        )
                      }
                    />
                  </div>

                  <div className="w-28">
                    <Label className="text-[10px] text-muted-foreground">Rate (₹)</Label>
                    <Input
                      aria-label="Unit price"
                      type="number"
                      step="0.01"
                      className="h-8 text-xs text-right rounded-none"
                      value={item.unitPrice}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((it) =>
                            it.id === item.id ? { ...it, unitPrice: Number(e.target.value) || 0 } : it,
                          ),
                        )
                      }
                    />
                  </div>

                  <div className="w-28 text-right font-mono text-sm pt-4">
                    {formatSalesCurrency((item.qty || 0) * (item.unitPrice || 0))}
                  </div>

                  {items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Payment Method & Totals */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="space-y-3">
              <Label className="text-xs uppercase font-mono tracking-wider text-muted-foreground">Payment Method</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={paymentMode === "cash" ? "default" : "outline"}
                  className="rounded-none h-11 flex flex-col gap-1 text-xs"
                  onClick={() => setPaymentMode("cash")}
                >
                  <Banknote className="w-4 h-4" /> Cash
                </Button>
                <Button
                  type="button"
                  variant={paymentMode === "upi" ? "default" : "outline"}
                  className="rounded-none h-11 flex flex-col gap-1 text-xs"
                  onClick={() => setPaymentMode("upi")}
                >
                  <QrCode className="w-4 h-4" /> UPI / QR
                </Button>
                <Button
                  type="button"
                  variant={paymentMode === "card" ? "default" : "outline"}
                  className="rounded-none h-11 flex flex-col gap-1 text-xs"
                  onClick={() => setPaymentMode("card")}
                >
                  <CreditCard className="w-4 h-4" /> Card
                </Button>
              </div>

              {paymentMode === "cash" && (
                <div className="space-y-1.5 pt-2">
                  <Label className="text-xs text-muted-foreground">Cash Received from Customer (₹)</Label>
                  <Input
                    type="number"
                    step="1"
                    placeholder={`e.g. ${grandTotal}`}
                    className="h-9 rounded-none text-sm font-mono"
                    value={receivedAmount}
                    onChange={(e) => setReceivedAmount(e.target.value)}
                  />
                  {Number(receivedAmount) > grandTotal && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-mono">
                      Change to Return: {formatSalesCurrency(changeDue)}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-muted/30 p-4 border border-border/40 space-y-2 font-mono text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal:</span>
                <span>{formatSalesCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax:</span>
                <span>{formatSalesCurrency(tax)}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between text-base font-bold text-foreground">
                <span>Grand Total:</span>
                <span className="text-primary">{formatSalesCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-border/40 bg-muted/10 flex justify-end gap-2">
          <Button variant="outline" className="rounded-none" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button className="rounded-none font-mono" onClick={handleCompleteSale} disabled={submitting || grandTotal <= 0}>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            {submitting ? "Processing..." : `Complete Sale (${formatSalesCurrency(grandTotal)})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
