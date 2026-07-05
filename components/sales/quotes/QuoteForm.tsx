"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Plus, Trash2, GripVertical, X, Settings } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { computeInvoiceTotals, type InvoiceLineInput } from "@/lib/sales/invoiceMath";

interface QuoteLineItem {
  itemId?: string;
  name: string;
  qty: number;
  unitPrice: number;
  discount: number;
  discountMode: "percent" | "amount";
  taxRate: number;
}

export interface QuoteFormValue {
  customerId: string;
  reference?: string;
  quoteDate: string;
  expiryDate?: string;
  salesperson?: string;
  projectName?: string;
  subject?: string;
  lineItems: QuoteLineItem[];
  extraDiscount: number;
  extraDiscountMode: "percent" | "amount";
  taxes: { mode: "none" | "tds" | "tcs"; taxId?: string; rate: number };
  adjustment: number;
  customerNotes: string;
  terms?: string;
}

export const EMPTY_QUOTE: QuoteFormValue = {
  customerId: "",
  quoteDate: new Date().toISOString().slice(0, 10),
  lineItems: [{ name: "", qty: 1, unitPrice: 0, discount: 0, discountMode: "percent", taxRate: 0 }],
  extraDiscount: 0,
  extraDiscountMode: "amount",
  taxes: { mode: "none", rate: 0 },
  adjustment: 0,
  customerNotes: "Looking forward for your business.",
};

interface QuoteFormProps {
  initialValue?: QuoteFormValue;
  quoteId?: string;
  quoteNumber?: string;
}

export function QuoteForm({ initialValue, quoteId, quoteNumber }: QuoteFormProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<"quote" | "subscription">("quote");
  const [form, setForm] = useState<QuoteFormValue>(initialValue || EMPTY_QUOTE);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [taxRates, setTaxRates] = useState<any[]>([]);
  const [displayNumber, setDisplayNumber] = useState(quoteNumber || "");
  const [manualNumber, setManualNumber] = useState(false);
  const [saving, setSaving] = useState(false);

  const [numberModalOpen, setNumberModalOpen] = useState(false);
  const [numberMode, setNumberMode] = useState<"auto" | "manual">("auto");
  const [prefixInput, setPrefixInput] = useState("QUO-");
  const [nextNumberInput, setNextNumberInput] = useState("1");
  const [restartFiscalYear, setRestartFiscalYear] = useState(false);
  const [savingNumberSettings, setSavingNumberSettings] = useState(false);

  // Subscription Quote fields (only relevant when activeTab === "subscription")
  const [profileName, setProfileName] = useState("");
  const [billEvery, setBillEvery] = useState(1);
  const [billEveryUnit, setBillEveryUnit] = useState("weeks");
  const [neverExpires, setNeverExpires] = useState(true);
  const [expiresAfterCycles, setExpiresAfterCycles] = useState("");
  const [paymentMode, setPaymentMode] = useState<"offline" | "online">("offline");

  useEffect(() => {
    fetch("/api/sales/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d.items || []));
    fetch("/api/sales/products")
      .then((r) => r.json())
      .then((d) => setProducts(d.items || []));
    fetch("/api/finance/accounting/tax-rates")
      .then((r) => r.json())
      .then((d) => setTaxRates(d.data || []));
    if (!quoteId) {
      fetch("/api/sales/quotes/next-number")
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            setDisplayNumber(d.data.number);
            setPrefixInput(d.data.prefix);
          }
        });
    }
  }, [quoteId]);

  // Pre-fill Salesperson with the logged-in user for a faster default — still
  // fully editable, matching the "prefilled but changeable" UX the user asked for.
  useEffect(() => {
    if (!quoteId && !form.salesperson && session?.user?.name) {
      setForm((f) => ({ ...f, salesperson: session.user!.name || "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.name, quoteId]);

  const update = (patch: Partial<QuoteFormValue>) => setForm((f) => ({ ...f, ...patch }));

  const updateLine = (i: number, patch: Partial<QuoteLineItem>) => {
    const next = [...form.lineItems];
    next[i] = { ...next[i], ...patch };
    update({ lineItems: next });
  };

  const addLine = () =>
    update({ lineItems: [...form.lineItems, { name: "", qty: 1, unitPrice: 0, discount: 0, discountMode: "percent", taxRate: 0 }] });
  const removeLine = (i: number) => update({ lineItems: form.lineItems.filter((_, idx) => idx !== i) });

  const totals = useMemo(() => {
    const lineItems: InvoiceLineInput[] = form.lineItems.map((li) => ({
      qty: li.qty,
      unitPrice: li.unitPrice,
      discount: li.discount,
      discountMode: li.discountMode,
      taxRate: li.taxRate,
      name: li.name,
    }));
    const taxMode = form.taxes.mode;
    return computeInvoiceTotals({
      lineItems,
      extraDiscount: form.extraDiscount,
      extraDiscountMode: form.extraDiscountMode,
      tdsRate: taxMode === "tds" ? form.taxes.rate : 0,
      tcsRate: taxMode === "tcs" ? form.taxes.rate : 0,
    });
  }, [form]);

  const grandTotal = totals.totalAmount + (Number(form.adjustment) || 0);

  const handleSaveNumberSettings = async () => {
    if (numberMode === "manual") {
      setManualNumber(true);
      setNumberModalOpen(false);
      return;
    }
    setSavingNumberSettings(true);
    try {
      const res = await fetch("/api/sales/quotes/number-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: prefixInput, nextNumber: nextNumberInput, restartFiscalYear }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save number preferences");
      setManualNumber(false);
      setDisplayNumber(`${prefixInput}${String(nextNumberInput).padStart(6, "0")}`);
      toast.success("Quote number preferences saved");
      setNumberModalOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingNumberSettings(false);
    }
  };

  const handleSave = async (status: "draft" | "sent") => {
    if (!form.customerId) {
      toast.error("Customer is required");
      return;
    }
    if (form.lineItems.some((li) => !li.name.trim())) {
      toast.error("Every line item needs a name");
      return;
    }
    setSaving(true);
    try {
      const url = quoteId ? `/api/sales/quotes/${quoteId}` : "/api/sales/quotes";
      const method = quoteId ? "PATCH" : "POST";
      const body: any = { ...form, status };
      if (manualNumber) body.quoteNumber = displayNumber;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save quote");
      toast.success(status === "sent" ? "Quote saved and sent" : "Quote saved as draft");
      router.push("/sales/quotes");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSubscription = async () => {
    if (!form.customerId) {
      toast.error("Customer is required");
      return;
    }
    if (!profileName.trim()) {
      toast.error("Profile Name is required");
      return;
    }
    if (form.lineItems.some((li) => !li.name.trim())) {
      toast.error("Every line item needs a name");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sales/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: form.customerId,
          profileName,
          lineItems: form.lineItems,
          billEvery,
          billEveryUnit,
          neverExpires,
          expiresAfterCycles: neverExpires ? undefined : Number(expiresAfterCycles) || undefined,
          customerNotes: form.customerNotes,
          terms: form.terms,
          paymentMode,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save subscription");
      toast.success("Subscription created");
      router.push("/sales/subscriptions");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToInvoice = async () => {
    if (!quoteId) return;
    try {
      const res = await fetch(`/api/sales/quotes/${quoteId}/convert-to-invoice`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to convert to invoice");
      toast.success("Converted to invoice");
      router.push(`/sales/invoices/${data.data.invoice._id}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24">
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-4">
          <button
            className={`font-semibold pb-1 ${activeTab === "quote" ? "border-b-2 border-blue-600" : "text-muted-foreground"}`}
            onClick={() => setActiveTab("quote")}
          >
            Quote
          </button>
          <button
            className={`pb-1 ${activeTab === "subscription" ? "font-semibold border-b-2 border-blue-600" : "text-muted-foreground"}`}
            onClick={() => setActiveTab("subscription")}
          >
            Subscription Quote
          </button>
        </div>
        <button onClick={() => router.push("/sales/quotes")}>
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-[180px_1fr] gap-y-4 gap-x-4 items-center max-w-2xl">
        <Label>
          Customer Name <span className="text-red-500">*</span>
        </Label>
        <Select value={form.customerId} onValueChange={(v) => update({ customerId: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select or add a customer" />
          </SelectTrigger>
          <SelectContent>
            {customers.map((c: any) => (
              <SelectItem key={c._id} value={c._id}>
                {c.header?.displayName || c.header?.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Label>Quote #</Label>
        <div className="flex items-center gap-2">
          <Input
            value={displayNumber}
            disabled={!manualNumber}
            onChange={(e) => setDisplayNumber(e.target.value)}
          />
          <button
            onClick={() => {
              setNumberMode(manualNumber ? "manual" : "auto");
              setNumberModalOpen(true);
            }}
            title="Configure Quote Number Preferences"
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {activeTab === "quote" && (
          <>
            <Label>Reference#</Label>
            <Input value={form.reference || ""} onChange={(e) => update({ reference: e.target.value })} />

            <Label>Quote Date</Label>
            <div className="flex gap-3">
              <Input type="date" value={form.quoteDate} onChange={(e) => update({ quoteDate: e.target.value })} />
              <Input
                type="date"
                placeholder="Expiry Date"
                value={form.expiryDate || ""}
                onChange={(e) => update({ expiryDate: e.target.value })}
              />
            </div>
          </>
        )}

        <Label>Salesperson</Label>
        <Input
          placeholder="Select or Add Salesperson"
          value={form.salesperson || ""}
          onChange={(e) => update({ salesperson: e.target.value })}
        />

        {activeTab === "quote" && (
          <>
            <Label>Project Name</Label>
            <Input
              placeholder="Select a project"
              value={form.projectName || ""}
              onChange={(e) => update({ projectName: e.target.value })}
              disabled={!form.customerId}
            />
          </>
        )}

        <Label>Subject</Label>
        <Input
          placeholder="Let your customer know what this Quote is for"
          value={form.subject || ""}
          onChange={(e) => update({ subject: e.target.value })}
        />
      </div>

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
            {form.lineItems.map((li, i) => {
              const computed = totals.computedLines[i];
              return (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <Input
                        list={`items-list-${i}`}
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
                      <datalist id={`items-list-${i}`}>
                        {products.map((p: any) => (
                          <option key={p._id} value={p.header?.name} />
                        ))}
                      </datalist>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={li.qty}
                      onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={li.unitPrice}
                      onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
                    />
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

      {activeTab === "subscription" && (
        <div className="grid grid-cols-[180px_1fr] gap-y-4 gap-x-4 items-center max-w-2xl border rounded-none p-4">
          <Label htmlFor="subscription-profile-name">
            Profile Name <span className="text-red-500">*</span>
          </Label>
          <Input id="subscription-profile-name" value={profileName} onChange={(e) => setProfileName(e.target.value)} />

          <Label>
            Bill Every <span className="text-red-500">*</span>
          </Label>
          <div className="flex gap-2">
            <Input
              type="number"
              className="w-20"
              value={billEvery}
              onChange={(e) => setBillEvery(Number(e.target.value))}
              min={1}
            />
            <Select value={billEveryUnit} onValueChange={setBillEveryUnit}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="days">Day(s)</SelectItem>
                <SelectItem value="weeks">Week(s)</SelectItem>
                <SelectItem value="months">Month(s)</SelectItem>
                <SelectItem value="years">Year(s)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Label>Expires After</Label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              className="w-24"
              disabled={neverExpires}
              value={expiresAfterCycles}
              onChange={(e) => setExpiresAfterCycles(e.target.value)}
              placeholder="cycles"
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={neverExpires} onCheckedChange={(v) => setNeverExpires(!!v)} />
              Never Expires
            </label>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Customer Notes</Label>
            <Textarea value={form.customerNotes} onChange={(e) => update({ customerNotes: e.target.value })} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Terms &amp; Conditions</Label>
            <Textarea
              placeholder="Enter the terms and conditions of your business to be displayed in your transaction"
              value={form.terms || ""}
              onChange={(e) => update({ terms: e.target.value })}
              rows={3}
            />
          </div>
          {activeTab === "subscription" && (
            <div className="space-y-1.5">
              <Label>Payment Mode</Label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={paymentMode === "offline"}
                  onCheckedChange={(v) => setPaymentMode(v ? "offline" : "online")}
                />
                Collect payment offline
              </label>
            </div>
          )}
        </div>

        {activeTab === "quote" && (
          <div className="border rounded-none p-4 space-y-3 text-sm h-fit">
            <div className="flex justify-between">
              <span>Sub Total</span>
              <span>{totals.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span>Discount</span>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  className="w-24 h-8"
                  value={form.extraDiscount}
                  onChange={(e) => update({ extraDiscount: Number(e.target.value) })}
                />
                <Select value={form.extraDiscountMode} onValueChange={(v) => update({ extraDiscountMode: v as any })}>
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
              <RadioGroup
                value={form.taxes.mode}
                onValueChange={(v) => update({ taxes: { ...form.taxes, mode: v as any } })}
                className="flex gap-4"
              >
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
              {form.taxes.mode !== "none" && (
                <Select
                  value={form.taxes.taxId || ""}
                  onValueChange={(v) => {
                    const rate = taxRates.find((t: any) => t._id === v)?.ratePercent || 0;
                    update({ taxes: { ...form.taxes, taxId: v, rate } });
                  }}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select a Tax" />
                  </SelectTrigger>
                  <SelectContent>
                    {taxRates.map((t: any) => (
                      <SelectItem key={t._id} value={t._id}>
                        {t.name} ({t.ratePercent}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex justify-between">
                <span>{form.taxes.mode.toUpperCase() || "Tax"}</span>
                <span>
                  {form.taxes.mode === "tds" ? "- " : ""}
                  {(form.taxes.mode === "tds" ? totals.tdsAmount : form.taxes.mode === "tcs" ? totals.tcsAmount : 0).toLocaleString(
                    "en-IN",
                    { minimumFractionDigits: 2 },
                  )}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center gap-2">
              <span>Adjustment</span>
              <Input
                type="number"
                className="w-24 h-8"
                value={form.adjustment}
                onChange={(e) => update({ adjustment: Number(e.target.value) })}
              />
            </div>

            <div className="flex justify-between font-bold text-base pt-2 border-t">
              <span>Total (₹)</span>
              <span>{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Additional Fields: Start adding custom fields for your quotes by going to Settings → Sales → Quotes.
      </p>

      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {activeTab === "quote" ? (
            <>
              <Button variant="outline" onClick={() => handleSave("draft")} disabled={saving}>
                Save as Draft
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleSave("sent")} disabled={saving}>
                {saving ? "Saving..." : "Save and Send"}
              </Button>
              {quoteId && (
                <Button variant="outline" onClick={handleConvertToInvoice}>
                  Convert to Invoice
                </Button>
              )}
            </>
          ) : (
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSaveSubscription} disabled={saving}>
              {saving ? "Saving..." : "Continue"}
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push("/sales/quotes")}>
            Cancel
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          PDF Template: &apos;Spreadsheet Template&apos; <span className="text-blue-600 underline cursor-pointer">Change</span>
        </div>
      </div>

      <Dialog open={numberModalOpen} onOpenChange={setNumberModalOpen}>
        <DialogContent className="max-w-lg">
          <h2 className="text-lg font-semibold mb-4">Configure Quote Number Preferences</h2>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your quote numbers are set on auto-generate mode to save your time. Are you sure about changing this
              setting?
            </p>
            <RadioGroup value={numberMode} onValueChange={(v) => setNumberMode(v as any)} className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <RadioGroupItem value="auto" /> Continue auto-generating quote numbers
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
                    Restart numbering for quotes at the start of each fiscal year.
                  </label>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm font-medium">
                <RadioGroupItem value="manual" /> Enter quote numbers manually
              </label>
            </RadioGroup>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setNumberModalOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleSaveNumberSettings}
              disabled={savingNumberSettings}
            >
              {savingNumberSettings ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
