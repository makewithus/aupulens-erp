"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings, X, AlertTriangle } from "lucide-react";

interface InvoiceRow {
  _id: string;
  number: string;
  invoiceDate: string;
  totalAmount: number;
  payments: { amount: number }[];
}

export function PaymentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillInvoiceId = searchParams.get("invoiceId") || "";

  const [customers, setCustomers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [modes, setModes] = useState<any[]>([]);
  const [customFieldDefs, setCustomFieldDefs] = useState<any[]>([]);
  const [saving, setSaving] = useState<"draft" | "paid" | null>(null);

  const [customerId, setCustomerId] = useState(() => searchParams.get("customerId") || "");
  const enabled = !!customerId;

  const [amountReceived, setAmountReceived] = useState("");
  const [bankCharges, setBankCharges] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));

  const [displayNumber, setDisplayNumber] = useState("");
  const [manualNumber, setManualNumber] = useState(false);
  const [numberModalOpen, setNumberModalOpen] = useState(false);
  const [numberMode, setNumberMode] = useState<"auto" | "manual">("auto");
  const [prefixInput, setPrefixInput] = useState("PAY-");
  const [nextNumberInput, setNextNumberInput] = useState("1");
  const [restartFiscalYear, setRestartFiscalYear] = useState(false);
  const [savingNumberSettings, setSavingNumberSettings] = useState(false);

  const [mode, setMode] = useState("Cash");
  const [depositToAccountId, setDepositToAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [taxDeducted, setTaxDeducted] = useState(false);
  const [tdsAccountId, setTdsAccountId] = useState("");
  const [tdsAmount, setTdsAmount] = useState("");

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/sales/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d.items || []));
    fetch("/api/accounting/accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.items || []));
    fetch("/api/accounting/accounts?type=bank")
      .then((r) => r.json())
      .then((d) => setBankAccounts(d.items || []));
    fetch("/api/sales/payment-modes")
      .then((r) => r.json())
      .then((d) => d.success && setModes(d.data));
    fetch("/api/sales/payments/custom-fields")
      .then((r) => r.json())
      .then((d) => d.success && setCustomFieldDefs(d.data.filter((f: any) => f.status === "active")));
    fetch("/api/sales/payments/next-number")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setDisplayNumber(d.data.number);
          setPrefixInput(d.data.prefix);
        }
      });
  }, []);

  useEffect(() => {
    if (!customerId) {
      setInvoices([]);
      setApplied({});
      return;
    }
    setLoadingInvoices(true);
    fetch(`/api/sales/invoices?customerId=${customerId}&status=unpaid&limit=200`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setInvoices(d.data || []);
      })
      .finally(() => setLoadingInvoices(false));
  }, [customerId]);

  const amountDue = (inv: InvoiceRow) => {
    const paid = (inv.payments || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    return Math.max(0, Number(inv.totalAmount) - paid);
  };

  // Auto-apply: whenever Amount Received changes and the user hasn't started
  // hand-editing row amounts yet, distribute it across unpaid invoices in
  // date order up to each row's amount due — still fully overridable per row.
  const [touchedManually, setTouchedManually] = useState(false);

  // Arriving from an invoice's "Record Payment" action (row action or detail
  // page button): once that invoice's row is in the loaded list, apply its
  // whole due amount to it specifically rather than letting the generic
  // date-order auto-apply above possibly spread the received amount across
  // an earlier invoice instead.
  useEffect(() => {
    if (!prefillInvoiceId || !invoices.length) return;
    const target = invoices.find((inv) => inv._id === prefillInvoiceId);
    if (!target) return;
    const due = amountDue(target);
    setAmountReceived(due.toFixed(2));
    setApplied({ [prefillInvoiceId]: due.toFixed(2) });
    setTouchedManually(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillInvoiceId, invoices]);
  useEffect(() => {
    if (touchedManually || !invoices.length) return;
    const received = Number(amountReceived) || 0;
    let remaining = received;
    const next: Record<string, string> = {};
    for (const inv of invoices) {
      const due = amountDue(inv);
      const take = Math.min(due, remaining);
      if (take > 0) next[inv._id] = take.toFixed(2);
      remaining -= take;
    }
    setApplied(next);
  }, [amountReceived, invoices]);

  const totalApplied = useMemo(
    () => Object.values(applied).reduce((acc, v) => acc + (Number(v) || 0), 0),
    [applied],
  );
  const receivedNum = Number(amountReceived) || 0;
  const bankChargesNum = Number(bankCharges) || 0;
  const tdsNum = taxDeducted ? Number(tdsAmount) || 0 : 0;
  const excess = Math.max(0, receivedNum - bankChargesNum - tdsNum - totalApplied);
  const overApplied = totalApplied + bankChargesNum + tdsNum > receivedNum + 0.005;

  const handleSaveNumberSettings = async () => {
    if (numberMode === "manual") {
      setManualNumber(true);
      setNumberModalOpen(false);
      return;
    }
    setSavingNumberSettings(true);
    try {
      const res = await fetch("/api/sales/payments/number-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: prefixInput, nextNumber: nextNumberInput, restartFiscalYear }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setManualNumber(false);
      const next = await fetch("/api/sales/payments/next-number").then((r) => r.json());
      if (next.success) setDisplayNumber(next.data.number);
      toast.success("Payment numbering preferences saved");
      setNumberModalOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save numbering preferences");
    } finally {
      setSavingNumberSettings(false);
    }
  };

  const handleAddMode = async (value: string) => {
    setMode(value);
    if (value && !modes.some((m: any) => m.name === value)) {
      const res = await fetch("/api/sales/payment-modes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
      });
      const data = await res.json();
      if (data.success) setModes((m) => [...m, data.data]);
    }
  };

  const validate = (): string | null => {
    if (!customerId) return "Customer is required";
    if (!receivedNum || receivedNum <= 0) return "Amount received must be greater than 0";
    if (!depositToAccountId) return "Deposit To account is required";
    if (taxDeducted && !tdsAccountId) return "TDS account is required when tax is deducted";
    for (const def of customFieldDefs) {
      if (def.required && !customFieldValues[def.label]) return `${def.label} is required`;
    }
    if (overApplied) return "Total applied payment cannot exceed the amount received";
    return null;
  };

  const handleSave = async (status: "draft" | "paid") => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(status);
    try {
      const allocations = Object.entries(applied)
        .map(([invoiceId, amount]) => ({ invoiceId, amount: Number(amount) || 0 }))
        .filter((a) => a.amount > 0);

      const body: any = {
        customerId,
        amountReceived: receivedNum,
        bankCharges: bankChargesNum,
        paymentDate,
        mode,
        depositToAccountId,
        reference,
        taxDeducted,
        tdsAccountId: taxDeducted ? tdsAccountId : undefined,
        tdsAmount: tdsNum,
        allocations,
        notes,
        customFieldValues,
        status,
      };
      if (manualNumber) body.paymentNumber = displayNumber;

      const res = await fetch("/api/sales/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to record payment");
      toast.success(status === "paid" ? "Payment recorded successfully" : "Payment saved as draft");
      router.push("/sales/payments");
    } catch (e: any) {
      toast.error(e.message || "Failed to record payment");
    } finally {
      setSaving(null);
    }
  };

  const customerName = (c: any) => c.header?.displayName || c.header?.name || "Unnamed";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <h1 className="text-xl font-bold">Record Payment</h1>
        <button onClick={() => router.push("/sales/payments")} aria-label="Close">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <div className="grid grid-cols-[200px_1fr] gap-y-4 gap-x-6 items-start max-w-3xl">
        <Label className="pt-2">
          Customer Name<span className="text-red-600">*</span>
        </Label>
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger className="max-w-sm">
            <SelectValue placeholder="Select Customer" />
          </SelectTrigger>
          <SelectContent>
            {customers.map((c: any) => (
              <SelectItem key={c._id} value={c._id}>
                {customerName(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Label className="pt-2">
          Amount Received<span className="text-red-600">*</span>
        </Label>
        <div className="flex max-w-sm">
          <span className="border rounded-none px-2 flex items-center text-xs bg-muted">₹</span>
          <Input
            type="number"
            disabled={!enabled}
            value={amountReceived}
            onChange={(e) => {
              setAmountReceived(e.target.value);
              setTouchedManually(false);
            }}
          />
        </div>

        <Label className="pt-2">Bank Charges (if any)</Label>
        <Input
          type="number"
          disabled={!enabled}
          value={bankCharges}
          onChange={(e) => setBankCharges(e.target.value)}
          className="max-w-sm"
        />

        <Label className="pt-2">
          Payment Date<span className="text-red-600">*</span>
        </Label>
        <Input
          type="date"
          disabled={!enabled}
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
          className="max-w-sm"
        />

        <Label className="pt-2">
          Payment #<span className="text-red-600">*</span>
        </Label>
        <div className="flex items-center gap-2 max-w-sm">
          <Input
            disabled={!enabled || !manualNumber}
            value={displayNumber}
            onChange={(e) => setDisplayNumber(e.target.value)}
          />
          <button
            type="button"
            disabled={!enabled}
            title="Configure Payment# Preferences"
            onClick={() => setNumberModalOpen(true)}
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <Label className="pt-2">Payment Mode</Label>
        <div className="max-w-sm">
          <Input
            disabled={!enabled}
            list="payment-modes-list"
            placeholder="Choose the payment term or type to add"
            value={mode}
            onChange={(e) => handleAddMode(e.target.value)}
          />
          <datalist id="payment-modes-list">
            {modes.map((m: any) => (
              <option key={m._id} value={m.name} />
            ))}
          </datalist>
        </div>

        <Label className="pt-2">
          Deposit To<span className="text-red-600">*</span>
        </Label>
        <Select value={depositToAccountId} onValueChange={setDepositToAccountId} disabled={!enabled}>
          <SelectTrigger className="max-w-sm">
            <SelectValue placeholder="Select an account" />
          </SelectTrigger>
          <SelectContent>
            {bankAccounts.map((a: any) => (
              <SelectItem key={a._id} value={a._id}>
                {a.name || a.accountName} {a.code ? `(${a.code})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Label className="pt-2">Reference#</Label>
        <Input disabled={!enabled} value={reference} onChange={(e) => setReference(e.target.value)} className="max-w-sm" />

        <Label className="pt-2">Tax deducted?</Label>
        <RadioGroup
          value={taxDeducted ? "yes" : "no"}
          onValueChange={(v) => setTaxDeducted(v === "yes")}
          className="space-y-2"
        >
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="no" disabled={!enabled} /> No Tax deducted
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="yes" disabled={!enabled} /> Yes, TDS (Income Tax)
          </label>
          {taxDeducted && (
            <div className="flex gap-2 pl-6 pt-1">
              <Select value={tdsAccountId} onValueChange={setTdsAccountId} disabled={!enabled}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Select TDS account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a: any) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="TDS amount"
                className="w-36"
                disabled={!enabled}
                value={tdsAmount}
                onChange={(e) => setTdsAmount(e.target.value)}
              />
            </div>
          )}
        </RadioGroup>

        {customFieldDefs.map((def: any) => (
          <div key={def._id} className="contents">
            <Label className="pt-2">
              {def.label}
              {def.required && <span className="text-red-600">*</span>}
            </Label>
            <Input
              disabled={!enabled}
              value={customFieldValues[def.label] || ""}
              onChange={(e) => setCustomFieldValues((v) => ({ ...v, [def.label]: e.target.value }))}
              className="max-w-sm"
            />
          </div>
        ))}
      </div>

      <div className={!enabled ? "opacity-50 pointer-events-none" : ""}>
        <div className="flex items-center justify-between mt-4">
          <h2 className="text-sm font-semibold">Unpaid Invoices</h2>
          <button
            className="text-xs text-blue-600 underline"
            onClick={() => {
              setApplied({});
              setTouchedManually(true);
            }}
          >
            Clear Applied Amount
          </button>
        </div>

        <Table className="mt-2">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Invoice Number</TableHead>
              <TableHead className="text-right">Invoice Amount</TableHead>
              <TableHead className="text-right">Amount Due</TableHead>
              <TableHead className="text-right">Payment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingInvoices ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                  Loading...
                </TableCell>
              </TableRow>
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                  There are no unpaid invoices associated with this customer.
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((inv) => (
                <TableRow key={inv._id}>
                  <TableCell>{new Date(inv.invoiceDate).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell className="font-medium">{inv.number}</TableCell>
                  <TableCell className="text-right">₹{inv.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right">₹{amountDue(inv).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      className="w-32 ml-auto text-right"
                      value={applied[inv._id] || ""}
                      onChange={(e) => {
                        setTouchedManually(true);
                        setApplied((a) => ({ ...a, [inv._id]: e.target.value }));
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {invoices.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1">*List contains invoices with an outstanding balance</p>
        )}
        {invoices.length > 0 && (
          <div className="flex justify-end mt-2 text-sm font-semibold">
            Total: ₹{totalApplied.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <div className="w-72 space-y-1 text-sm border rounded-none p-4 bg-muted/30">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount Received:</span>
            <span>₹{receivedNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount used for Payments:</span>
            <span>₹{totalApplied.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount Refunded:</span>
            <span>₹0.00</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span className="flex items-center gap-1">
              {excess > 0 && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
              Amount in Excess:
            </span>
            <span>₹{excess.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          {overApplied && (
            <p className="text-xs text-red-600 pt-1">Total applied payment cannot exceed the amount received.</p>
          )}
        </div>
      </div>

      <div className={!enabled ? "opacity-50 pointer-events-none space-y-1.5" : "space-y-1.5"}>
        <Label>Notes (Internal use. Not visible to customer)</Label>
        <Textarea disabled={!enabled} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="outline" onClick={() => router.push("/sales/payments")}>
          Cancel
        </Button>
        <Button variant="outline" disabled={!enabled || saving !== null} onClick={() => handleSave("draft")}>
          {saving === "draft" ? "Saving..." : "Save as Draft"}
        </Button>
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white"
          disabled={!enabled || saving !== null}
          onClick={() => handleSave("paid")}
        >
          {saving === "paid" ? "Saving..." : "Save as Paid"}
        </Button>
      </div>

      <Dialog open={numberModalOpen} onOpenChange={setNumberModalOpen}>
        <DialogContent className="max-w-md">
          <h2 className="text-lg font-semibold">Configure Payment# Preferences</h2>
          <p className="text-xs text-muted-foreground">
            Changing this setting will affect all future transactions&apos; numbering.
          </p>
          <RadioGroup value={numberMode} onValueChange={(v) => setNumberMode(v as "auto" | "manual")} className="space-y-3 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="auto" /> Continue auto-generating Payment numbers
            </label>
            {numberMode === "auto" && (
              <div className="pl-6 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Prefix</Label>
                  <Input value={prefixInput} onChange={(e) => setPrefixInput(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Next Number</Label>
                  <Input value={nextNumberInput} onChange={(e) => setNextNumberInput(e.target.value)} />
                </div>
                <label className="col-span-2 flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={restartFiscalYear}
                    onChange={(e) => setRestartFiscalYear(e.target.checked)}
                  />
                  Restart numbering at the start of each fiscal year
                </label>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="manual" /> Let me enter the payment numbers myself
            </label>
          </RadioGroup>
          <div className="flex justify-end gap-2 pt-4">
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
