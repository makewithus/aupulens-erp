"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Plus, Trash2, GripVertical, X, Settings, Paperclip, ShoppingCart } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { computeInvoiceTotals, type InvoiceLineInput } from "@/lib/sales/invoiceMath";
import { uploadToCloudinary } from "@/lib/upload";

interface LineItem {
  itemId?: string;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
  discountMode: "percent" | "amount";
  taxRate: number;
}

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

export function SalesOrderForm() {
  const router = useRouter();

  const [customers, setCustomers] = useState<any[]>([]);
  const [subscriberCustomerIds, setSubscriberCustomerIds] = useState<Set<string>>(new Set());
  const [products, setProducts] = useState<any[]>([]);
  const [taxRates, setTaxRates] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [deliveryMethods, setDeliveryMethods] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [displayNumber, setDisplayNumber] = useState("");
  const [manualNumber, setManualNumber] = useState(false);
  const [numberModalOpen, setNumberModalOpen] = useState(false);
  const [numberMode, setNumberMode] = useState<"auto" | "manual">("auto");
  const [prefixInput, setPrefixInput] = useState("SO-");
  const [nextNumberInput, setNextNumberInput] = useState("1");
  const [restartFiscalYear, setRestartFiscalYear] = useState(false);
  const [savingNumberSettings, setSavingNumberSettings] = useState(false);

  const [referenceNumber, setReferenceNumber] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedShipmentDate, setExpectedShipmentDate] = useState("");
  const [paymentTermsLabel, setPaymentTermsLabel] = useState("Due on Receipt");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [salespersonId, setSalespersonId] = useState("");

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { name: "", qty: 1, unitPrice: 0, discount: 0, discountMode: "percent", taxRate: 0 },
  ]);

  const [extraDiscount, setExtraDiscount] = useState(0);
  const [extraDiscountMode, setExtraDiscountMode] = useState<"percent" | "amount">("amount");
  const [taxMode, setTaxMode] = useState<"none" | "tds" | "tcs">("none");
  const [taxId, setTaxId] = useState("");
  const [taxRate, setTaxRate] = useState(0);
  const [adjustment, setAdjustment] = useState(0);

  const [customerNotes, setCustomerNotes] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [attachments, setAttachments] = useState<{ name: string; url: string }[]>([]);

  useEffect(() => {
    fetch("/api/sales/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d.items || []));
    fetch("/api/sales/subscriptions")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const ids = new Set<string>(d.data.map((s: any) => String(s.customerId?._id || s.customerId)));
          setSubscriberCustomerIds(ids);
        }
      });
    fetch("/api/sales/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.items || []));
    fetch("/api/finance/accounting/tax-rates")
      .then((r) => r.json())
      .then((d) => setTaxRates(d.data || []));
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []));
    fetch("/api/sales/delivery-methods")
      .then((r) => r.json())
      .then((d) => setDeliveryMethods(d.data || []));
    fetch("/api/sales/sales-orders/next-number")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setDisplayNumber(d.data.number);
          setPrefixInput(d.data.prefix);
        }
      });
  }, []);

  const updateLine = (i: number, patch: Partial<LineItem>) =>
    setLineItems((items) => items.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));
  const addLine = () =>
    setLineItems((items) => [...items, { name: "", qty: 1, unitPrice: 0, discount: 0, discountMode: "percent", taxRate: 0 }]);
  const removeLine = (i: number) => setLineItems((items) => items.filter((_, idx) => idx !== i));

  const totals = useMemo(() => {
    const items: InvoiceLineInput[] = lineItems.map((li) => ({
      qty: li.qty,
      unitPrice: li.unitPrice,
      discount: li.discount,
      discountMode: li.discountMode,
      taxRate: li.taxRate,
      name: li.name,
    }));
    return computeInvoiceTotals({
      lineItems: items,
      extraDiscount,
      extraDiscountMode,
      tdsRate: taxMode === "tds" ? taxRate : 0,
      tcsRate: taxMode === "tcs" ? taxRate : 0,
    });
  }, [lineItems, extraDiscount, extraDiscountMode, taxMode, taxRate]);

  const grandTotal = totals.totalAmount + (Number(adjustment) || 0);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files);
    if (attachments.length + incoming.length > MAX_ATTACHMENTS) {
      toast.error(`You can upload a maximum of ${MAX_ATTACHMENTS} files`);
      return;
    }
    const oversized = incoming.find((f) => f.size > MAX_ATTACHMENT_SIZE);
    if (oversized) {
      toast.error(`${oversized.name} exceeds the 5MB per-file limit`);
      return;
    }
    const toastId = toast.loading("Uploading files...");
    try {
      const converted = await Promise.all(
        incoming.map(async (f) => ({ name: f.name, url: await uploadToCloudinary(f) })),
      );
      setAttachments((a) => [...a, ...converted]);
      toast.success("Files uploaded successfully", { id: toastId });
    } catch (e: any) {
      toast.error(e.message || "Failed to upload files", { id: toastId });
    }
  };

  const handleAddDeliveryMethod = async (name: string) => {
    setDeliveryMethod(name);
    if (!deliveryMethods.some((m) => m.name === name)) {
      const res = await fetch("/api/sales/delivery-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.success) setDeliveryMethods((m) => [...m, data.data]);
    }
  };

  const handleSaveNumberSettings = async () => {
    if (numberMode === "manual") {
      setManualNumber(true);
      setNumberModalOpen(false);
      return;
    }
    setSavingNumberSettings(true);
    try {
      const res = await fetch("/api/sales/sales-orders/number-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: prefixInput, nextNumber: nextNumberInput, restartFiscalYear }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save number preferences");
      setManualNumber(false);
      setDisplayNumber(`${prefixInput}${String(nextNumberInput).padStart(6, "0")}`);
      toast.success("Sales order number preferences saved");
      setNumberModalOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingNumberSettings(false);
    }
  };

  const handleSave = async (status: "draft" | "confirmed") => {
    if (!customerId) {
      toast.error("Customer is required");
      return;
    }
    if (lineItems.some((li) => !li.name.trim())) {
      toast.error("Every line item needs a name");
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        customerId,
        referenceNumber,
        orderDate,
        expectedShipmentDate: expectedShipmentDate || undefined,
        paymentTermsLabel,
        deliveryMethod: deliveryMethod || undefined,
        salespersonId: salespersonId || undefined,
        lineItems,
        extraDiscount,
        extraDiscountMode,
        taxMode,
        taxId: taxId || undefined,
        taxRate,
        adjustment,
        customerNotes,
        termsAndConditions,
        attachments,
        status,
      };
      if (manualNumber) body.number = displayNumber;
      const res = await fetch("/api/sales/sales-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save sales order");
      toast.success(status === "confirmed" ? "Sales order saved and sent" : "Sales order saved as draft");
      router.push("/sales/sales-orders");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      {/* HEADER */}
      <header className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center justify-between shadow-sm flex-wrap gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => router.push("/sales/sales-orders")}>
            <X className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-muted-foreground">New Sales Order</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">

      <div className="grid grid-cols-[180px_1fr] gap-y-4 gap-x-4 items-center max-w-2xl">
        <Label>
          Customer Name <span className="text-red-500">*</span>
        </Label>
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger>
            <SelectValue placeholder="Select or add a customer" />
          </SelectTrigger>
          <SelectContent>
            {customers.map((c: any) => (
              <SelectItem key={c._id} value={c._id}>
                <span className="flex items-center gap-2">
                  {c.header?.displayName || c.header?.name}
                  {subscriberCustomerIds.has(c._id) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-none border border-blue-300 text-blue-600">
                      Subscriber
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {customerId && (
          <>
            <Label>
              Sales Order# <span className="text-red-500">*</span>
            </Label>
        <div className="flex items-center gap-2">
          <Input value={displayNumber} disabled={!manualNumber} onChange={(e) => setDisplayNumber(e.target.value)} />
          <button
            onClick={() => {
              setNumberMode(manualNumber ? "manual" : "auto");
              setNumberModalOpen(true);
            }}
            title="Configure Sales Order# Preferences"
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <Label>Reference#</Label>
        <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />

        <Label>
          Sales Order Date <span className="text-red-500">*</span>
        </Label>
        <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />

        <Label>Expected Shipment Date</Label>
        <Input type="date" value={expectedShipmentDate} onChange={(e) => setExpectedShipmentDate(e.target.value)} />

        <Label>Payment Terms</Label>
        <Select value={paymentTermsLabel} onValueChange={setPaymentTermsLabel}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
            <SelectItem value="Net 15">Net 15</SelectItem>
            <SelectItem value="Net 30">Net 30</SelectItem>
            <SelectItem value="Net 45">Net 45</SelectItem>
            <SelectItem value="Net 60">Net 60</SelectItem>
          </SelectContent>
        </Select>

        <Label>Delivery Method</Label>
        <Input
          list="delivery-methods-list"
          placeholder="Select a delivery method or type to add"
          value={deliveryMethod}
          onChange={(e) => handleAddDeliveryMethod(e.target.value)}
        />
        <datalist id="delivery-methods-list">
          {deliveryMethods.map((m: any) => (
            <option key={m._id} value={m.name} />
          ))}
        </datalist>

        <Label>Salesperson</Label>
        <Select value={salespersonId} onValueChange={setSalespersonId}>
          <SelectTrigger>
            <SelectValue placeholder="Select or Add Salesperson" />
          </SelectTrigger>
          <SelectContent>
            {users.map((u: any) => (
              <SelectItem key={u._id} value={u._id}>
                {u.name || u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
          </>
        )}
      </div>

      {customerId && (
        <>
        <div className="border rounded-none">
        <div className="flex items-center justify-between p-3 border-b bg-muted/30">
          <span className="font-semibold text-sm">Item Table</span>
          <button className="text-xs text-blue-600 underline">Bulk Actions</button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ITEM DETAILS</TableHead>
              <TableHead className="w-24">QUANTITY</TableHead>
              <TableHead className="w-28">RATE</TableHead>
              <TableHead className="w-28 text-right">AMOUNT</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineItems.map((li, i) => {
              const computed = totals.computedLines[i];
              return (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <Input
                        list={`so-items-list-${i}`}
                        placeholder="Type or click to select an item."
                        value={li.name}
                        onChange={(e) => {
                          const match = products.find((p: any) => p.header?.name === e.target.value);
                          updateLine(i, {
                            name: e.target.value,
                            unitPrice: match ? match.tab_general_information?.list_price ?? li.unitPrice : li.unitPrice,
                            itemId: match?._id,
                          });
                        }}
                      />
                      <datalist id={`so-items-list-${i}`}>
                        {products.map((p: any) => (
                          <option key={p._id} value={p.header?.name} />
                        ))}
                      </datalist>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input type="number" value={li.qty} onChange={(e) => updateLine(i, { qty: Number(e.target.value) })} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" value={li.unitPrice} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} />
                  </TableCell>
                  <TableCell className="text-right">
                    {(computed?.lineTotal ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <button onClick={() => removeLine(i)}>
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="p-3 flex gap-4">
          <Button variant="outline" size="sm" onClick={addLine}>
            <Plus className="w-4 h-4 mr-1" /> Add New Row
          </Button>
          <Button variant="outline" size="sm" disabled>
            <Plus className="w-4 h-4 mr-1" /> Add Items in Bulk
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Customer Notes</Label>
            <Textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Terms &amp; Conditions</Label>
            <Textarea
              placeholder="Enter the terms and conditions of your business to be displayed in your transaction"
              value={termsAndConditions}
              onChange={(e) => setTermsAndConditions(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Attach File(s) to Sales Order</Label>
            <label className="flex items-center gap-2 border rounded-none px-3 py-2 text-sm cursor-pointer w-fit">
              <Paperclip className="w-4 h-4" /> Upload File
              <input type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            </label>
            <p className="text-xs text-muted-foreground">
              You can upload a maximum of {MAX_ATTACHMENTS} files, 5MB each
            </p>
            {attachments.length > 0 && (
              <ul className="text-xs space-y-1">
                {attachments.map((a, i) => (
                  <li key={i} className="flex items-center justify-between border rounded-none px-2 py-1">
                    <span className="truncate">{a.name}</span>
                    <button onClick={() => setAttachments((arr) => arr.filter((_, idx) => idx !== i))}>
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border rounded-none p-4 space-y-3 text-sm h-fit">
          <div className="flex justify-between">
            <span>Sub Total</span>
            <span>{totals.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between items-center gap-2">
            <span>Discount</span>
            <div className="flex items-center gap-1">
              <Input type="number" className="w-24 h-8" value={extraDiscount} onChange={(e) => setExtraDiscount(Number(e.target.value))} />
              <Select value={extraDiscountMode} onValueChange={(v) => setExtraDiscountMode(v as any)}>
                <SelectTrigger className="w-16 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">%</SelectItem>
                  <SelectItem value="amount">₹</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <RadioGroup value={taxMode} onValueChange={(v) => setTaxMode(v as any)} className="flex gap-4">
              <label className="flex items-center gap-1 text-xs">
                <RadioGroupItem value="none" /> None
              </label>
              <label className="flex items-center gap-1 text-xs">
                <RadioGroupItem value="tds" /> TDS
              </label>
              <label className="flex items-center gap-1 text-xs">
                <RadioGroupItem value="tcs" /> TCS
              </label>
            </RadioGroup>
            {taxMode !== "none" && (
              <Select
                value={taxId}
                onValueChange={(v) => {
                  setTaxId(v);
                  setTaxRate(taxRates.find((t: any) => t._id === v)?.ratePercent || 0);
                }}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select a Tax" />
                </SelectTrigger>
                <SelectContent>
                  {taxRates
                    .filter((t: any) => t.type === taxMode)
                    .map((t: any) => (
                    <SelectItem key={t._id} value={t._id}>
                      {t.name} ({t.ratePercent}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex justify-between">
              <span>{taxMode.toUpperCase() || "Tax"}</span>
              <span>
                {taxMode === "tds" ? "- " : ""}
                {(taxMode === "tds" ? totals.tdsAmount : taxMode === "tcs" ? totals.tcsAmount : 0).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center gap-2">
            <span>Adjustment</span>
            <Input type="number" className="w-24 h-8" value={adjustment} onChange={(e) => setAdjustment(Number(e.target.value))} />
          </div>

          <div className="flex justify-between font-bold text-base pt-2 border-t">
            <span>Total (₹)</span>
            <span>{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Additional Fields: Add custom fields to your sales orders by going to Settings → Sales → Sales Orders → Field Customization.
      </p>
      </>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 flex items-center justify-end gap-3 z-50">
        <Button variant="outline" onClick={() => handleSave("draft")} disabled={saving}>
          Save as Draft
        </Button>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleSave("confirmed")} disabled={saving}>
          {saving ? "Saving..." : "Save and Send"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/sales/sales-orders")}>
          Cancel
        </Button>
      </div>

      <Dialog open={numberModalOpen} onOpenChange={setNumberModalOpen}>
        <DialogContent className="max-w-lg">
          <h2 className="text-lg font-semibold mb-1">Configure Sales Order# Preferences</h2>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your sales order numbers are set on auto-generate mode to save your time. Are you sure about changing this setting?
            </p>
            <RadioGroup value={numberMode} onValueChange={(v) => setNumberMode(v as any)} className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <RadioGroupItem value="auto" /> Continue auto-generating sales order numbers
              </label>
              {numberMode === "auto" && (
                <div className="ml-6 grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Prefix</Label>
                    <Input value={prefixInput} onChange={(e) => setPrefixInput(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Next Number</Label>
                    <Input value={nextNumberInput} onChange={(e) => setNextNumberInput(e.target.value)} />
                  </div>
                  <label className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox checked={restartFiscalYear} onCheckedChange={(v) => setRestartFiscalYear(!!v)} />
                    Restart numbering for sales orders at the start of each fiscal year.
                  </label>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm font-medium">
                <RadioGroupItem value="manual" /> Enter sales order numbers manually
              </label>
            </RadioGroup>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setNumberModalOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSaveNumberSettings} disabled={savingNumberSettings}>
              {savingNumberSettings ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </main>
    </div>
  );
}
