"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function CreateProductDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (product: any) => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");
  const [taxRate, setTaxRate] = useState("18");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return toast.error("Product name is required");
    setSaving(true);
    try {
      const res = await fetch("/api/sales/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          header: { name: name.trim(), sale_ok: true, purchase_ok: false, can_be_expensed: false },
          tab_general_information: {
            type: "consu",
            invoice_policy: "order",
            list_price: Number(price) || 0,
            standard_price: 0,
            default_code: code || undefined,
          },
          // Product defaults to draft (Product.status), which is invisible
          // to every other picker (?status=published) — but the user is
          // explicitly adding this to a real invoice line right now, so
          // treat it the same as publishing it from the Products page.
          // Otherwise it's silently unusable everywhere except this one
          // invoice, which reads as "draft products can still be added to
          // invoices" from the user's side.
          status: "published",
        }),
      });
      const data = await res.json();
      if (res.ok && (data.product || data.success)) {
        toast.success("Product created");
        onCreated({ ...(data.product || data.data), _taxRate: Number(taxRate) || 0 });
        setName(""); setPrice("0"); setTaxRate("18"); setCode("");
        onOpenChange(false);
      } else {
        toast.error(data.error || data.message || "Failed to create product");
      }
    } catch {
      toast.error("Failed to create product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Add new Product</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product or service name" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Unit Price</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Tax Rate %</Label>
              <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>SKU / Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? "Creating..." : "Add Product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
