"use client";

import React, { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  ArrowLeft, Settings as SettingsIcon, Plus, Trash2, Wand2, Upload, Palette,
  ChevronDown, ChevronUp, Sparkles, X,
} from "lucide-react";
import { DateField } from "@/components/finance/accounting/DateField";
import { toast } from "sonner";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
import { computeInvoiceTotals, numberToWords, type InvoiceLineInput } from "@/lib/sales/invoiceMath";
import { INDIAN_STATES } from "@/lib/constants/indianStates";
import { CustomerPicker, type PickerCustomer } from "./CustomerPicker";
import { ProductPicker, type PickerProduct } from "./ProductPicker";
import { PrefixPicker, type PrefixRow } from "./PrefixPicker";
import { CreateCustomerDialog } from "./CreateCustomerDialog";
import { CreateProductDialog } from "./CreateProductDialog";
import { TemplateGallery } from "./TemplateGallery";
import { uploadToCloudinary } from "@/lib/upload";

interface LineItemState {
  id: string;
  itemId: string;
  name: string;
  description: string;
  hsn: string;
  qty: number;
  unitPrice: number;
  discount: number;
  discountMode: "percent" | "amount";
  taxRate: number;
}

interface AdditionalChargeState {
  id: string;
  name: string;
  amount: number;
  isTaxable: boolean;
}

interface PaymentState {
  id: string;
  notes: string;
  amount: number;
  date: string;
  mode: string;
}

const emptyLine = (): LineItemState => ({
  id: crypto.randomUUID(), itemId: "", name: "", description: "", hsn: "",
  qty: 1, unitPrice: 0, discount: 0, discountMode: "percent", taxRate: 0,
});

export function InvoiceForm({ mode, invoiceId, initialInvoice }: { mode: "create" | "edit"; invoiceId?: string; initialInvoice?: any }) {
  const { data: session } = useSession();
  const router = useRouter();

  const [orgName, setOrgName] = useState("Your Company");
  const [orgState, setOrgState] = useState<string | undefined>();

  // Header
  const [prefixes, setPrefixes] = useState<PrefixRow[]>([]);
  const [prefix, setPrefix] = useState("INV-");
  const [numberSuffix, setNumberSuffix] = useState("");
  const [invoiceType, setInvoiceType] = useState("Regular");

  // Top section
  const [customers, setCustomers] = useState<PickerCustomer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);

  // Products
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [lineItems, setLineItems] = useState<LineItemState[]>([emptyLine()]);
  const [showDescription, setShowDescription] = useState(false);
  const [itemLevelDiscountPercent, setItemLevelDiscountPercent] = useState<number | "">("");
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const [createProductForLineId, setCreateProductForLineId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});

  // Additional charges / coupons
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalChargeState[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [appliedCoupons, setAppliedCoupons] = useState<string[]>([]);

  // Lower left
  const [notesOpen, setNotesOpen] = useState(true);
  const [termsOpen, setTermsOpen] = useState(true);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [termsLoading, setTermsLoading] = useState(false);
  const [eWaybill, setEWaybill] = useState(false);
  const [eInvoice, setEInvoice] = useState(false);
  const [attachments, setAttachments] = useState<{ name: string; url: string }[]>([]);

  // Totals / payments
  const [extraDiscount, setExtraDiscount] = useState(0);
  const [extraDiscountMode, setExtraDiscountMode] = useState<"amount" | "percent">("amount");
  const [roundOff, setRoundOff] = useState(true);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [payments, setPayments] = useState<PaymentState[]>([]);
  const [markedFullyPaid, setMarkedFullyPaid] = useState(false);
  const [signatures, setSignatures] = useState<{ _id: string; name: string; imageUrl: string }[]>([]);
  const [signatureId, setSignatureId] = useState("");
  const [tdsEnabled, setTdsEnabled] = useState(false);
  const [tdsRate, setTdsRate] = useState(10);
  const [tcsEnabled, setTcsEnabled] = useState(false);
  const [tcsRate, setTcsRate] = useState(1);

  // Guards the Deposit-To/Select-Signature dropdowns during the initial
  // reference-data fetch below — without it, they briefly render as
  // genuinely-empty-looking dropdowns (indistinguishable from "broken") on
  // any connection slow enough for the fetch to still be in flight when the
  // user clicks.
  const [referenceDataLoading, setReferenceDataLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("modern");

  const invoiceNumber = `${prefix}${numberSuffix}`;

  // ── AI-native pre-fill ───────────────────────────────────────────
  // Consume an AI-prepared invoice (extracted from a document/prompt) into the
  // REAL form. The customer is resolved server-side; if it wasn't found, the
  // suggestion tells the user to add it via the inline "+ customer". The user
  // reviews and clicks the real Save button — nothing is auto-submitted.
  useAiPrefill(mode === "create" ? "invoice" : "__invoice_edit_noop__", (p) => {
    const d: any = p.data || {};
    if (d.customerId) setSelectedCustomerId(String(d.customerId));
    if (Array.isArray(d.lineItems) && d.lineItems.length) {
      const mapped = d.lineItems
        .filter((li: any) => li && String(li.name || "").trim())
        .map((li: any) => ({
          ...emptyLine(),
          name: String(li.name || ""),
          description: String(li.description || ""),
          hsn: String(li.hsn || ""),
          qty: Number(li.qty) > 0 ? Number(li.qty) : 1,
          unitPrice: Number(li.unitPrice) || 0,
          taxRate: Number(li.taxRate) || 0,
        }));
      if (mapped.length) setLineItems(mapped);
    }
    if (d.reference) setReference(String(d.reference));
    if (d.notes) setNotes(String(d.notes));
    if (d.invoiceDate) setInvoiceDate(String(d.invoiceDate));
    if (d.dueDate) setDueDate(String(d.dueDate));
    if (p.suggestions && p.suggestions.length) {
      toast.info("Review before saving", { description: p.suggestions.join("  •  "), duration: 10000 });
    }
  });

  // ── Initial data load ────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch("/api/sales/customers").then((r) => r.json()),
      fetch("/api/sales/products?status=published&limit=200").then((r) => r.json()),
      fetch("/api/sales/document-prefixes?documentType=invoice&kind=prefix").then((r) => r.json()),
      fetch("/api/sales/bank-accounts").then((r) => r.json()),
      fetch("/api/sales/coupons").then((r) => r.json()),
      fetch("/api/sales/document-notes?kind=notes&documentType=invoice").then((r) => r.json()),
      fetch("/api/sales/document-notes?kind=terms&documentType=invoice").then((r) => r.json()),
      fetch("/api/sales/document-settings").then((r) => r.json()),
    ]).then(([custRes, prodRes, prefixRes, bankRes, couponRes, notesRes, termsRes, settingsRes]) => {
      if (custRes.items) setCustomers(custRes.items);
      if (prodRes.items) setProducts(prodRes.items);
      if (prefixRes.success) {
        setPrefixes(prefixRes.data);
        const def = prefixRes.data.find((p: PrefixRow) => p.isDefault) || prefixRes.data[0];
        if (def && mode === "create") setPrefix(def.value);
      }
      if (bankRes.success) setBankAccounts(bankRes.data);
      if (couponRes.success) setCoupons(couponRes.data);
      if (settingsRes.success) {
        setSignatures(settingsRes.data?.signatures || []);
        if (settingsRes.data?.defaultTemplates?.invoice) setSelectedTemplate(settingsRes.data.defaultTemplates.invoice);
      }
    }).catch(() => toast.error("Failed to load some invoice reference data"))
      .finally(() => setReferenceDataLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/sales/company-info")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setOrgName(d.data.name);
          setOrgState(d.data.state);
        }
      });
  }, []);

  // Suggest next number when prefix changes (create mode only)
  useEffect(() => {
    if (mode !== "create" || !prefix) return;
    fetch(`/api/sales/invoices/next-number?prefix=${encodeURIComponent(prefix)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setNumberSuffix(String(d.data.seq).padStart(4, "0"));
      });
  }, [prefix, mode]);

  // Hydrate from an existing invoice (edit / resume draft)
  useEffect(() => {
    if (!initialInvoice) return;
    const inv = initialInvoice;
    const match = /^(.*?)(\d+)$/.exec(inv.number || "");
    setPrefix(match ? match[1] : inv.number || "INV-");
    setNumberSuffix(match ? match[2] : "");
    setInvoiceType(inv.type || "Regular");
    setSelectedCustomerId(typeof inv.customerId === "object" ? inv.customerId?._id : inv.customerId || "");
    setInvoiceDate(inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().slice(0, 10) : invoiceDate);
    setDueDate(inv.dueDate ? new Date(inv.dueDate).toISOString().slice(0, 10) : dueDate);
    setReference(inv.reference || "");
    setPlaceOfSupply(inv.placeOfSupply || "");
    setLineItems(
      (inv.lineItems || []).length
        ? inv.lineItems.map((li: any) => ({
            id: crypto.randomUUID(), itemId: li.itemId || "", name: li.name || "", description: li.description || "",
            hsn: li.hsn || "", qty: li.qty ?? 1, unitPrice: li.unitPrice ?? 0, discount: li.discount ?? 0,
            discountMode: li.discountMode || "percent", taxRate: li.taxRate ?? 0,
          }))
        : [emptyLine()],
    );
    setItemLevelDiscountPercent(inv.itemLevelDiscountPercent || "");
    setAdditionalCharges((inv.additionalCharges || []).map((c: any) => ({ id: crypto.randomUUID(), ...c })));
    setAppliedCoupons(inv.coupons || []);
    setNotes(inv.notes || "");
    setTerms(inv.terms || "");
    setEWaybill(!!inv.eWaybill);
    setEInvoice(!!inv.eInvoice);
    setAttachments(inv.attachments || []);
    setExtraDiscount(inv.extraDiscount || 0);
    setExtraDiscountMode(inv.extraDiscountMode || "amount");
    setRoundOff(!!inv.roundOff);
    setBankAccountId(inv.bankAccountId?._id || inv.bankAccountId || "");
    setPayments((inv.payments || []).map((p: any) => ({ id: crypto.randomUUID(), notes: p.notes || "", amount: p.amount, date: new Date(p.date).toISOString().slice(0, 10), mode: p.mode })));
    setMarkedFullyPaid(!!inv.markedFullyPaid);
    setSignatureId(inv.signatureId || "");
    setTdsEnabled(!!inv.taxes?.tds);
    if (inv.taxes?.tds) setTdsRate(inv.taxes.tds);
    setTcsEnabled(!!inv.taxes?.tcs);
    if (inv.taxes?.tcs) setTcsRate(inv.taxes.tcs);
    setSelectedTemplate(inv.templateKey || "modern");
  }, [initialInvoice]);

  // Auto-fill place of supply from customer's state when customer changes (create mode, empty field only)
  useEffect(() => {
    if (!selectedCustomerId) return;
    const c = customers.find((c) => c._id === selectedCustomerId) as any;
    if (c?.address_tab?.state_name && !placeOfSupply) {
      setPlaceOfSupply(c.address_tab.state_name);
    }
  }, [selectedCustomerId, customers]);

  // ── Line item helpers ───────────────────────────────────────────
  const updateLineItem = (id: string, patch: Partial<LineItemState>) => {
    setLineItems((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    if (patch.name?.trim()) setLineErrors((errs) => { const { [id]: _drop, ...rest } = errs; return rest; });
  };

  const selectProductForLine = (lineId: string, productId: string) => {
    const p = products.find((p) => p._id === productId) as any;
    if (!p) return;
    updateLineItem(lineId, {
      itemId: productId,
      name: p.header?.name || "",
      unitPrice: p.tab_general_information?.list_price || 0,
      taxRate: p._taxRate ?? 0,
    });
  };

  const addLineItem = () => setLineItems((items) => [...items, emptyLine()]);
  const removeLineItem = (id: string) => setLineItems((items) => (items.length > 1 ? items.filter((i) => i.id !== id) : items));

  const applyGlobalDiscount = () => {
    if (itemLevelDiscountPercent === "" || itemLevelDiscountPercent === null) return;
    toast.success(`${itemLevelDiscountPercent}% discount will be applied to all items on save`);
  };

  // ── Totals (live, client-side mirror of server invoiceMath) ─────
  const totals = useMemo(() => {
    const inputs: InvoiceLineInput[] = lineItems.map((li) => ({
      qty: li.qty, unitPrice: li.unitPrice, discount: li.discount, discountMode: li.discountMode, taxRate: li.taxRate, hsn: li.hsn, name: li.name,
    }));
    return computeInvoiceTotals({
      lineItems: inputs,
      itemLevelDiscountPercent: Number(itemLevelDiscountPercent) || 0,
      additionalCharges: additionalCharges.map((c) => ({ name: c.name, amount: c.amount, isTaxable: c.isTaxable })),
      extraDiscount,
      extraDiscountMode,
      roundOff,
      sellerState: orgState,
      placeOfSupply,
      tdsRate: tdsEnabled ? tdsRate : 0,
      tcsRate: tcsEnabled ? tcsRate : 0,
    });
  }, [lineItems, itemLevelDiscountPercent, additionalCharges, extraDiscount, extraDiscountMode, roundOff, orgState, placeOfSupply, tdsEnabled, tdsRate, tcsEnabled, tcsRate]);

  const totalQty = lineItems.reduce((acc, l) => acc + (Number(l.qty) || 0), 0);

  // ── Payments ─────────────────────────────────────────────────────
  const addPayment = () => setPayments((p) => [...p, { id: crypto.randomUUID(), notes: "", amount: 0, date: new Date().toISOString().slice(0, 10), mode: "Cash" }]);
  const updatePayment = (id: string, patch: Partial<PaymentState>) => setPayments((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removePayment = (id: string) => setPayments((p) => p.filter((x) => x.id !== id));

  // ── Additional charges ──────────────────────────────────────────
  const addCharge = () => setAdditionalCharges((c) => [...c, { id: crypto.randomUUID(), name: "", amount: 0, isTaxable: false }]);
  const updateCharge = (id: string, patch: Partial<AdditionalChargeState>) => setAdditionalCharges((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeCharge = (id: string) => setAdditionalCharges((c) => c.filter((x) => x.id !== id));

  // ── Coupons ──────────────────────────────────────────────────────
  const toggleCoupon = (code: string) => {
    const coupon = coupons.find((c) => c.couponCode === code);
    if (!coupon) return;
    if (appliedCoupons.includes(code)) {
      setAppliedCoupons((a) => a.filter((c) => c !== code));
      return;
    }
    setAppliedCoupons((a) => [...a, code]);
    if (coupon.discountType === "order-level") {
      if (coupon.discountBy === "percentage") {
        setExtraDiscountMode("percent");
        setExtraDiscount((d) => d + coupon.discountValue);
      } else {
        setExtraDiscountMode("amount");
        setExtraDiscount((d) => d + coupon.discountValue);
      }
    }
  };

  // ── Attachments ──────────────────────────────────────────────────
  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files);
    if (attachments.length + incoming.length > 5) return toast.error("Maximum 5 attachments");
    
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

  // ── AI assist ──────────────────────────────────────────────────
  const runAiDraft = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/sales/invoices/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          customers: customers.map((c) => ({ _id: c._id, name: c.header?.name })),
          products: products.map((p: any) => ({ _id: p._id, name: p.header?.name, price: p.tab_general_information?.list_price })),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.message || "AI assist failed");
        return;
      }
      const draft = data.data;
      // Confirmation gate: populate the form for user review — nothing is saved yet.
      if (draft.customerId) setSelectedCustomerId(draft.customerId);
      if (draft.reference) setReference(draft.reference);
      if (draft.notes) setNotes(draft.notes);
      if (Array.isArray(draft.lineItems) && draft.lineItems.length) {
        setLineItems(
          draft.lineItems.map((li: any) => ({
            id: crypto.randomUUID(), itemId: li.itemId || "", name: li.name || li.itemId || "Item", description: "",
            hsn: li.hsn || "", qty: li.qty || 1, unitPrice: li.unitPrice || 0, discount: 0, discountMode: "percent", taxRate: li.taxRate || 0,
          })),
        );
      }
      toast.success("AI draft applied — please review before saving");
      setAiOpen(false);
      setAiPrompt("");
    } catch {
      toast.error("AI assist failed");
    } finally {
      setAiLoading(false);
    }
  };

  const draftNoteWithAi = async (field: "notes" | "terms") => {
    const setLoading = field === "notes" ? setNotesLoading : setTermsLoading;
    setLoading(true);
    try {
      const res = await fetch("/api/sales/invoices/ai-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field }),
      });
      const data = await res.json();
      if (data.success) {
        if (field === "notes") setNotes(data.data.text);
        else setTerms(data.data.text);
      } else {
        toast.error(data.message || "AI assist unavailable");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Save ─────────────────────────────────────────────────────────
  const buildPayload = (status: string) => ({
    number: mode === "create" ? invoiceNumber : undefined,
    prefix,
    type: invoiceType,
    customerId: selectedCustomerId || undefined,
    invoiceDate,
    dueDate,
    reference,
    placeOfSupply,
    lineItems: lineItems.map(({ id, ...rest }) => rest),
    itemLevelDiscountPercent: Number(itemLevelDiscountPercent) || 0,
    additionalCharges: additionalCharges.map(({ id, ...rest }) => rest),
    extraDiscount,
    roundOff,
    notes,
    terms,
    eWaybill,
    eInvoice,
    attachments,
    coupons: appliedCoupons,
    bankAccountId: bankAccountId || undefined,
    payments: payments.map(({ id, ...rest }) => rest),
    markedFullyPaid,
    signatureId: signatureId || undefined,
    taxes: { tds: tdsEnabled ? tdsRate : 0, tcs: tcsEnabled ? tcsRate : 0 },
    templateKey: selectedTemplate,
    status,
  });

  const handleSave = async (status: string, thenPrint = false) => {
    if (status !== "draft") {
      if (!selectedCustomerId) return toast.error("Please select a customer");
      const namedLines = lineItems.filter((l) => l.name.trim());
      if (!namedLines.length) return toast.error("Please add at least one product or service");
      const errors: Record<string, string> = {};
      for (const l of lineItems) {
        if (!l.name.trim() && (l.qty || l.unitPrice)) errors[l.id] = "Fill Product Name";
      }
      if (Object.keys(errors).length) {
        setLineErrors(errors);
        return toast.error("Fill Product Name");
      }
      setLineErrors({});
    }
    setSaving(true);
    try {
      const payload = buildPayload(status);
      const url = mode === "create" ? "/api/sales/invoices" : `/api/sales/invoices/${invoiceId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to save invoice");

      toast.success(status === "draft" ? "Saved as draft" : "Invoice saved");
      const savedId = data.data._id || invoiceId;
      if (thenPrint) {
        window.open(`/api/sales/invoices/${savedId}/pdf?templateId=${selectedTemplate}`, "_blank");
      }
      router.push("/sales/invoices");
      // Deliberately not resetting `saving` here — keep the Save buttons
      // disabled through the navigation instead of re-enabling for the
      // instant before router.push resolves.
    } catch (e: any) {
      toast.error(e.message || "Failed to save invoice");
      setSaving(false);
    }
  };

  const decimals = 2;

  return (
    <div className="bg-background text-foreground pb-24">
      {/* HEADER */}
      <header className="sticky top-0 z-10 -mx-3 sm:-mx-4 md:-mx-6 lg:-mx-8 -mt-3 sm:-mt-4 md:-mt-6 lg:-mt-8 mb-6 bg-card border-b border-border/40 px-4 py-3 flex items-center justify-between shadow-none flex-wrap gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          <Link href="/sales/invoices">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none text-muted-foreground hover:text-foreground hover:bg-white/5">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">{mode === "create" ? "Create Invoice" : "Edit Invoice"} /</h1>
            <span className="text-lg font-black tracking-tight text-primary">{orgName}</span>
          </div>

          <div className="h-6 w-px bg-border/40 mx-2" />

          <div className="flex items-center border border-border/40 rounded-none overflow-hidden bg-background">
            <PrefixPicker prefixes={prefixes} value={prefix} onChange={setPrefix} onCreated={(row) => setPrefixes((p) => [...p, row])} />
            <div className="h-4 w-px bg-border/40" />
            <input
              type="text"
              value={numberSuffix}
              onChange={(e) => setNumberSuffix(e.target.value)}
              className="h-8 w-24 px-2 bg-transparent border-0 focus:outline-none text-sm font-mono font-medium text-foreground"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Select value={invoiceType} onValueChange={setInvoiceType}>
            <SelectTrigger className="h-8 w-32 rounded-none bg-transparent border-border/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="Regular">Regular</SelectItem>
              <SelectItem value="Bill of Supply">Bill of Supply</SelectItem>
              <SelectItem value="Export">Export</SelectItem>
            </SelectContent>
          </Select>

          <Link href="/sales/document-settings">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none text-muted-foreground hover:bg-white/5" title="Document Settings">
              <SettingsIcon className="h-4 w-4" />
            </Button>
          </Link>

        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {/* TOP SECTION */}
        <div className="grid grid-cols-4 gap-6 bg-card p-6 rounded-none border border-border/40 shadow-none">
          <div className="col-span-4 lg:col-span-2 space-y-2">
            <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Select Customer *</label>
            <CustomerPicker customers={customers} value={selectedCustomerId} onChange={setSelectedCustomerId} onCreateNew={() => setCreateCustomerOpen(true)} />
            <Button variant="link" onClick={() => setCreateCustomerOpen(true)} className="text-primary h-auto p-0 text-xs mt-1">+ Create Customer</Button>
          </div>

          {selectedCustomerId && (
          <>
          <div className="space-y-2">
            <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Invoice Date</label>
            <DateField value={invoiceDate} onChange={setInvoiceDate} />
          </div>

          <div className="space-y-2">
            <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Due Date</label>
            <DateField value={dueDate} onChange={setDueDate} />
          </div>

          <div className="col-span-2 space-y-2 mt-2">
            <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Reference</label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PO Number / Sales Person / Shipment Notes" className="h-10 rounded-none border-border/40" />
          </div>

          <div className="col-span-2 space-y-2 mt-2">
            <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Place of Supply</label>
            <Select value={placeOfSupply} onValueChange={setPlaceOfSupply}>
              <SelectTrigger className="h-10 rounded-none border-border/40"><SelectValue placeholder="Select state" /></SelectTrigger>
              <SelectContent className="rounded-none">
                {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          </>
          )}
        </div>

        {selectedCustomerId && (
        <div className="bg-card rounded-none border border-border/40 shadow-none overflow-hidden">
          <div className="p-4 border-b border-border/20 flex justify-between items-center flex-wrap gap-2">
            <div className="flex items-center gap-4">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Products &amp; Services</h2>
              <Button variant="link" onClick={() => { setCreateProductForLineId(null); setCreateProductOpen(true); }} className="text-primary h-auto p-0 text-xs">Add new Product?</Button>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <Checkbox checked={showDescription} onCheckedChange={(c) => setShowDescription(!!c)} /> Show description
              </label>
            </div>
            <Button variant="outline" size="sm" onClick={() => setAiOpen(true)} className="h-8 rounded-none text-xs bg-purple-500/10 text-purple-500 border-purple-500/20 hover:bg-purple-500/20">
              <Wand2 className="w-3 h-3 mr-2" /> Create Invoices with AI (BETA)
            </Button>
          </div>

          <div className="p-0 overflow-x-auto">
            <Table className="w-full text-sm">
              <TableHeader className="border-border/40">
                <TableRow>
                  <TableHead className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground/50 w-12">#</TableHead>
                  <TableHead className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground/50 w-[32%]">Product Name</TableHead>
                  <TableHead className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground/50 w-20">HSN</TableHead>
                  <TableHead className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground/50 w-20">Quantity</TableHead>
                  <TableHead className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground/50 w-28">Unit Price</TableHead>
                  <TableHead className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground/50 w-16">Tax %</TableHead>
                  <TableHead className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground/50 w-32">Discount</TableHead>
                  <TableHead className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground/50 w-28 text-right">Total</TableHead>
                  <TableHead className="px-4 py-3 font-medium w-12" />
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/30">
                {lineItems.map((item, index) => {
                  const computed = totals.computedLines[index];
                  return (
                    <React.Fragment key={item.id}>
                      <TableRow className="group hover:bg-white/[0.015]">
                        <TableCell className="px-4 py-3 text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="px-2 py-1">
                          <ProductPicker
                            products={products}
                            value={item.itemId}
                            onChange={(val) => selectProductForLine(item.id, val)}
                            onCreateNew={() => { setCreateProductForLineId(item.id); setCreateProductOpen(true); }}
                          />
                          {!item.itemId && (
                            <>
                              <Input
                                value={item.name}
                                onChange={(e) => updateLineItem(item.id, { name: e.target.value })}
                                placeholder="Or type a custom line item name"
                                className={`h-7 mt-1 text-xs border-dashed ${lineErrors[item.id] ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                              />
                              {lineErrors[item.id] && (
                                <p className="text-[11px] text-red-500 mt-0.5">{lineErrors[item.id]}</p>
                              )}
                            </>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Input value={item.hsn} onChange={(e) => updateLineItem(item.id, { hsn: e.target.value })} className="h-8 w-full" placeholder="HSN" />
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Input type="number" value={item.qty} onChange={(e) => updateLineItem(item.id, { qty: Number(e.target.value) })} className="h-8 w-full" />
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Input type="number" value={item.unitPrice} onChange={(e) => updateLineItem(item.id, { unitPrice: Number(e.target.value) })} className="h-8 w-full" />
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Input type="number" value={item.taxRate} onChange={(e) => updateLineItem(item.id, { taxRate: Number(e.target.value) })} className="h-8 w-full" />
                        </TableCell>
                        <TableCell className="px-4 py-3 flex items-center gap-1">
                          <Input type="number" value={item.discount} onChange={(e) => updateLineItem(item.id, { discount: Number(e.target.value) })} className="h-8 w-16" />
                          <Select value={item.discountMode} onValueChange={(v: any) => updateLineItem(item.id, { discountMode: v })}>
                            <SelectTrigger className="h-8 w-12 px-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percent">%</SelectItem>
                              <SelectItem value="amount">₹</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right font-medium">₹ {(computed?.lineTotal ?? 0).toFixed(decimals)}</TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <Button variant="ghost" size="icon" onClick={() => removeLineItem(item.id)} className="h-8 w-8 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {showDescription && (
                        <TableRow key={`${item.id}-desc`}>
                          <TableCell />
                          <TableCell colSpan={8} className="px-4 pb-3">
                            <Textarea
                              value={item.description}
                              onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                              placeholder="Description"
                              className="h-14 text-xs resize-none"
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="p-4 border-t border-border/20 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={addLineItem} className="h-8 rounded-none text-xs font-medium border-border/40">
                <Plus className="w-3 h-3 mr-1" /> Add to Bill
              </Button>
              <div className="text-sm font-medium text-muted-foreground">Items: {lineItems.length}, Qty: {totalQty}</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Apply discount(%) to all items?</label>
              <Input
                type="number"
                value={itemLevelDiscountPercent}
                onChange={(e) => setItemLevelDiscountPercent(e.target.value === "" ? "" : Number(e.target.value))}
                onBlur={applyGlobalDiscount}
                className="h-7 w-20 rounded-none border-border/40 text-xs"
              />
            </div>
            <div>
              <Button variant="outline" size="sm" onClick={addCharge} className="h-8 rounded-none text-xs border-border/40">
                <Plus className="w-3 h-3 mr-1" /> Additional Charges
              </Button>
              {additionalCharges.map((c) => (
                <div key={c.id} className="flex items-center gap-2 mt-2">
                  <Input value={c.name} onChange={(e) => updateCharge(c.id, { name: e.target.value })} placeholder="Charge name" className="h-8 w-48 rounded-none border-border/40 text-xs" />
                  <Input type="number" value={c.amount} onChange={(e) => updateCharge(c.id, { amount: Number(e.target.value) })} className="h-8 w-28 rounded-none border-border/40 text-xs" />
                  <label className="flex items-center gap-1 text-xs">
                    <Checkbox checked={c.isTaxable} onCheckedChange={(v) => updateCharge(c.id, { isTaxable: !!v })} /> Taxable
                  </label>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-none" onClick={() => removeCharge(c.id)}><X className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          </div>
        </div>
        )}


        {/* BOTTOM SECTION */}
        <div className="grid grid-cols-2 gap-8">
          {/* Left column */}
          <div className="space-y-6">
            <div className="border border-border/40 rounded-none bg-card">
              <button type="button" onClick={() => setNotesOpen((o) => !o)} className="w-full flex justify-between items-center p-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">
                Notes {notesOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {notesOpen && (
                <div className="p-3 pt-0 space-y-2">
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" disabled={notesLoading} onClick={() => draftNoteWithAi("notes")} className="h-6 rounded-none text-xs text-primary px-2 py-0">
                      <Sparkles className="w-3 h-3 mr-1" /> Draft with AI
                    </Button>
                  </div>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Thanks for your business." className="resize-none h-20 rounded-none border-border/40" />
                </div>
              )}
            </div>

            <div className="border border-border/40 rounded-none bg-card">
              <button type="button" onClick={() => setTermsOpen((o) => !o)} className="w-full flex justify-between items-center p-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">
                Terms &amp; Conditions {termsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {termsOpen && (
                <div className="p-3 pt-0 space-y-2">
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" disabled={termsLoading} onClick={() => draftNoteWithAi("terms")} className="h-6 rounded-none text-xs text-primary px-2 py-0">
                      <Sparkles className="w-3 h-3 mr-1" /> Draft with AI
                    </Button>
                  </div>
                  <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Please pay within 30 days." className="resize-none h-20 rounded-none border-border/40" />
                </div>
              )}
            </div>

            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={eWaybill} onCheckedChange={(c) => setEWaybill(!!c)} /> Create E-Waybill
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={eInvoice} onCheckedChange={(c) => setEInvoice(!!c)} /> Create E-Invoice
              </label>
            </div>

            <div>
              <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-2 block">Use Coupons</label>
              <div className="flex flex-wrap gap-2">
                {coupons.length === 0 && <span className="text-xs text-muted-foreground">No coupons available</span>}
                {coupons.map((c) => (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() => toggleCoupon(c.couponCode)}
                    className={`font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-none border ${appliedCoupons.includes(c.couponCode) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border/40"}`}
                  >
                    {c.couponCode}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-border/40">
              <label className="cursor-pointer">
                <div className="w-full border border-dashed border-border/40 rounded-none h-12 flex items-center justify-center text-muted-foreground text-sm gap-2 hover:bg-white/5">
                  <Upload className="w-4 h-4" /> Attach Files (Max: 5)
                </div>
                <input type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              </label>
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {attachments.map((a, i) => (
                    <span key={i} className="text-xs bg-muted px-2 py-1 rounded-none flex items-center gap-1">
                      {a.name}
                      <button onClick={() => setAttachments((arr) => arr.filter((_, idx) => idx !== i))}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column: Totals & Payments */}
          <div className="bg-card rounded-none border border-border/40 shadow-none p-6 space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-sans tabular-nums font-medium">₹ {totals.subtotal.toFixed(decimals)}</span>
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Extra Discount</span>
              <div className="flex items-center gap-1 w-40">
                <Input type="number" value={extraDiscount} onChange={(e) => setExtraDiscount(Number(e.target.value))} className="h-8 rounded-none border-border/40 text-right font-medium" />
                <Select value={extraDiscountMode} onValueChange={(v: any) => setExtraDiscountMode(v)}>
                  <SelectTrigger className="h-8 w-14 rounded-none border-border/40 px-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-none">
                    <SelectItem value="amount">₹</SelectItem>
                    <SelectItem value="percent">%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-between items-center text-sm py-2 border-y border-dashed border-border/40">
              <span className="font-medium">Taxable Amount</span>
              <span className="font-sans tabular-nums font-semibold">₹ {totals.taxableAmount.toFixed(decimals)}</span>
            </div>

            {totals.gstBreakup.map((g) => (
              <div key={g.label} className="flex justify-between items-center text-xs text-muted-foreground">
                <span>{g.label}</span><span className="font-sans tabular-nums">₹ {g.amount.toFixed(decimals)}</span>
              </div>
            ))}

            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Round Off</span>
                <Checkbox checked={roundOff} onCheckedChange={(c) => setRoundOff(!!c)} />
              </div>
              <span className="font-sans tabular-nums font-medium">{roundOff ? totals.roundOffAmount.toFixed(decimals) : "0.00"}</span>
            </div>

            <div className="flex gap-4 text-xs">
              <label className="flex items-center gap-1"><Checkbox checked={tdsEnabled} onCheckedChange={(c) => setTdsEnabled(!!c)} /> TDS</label>
              {tdsEnabled && <Input type="number" value={tdsRate} onChange={(e) => setTdsRate(Number(e.target.value))} className="h-6 w-14 rounded-none border-border/40 text-xs" />}
              <label className="flex items-center gap-1"><Checkbox checked={tcsEnabled} onCheckedChange={(c) => setTcsEnabled(!!c)} /> TCS</label>
              {tcsEnabled && <Input type="number" value={tcsRate} onChange={(e) => setTcsRate(Number(e.target.value))} className="h-6 w-14 rounded-none border-border/40 text-xs" />}
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-lg font-bold">Total Amount</span>
              <span className="text-2xl font-sans tabular-nums font-bold text-primary">₹ {totals.totalAmount.toFixed(decimals)}</span>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">Total Discount: ₹ {totals.totalDiscount.toFixed(decimals)}</p>
            <p className="text-xs text-muted-foreground italic">{numberToWords(totals.totalAmount)}</p>

            <div className="pt-6 mt-6 border-t border-border/40 space-y-4">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Payments</h3>
              <div className="flex items-center justify-between p-3 rounded-none border border-border/40">
                <Select value={bankAccountId} onValueChange={setBankAccountId} disabled={referenceDataLoading}>
                  <SelectTrigger className="h-8 border-0 bg-transparent"><SelectValue placeholder={referenceDataLoading ? "Loading..." : "Select Bank"} /></SelectTrigger>
                  <SelectContent className="rounded-none">
                    {bankAccounts.map((b) => <SelectItem key={b._id} value={b._id}>{b.accountName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Add payment</label>
                  <Button variant="link" size="sm" onClick={addPayment} className="h-auto p-0 text-xs text-primary">+ Split Payment</Button>
                </div>
                {payments.map((p) => (
                  <div key={p.id} className="grid grid-cols-4 gap-2 items-center">
                    <Input placeholder="Notes" value={p.notes} onChange={(e) => updatePayment(p.id, { notes: e.target.value })} className="h-9 rounded-none border-border/40 text-sm col-span-1" />
                    <Input placeholder="Amount" type="number" value={p.amount} onChange={(e) => updatePayment(p.id, { amount: Number(e.target.value) })} className="h-9 rounded-none border-border/40 text-sm" />
                    <DateField value={p.date} onChange={(v) => updatePayment(p.id, { date: v })} />
                    <div className="flex items-center gap-1">
                      <Select value={p.mode} onValueChange={(v) => updatePayment(p.id, { mode: v })}>
                        <SelectTrigger className="h-9 rounded-none border-border/40 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-none">
                          <SelectItem value="Cash">Cash</SelectItem>
                          <SelectItem value="Bank">Bank Transfer</SelectItem>
                          <SelectItem value="UPI">UPI</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => removePayment(p.id)}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                ))}
                <label className="flex items-center gap-2 pt-2 text-sm font-medium text-muted-foreground">
                  <Checkbox checked={markedFullyPaid} onCheckedChange={(c) => setMarkedFullyPaid(!!c)} /> Mark as fully paid
                </label>
              </div>

              <div className="space-y-1">
                <label className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">Select Signature</label>
                <Select value={signatureId} onValueChange={setSignatureId} disabled={referenceDataLoading}>
                  <SelectTrigger className="h-9 rounded-none border-border/40"><SelectValue placeholder={referenceDataLoading ? "Loading..." : "None"} /></SelectTrigger>
                  <SelectContent className="rounded-none">
                    {signatures.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER ACTIONS */}
      <div className="fixed bottom-0 left-0 right-0 sm:right-(--ai-sidebar-w,0px) transition-[right] duration-200 bg-background border-t border-border/40 p-4 flex items-center justify-end gap-3 z-50">
        <div className="max-w-6xl w-full mx-auto flex items-center justify-end gap-3">
          <Button variant="outline" onClick={() => handleSave("draft")} disabled={saving} className="rounded-none border-border/40 bg-background font-mono text-[11px] uppercase tracking-wider">
            Save as Draft
          </Button>
          <div className="flex">
            <Button variant="outline" onClick={() => handleSave("saved", true)} disabled={saving} className="rounded-none border-border/40 border-r-0 bg-background hover:bg-white/5 font-mono text-[11px] uppercase tracking-wider">
              Save and Print
            </Button>
            <Dialog open={templateGalleryOpen} onOpenChange={setTemplateGalleryOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="rounded-none border-border/40 px-2 bg-background hover:bg-white/5" title="Choose Template">
                  <Palette className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-none">
                <DialogHeader>
                  <DialogTitle>Choose an Invoice Template</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  <TemplateGallery
                    category="invoice"
                    selectedKey={selectedTemplate}
                    onSelect={(key) => { setSelectedTemplate(key); setTemplateGalleryOpen(false); }}
                    allowSetDefault={false}
                  />
                </div>
                <DialogFooter className="sm:justify-start">
                  <Link href="/sales/invoices/templates" className="text-sm text-primary hover:underline">
                    Manage templates →
                  </Link>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Button onClick={() => handleSave("saved")} disabled={saving} className="min-w-[120px] font-mono text-[11px] uppercase tracking-wider">
            {saving ? "Saving..." : "Save →"}
          </Button>
        </div>
      </div>

      <CreateCustomerDialog
        open={createCustomerOpen}
        onOpenChange={setCreateCustomerOpen}
        onCreated={(c) => { setCustomers((prev) => [c, ...prev]); setSelectedCustomerId(c._id); }}
      />
      <CreateProductDialog
        open={createProductOpen}
        onOpenChange={setCreateProductOpen}
        onCreated={(p) => {
          setProducts((prev) => [p, ...prev]);
          if (createProductForLineId) selectProductForLine(createProductForLineId, p._id);
        }}
      />

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="rounded-none">
          <DialogHeader><DialogTitle>Create Invoice with AI (BETA)</DialogTitle></DialogHeader>
          <Textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="e.g. Invoice Acme Corp for 3 hours of consulting at ₹5000/hr and 2 Premium Widgets"
            className="h-28 rounded-none border-border/40"
          />
          <p className="text-xs text-muted-foreground">This only fills the form for your review — nothing is saved until you click Save.</p>
          <Button onClick={runAiDraft} disabled={aiLoading} className="rounded-none bg-purple-600 hover:bg-purple-700 text-white font-mono text-[11px] uppercase tracking-wider">
            {aiLoading ? "Thinking..." : "Generate Draft"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
