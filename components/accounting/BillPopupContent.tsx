"use client";

import React, { useState, useEffect } from "react";
import {
  Receipt,
  Building,
  FileText,
  Calendar,
  CreditCard,
  MessageSquare,
  AlertCircle,
  Plus,
  Trash2,
  Package,
  Calculator,
  ArrowRightLeft,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SelectSearchAdd } from "../dashboard/SelectSearchAdd";
import { Chatter } from "../dashboard/Chatter";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

interface BillPopupContentProps {
  formData: any;
  setFormData: (data: any) => void;
  isViewOnly?: boolean;
}

export default function BillPopupContent({
  formData,
  setFormData,
  isViewOnly = false,
}: BillPopupContentProps) {
  const [activeTab, setActiveTab] = useState("general");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        const [accRes, vendorRes, productRes] = await Promise.all([
          fetch("/api/accounting/accounts"),
          fetch("/api/sales/customers"),
          fetch("/api/sales/products"),
        ]);

        const [accData, vendorData, productData] = await Promise.all([
          accRes.json(),
          vendorRes.json(),
          productRes.json(),
        ]);

        if (!active) return;
        setAccounts(accData.items || []);
        setVendors(vendorData.items || []);
        setProducts(productData.items || []);
      } catch (e) {
        console.error("Fetch bill popup resources error:", e);
      }
    };

    loadData();
    return () => {
      active = false;
    };
  }, []);

  const updateField = (field: string, value: any) => {
    if (isViewOnly && field !== "chatter") return;
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const calculateTotals = (lines: any[]) => {
    const untaxed = lines.reduce(
      (acc, line) => acc + (line.priceSubtotal || 0),
      0,
    );
    const tax = untaxed * 0.18; // Manual 18% tax for demo, later bind to line taxIds
    setFormData((prev: any) => ({
      ...prev,
      invoiceLines: lines,
      amountUntaxed: untaxed,
      amountTax: prev.isTaxIncluded ? 0 : tax,
      amountTotal: prev.isTaxIncluded ? untaxed : untaxed + tax,
    }));
  };

  const addLine = () => {
    const newLines = [
      ...(formData.invoiceLines || []),
      {
        productId: null,
        name: "",
        quantity: 1,
        priceUnit: 0,
        priceSubtotal: 0,
      },
    ];
    updateField("invoiceLines", newLines);
  };

  const removeLine = (index: number) => {
    const newLines = [...(formData.invoiceLines || [])];
    newLines.splice(index, 1);
    calculateTotals(newLines);
  };

  const updateLine = (index: number, field: string, value: any) => {
    const newLines = [...(formData.invoiceLines || [])];
    newLines[index] = { ...newLines[index], [field]: value };

    if (field === "productId") {
      const prod = products.find((p) => p._id === value);
      if (prod) {
        newLines[index].name = prod.header?.name;
        newLines[index].priceUnit =
          prod.tab_general_information?.standard_price || 0;
      }
    }

    if (field === "quantity" || field === "priceUnit") {
      newLines[index].priceSubtotal =
        newLines[index].quantity * newLines[index].priceUnit;
    }

    calculateTotals(newLines);
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex items-start gap-6 border-b pb-6">
        <div className="w-24 h-24 bg-primary/10 flex items-center justify-center none-2xl shrink-0">
          <Receipt className="w-12 h-12 text-primary" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-black tracking-tighter uppercase whitespace-nowrap">
              {formData.name || "Draft Bill"}
            </h1>
            <Badge
              variant="outline"
              className="none-full px-3 uppercase text-[10px] font-black border-2"
            >
              {formData.state}
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
              <span className="text-sm font-bold opacity-60 uppercase">
                {new Date(formData.invoiceDate).toLocaleDateString()}
              </span>
            </div>
            {formData.sourceDocument && (
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-primary" />
                <span className="text-sm font-black text-primary uppercase tracking-widest">
                  {formData.sourceDocument}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Main Content */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <div className="border-b">
            <div className="flex gap-8">
              {["general", "lines", "other", "chatter"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`pb-4 text-[10px] font-black uppercase tracking-widest transition-all relative ${
                    activeTab === tab
                      ? "text-primary"
                      : "text-muted-foreground opacity-40 hover:opacity-100"
                  }`}
                >
                  {tab}
                  {activeTab === tab && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary animate-in fade-in slide-in-from-left-2" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-[500px]">
            {activeTab === "general" && (
              <div className="grid grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      Bill Reference
                    </Label>
                    <Input
                      value={formData.ref || ""}
                      onChange={(e) => updateField("ref", e.target.value)}
                      placeholder="e.g. VENDOR/2026/001"
                      className="none-xl border-2 h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      PO Reference
                    </Label>
                    <Input
                      value={formData.poReference || ""}
                      onChange={(e) => updateField("poReference", e.target.value)}
                      placeholder="PO Number"
                      className="none-xl border-2 h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      Payment Reference
                    </Label>
                    <Input
                      value={formData.payment_reference || ""}
                      onChange={(e) =>
                        updateField("payment_reference", e.target.value)
                      }
                      placeholder="Use Bill Reference if empty"
                      className="none-xl border-2 h-12"
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      PO Match Type
                    </Label>
                    <Select
                      value={formData.poMatchType || "2_way"}
                      onValueChange={(v) => updateField("poMatchType", v)}
                    >
                      <SelectTrigger className="none-xl border-2 h-12 uppercase font-black text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2_way">2-way</SelectItem>
                        <SelectItem value="3_way">3-way</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      GRN / Receipt Ref
                    </Label>
                    <Input
                      value={formData.grnReference || ""}
                      onChange={(e) => updateField("grnReference", e.target.value)}
                      placeholder="Goods Receipt Number"
                      className="none-xl border-2 h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      Due Date
                    </Label>
                    <Input
                      type="date"
                      value={
                        formData.dueDate
                          ? new Date(formData.dueDate)
                              .toISOString()
                              .split("T")[0]
                          : ""
                      }
                      onChange={(e) => updateField("dueDate", e.target.value)}
                      className="none-xl border-2 h-12 font-black"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      Journal
                    </Label>
                    <Select
                      value={formData.journalId || "purchase"}
                      onValueChange={(v) => updateField("journalId", v)}
                    >
                      <SelectTrigger className="none-xl border-2 h-12 uppercase font-black text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="purchase">
                          Purchase Journal
                        </SelectItem>
                        <SelectItem value="general">Miscellaneous</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "lines" && (
              <div className="animate-in fade-in slide-in-from-bottom-2">
                <div className="rounded-2xl border-2 overflow-hidden bg-muted/5">
                  <table className="w-full">
                    <thead className="bg-muted/50 border-b-2">
                      <tr>
                        <th className="p-4 text-left text-[9px] font-black uppercase tracking-widest opacity-40">
                          Product
                        </th>
                        <th className="p-4 text-left text-[9px] font-black uppercase tracking-widest opacity-40">
                          Label
                        </th>
                        <th className="p-4 text-center text-[9px] font-black uppercase tracking-widest opacity-40">
                          Qty
                        </th>
                        <th className="p-4 text-right text-[9px] font-black uppercase tracking-widest opacity-40">
                          Price
                        </th>
                        <th className="p-4 text-right text-[9px] font-black uppercase tracking-widest opacity-40 w-32">
                          Subtotal
                        </th>
                        {!isViewOnly && <th className="p-4 w-12"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 border-primary/5">
                      {(formData.invoiceLines || []).map(
                        (line: any, idx: number) => (
                          <tr key={idx} className="group hover:bg-white/40">
                            <td className="p-2 w-48">
                              <SelectSearchAdd
                                items={products}
                                value={line.productId}
                                onValueChange={(v) =>
                                  updateLine(idx, "productId", v)
                                }
                                keyField="_id"
                                labelField="header.name"
                                className="border-none shadow-none bg-transparent hover:bg-primary/5 h-10 font-bold uppercase text-[11px]"
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                value={line.name}
                                onChange={(e) =>
                                  updateLine(idx, "name", e.target.value)
                                }
                                className="border-none shadow-none bg-transparent h-10 text-[11px]"
                              />
                            </td>
                            <td className="p-2 w-20">
                              <Input
                                type="number"
                                value={line.quantity}
                                onChange={(e) =>
                                  updateLine(
                                    idx,
                                    "quantity",
                                    parseFloat(e.target.value),
                                  )
                                }
                                className="border-none shadow-none bg-transparent text-center h-10 font-black"
                              />
                            </td>
                            <td className="p-2 w-32">
                              <Input
                                type="number"
                                value={line.priceUnit}
                                onChange={(e) =>
                                  updateLine(
                                    idx,
                                    "priceUnit",
                                    parseFloat(e.target.value),
                                  )
                                }
                                className="border-none shadow-none bg-transparent text-right h-10 font-black"
                              />
                            </td>
                            <td className="p-4 text-right font-black text-[11px] tabular-nums">
                              ₹ {line.priceSubtotal?.toLocaleString()}
                            </td>
                            {!isViewOnly && (
                              <td className="p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeLine(idx)}
                                  className="text-red-500 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                  {!isViewOnly && (
                    <div className="p-4 border-t-2 border-dashed border-primary/10">
                      <Button
                        variant="ghost"
                        onClick={addLine}
                        className="w-full h-12 hover:bg-primary/5 text-primary font-black uppercase text-[10px] tracking-widest"
                      >
                        <Plus className="h-4 w-4 mr-2" /> Add a Line
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "chatter" && (
              <div className="animate-in fade-in slide-in-from-bottom-2">
                <Chatter
                  messages={formData.chatter || []}
                  onSendMessage={(message) => {
                    updateField("chatter", [
                      ...(formData.chatter || []),
                      {
                        body: message,
                        type: "comment",
                        createdAt: new Date(),
                        authorId: null,
                      },
                    ]);
                  }}
                  isViewOnly={isViewOnly}
                />
              </div>
            )}

            {activeTab === "other" && (
              <div className="grid grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      PO Match Status
                    </Label>
                    <Input
                      value={formData.poMatchStatus || "pending"}
                      readOnly
                      className="none-xl border-2 h-12 uppercase font-black"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      Discrepancy Notes
                    </Label>
                    <Textarea
                      value={formData.discrepancyNotes || ""}
                      onChange={(e) => updateField("discrepancyNotes", e.target.value)}
                      placeholder="Use this for mismatch or manual review remarks"
                      className="none-xl border-2 min-h-[110px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      Payment Method
                    </Label>
                    <Select
                      value={formData.paymentMethodId || "manual"}
                      onValueChange={(v) => updateField("paymentMethodId", v)}
                    >
                      <SelectTrigger className="none-xl border-2 h-12 uppercase font-black text-xs tracking-widest">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual Payment</SelectItem>
                        <SelectItem value="bank">Bank Transfer</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      Payment Scheduled Date
                    </Label>
                    <Input
                      type="date"
                      value={
                        formData.paymentScheduledDate
                          ? new Date(formData.paymentScheduledDate)
                              .toISOString()
                              .split("T")[0]
                          : ""
                      }
                      onChange={(e) =>
                        updateField("paymentScheduledDate", e.target.value)
                      }
                      className="none-xl border-2 h-12"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Summary */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="p-8 none-3xl border-2 bg-muted/5 space-y-8 sticky top-6">
            <div className="space-y-2 pb-6 border-b-2 border-dashed border-primary/10">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/40">
                Financial Summary
              </p>
              <div className="flex justify-between items-end pt-4">
                <p className="text-[11px] font-black uppercase text-muted-foreground">
                  Status
                </p>
                <div className="flex items-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full animate-pulse ${formData.state === DOCUMENT_STATUS.POSTED ? "bg-emerald-500" : "bg-amber-500"}`}
                  />
                  <span className="text-xl font-black uppercase tracking-tighter text-primary">
                    {formData.state || DOCUMENT_STATUS.DRAFT}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-4 group">
                <div className="h-10 w-10 none-xl bg-white border-2 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                  <CreditCard className="h-5 w-5 opacity-60" />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase text-muted-foreground/60 tracking-widest">
                    Payable To
                  </p>
                  <p className="font-bold uppercase tracking-tight text-sm">
                    {vendors.find((v) => v._id === formData.partnerId)?.header
                      ?.name || "Not Selected"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="h-10 w-10 none-xl bg-white border-2 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                  <Calculator className="h-5 w-5 opacity-60" />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase text-muted-foreground/60 tracking-widest">
                    Payable Account
                  </p>
                  <SelectSearchAdd
                    items={accounts.filter(
                      (acc) => acc.internal_group === "liability",
                    )}
                    value={formData.payableAccountId}
                    onValueChange={(v) => updateField("payableAccountId", v)}
                    keyField="_id"
                    labelField="name"
                    secondaryField="code"
                    className="border-none bg-transparent p-0 h-auto font-black uppercase text-xs tracking-tight shadow-none text-primary"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 bg-primary/5 none-2xl border-2 border-primary/10 space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between text-[11px] font-black uppercase tracking-widest opacity-40">
                  <span>Untaxed Amount</span>
                  <span>₹ {formData.amountUntaxed?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[11px] font-black uppercase tracking-widest opacity-40">
                  <span>Taxes (18%)</span>
                  <span>₹ {formData.amountTax?.toLocaleString()}</span>
                </div>
                <div className="pt-4 border-t-2 border-primary/20">
                  <div className="flex justify-between items-end">
                    <span className="text-[11px] font-black uppercase text-primary/60">
                      Total
                    </span>
                    <span className="text-4xl font-black text-primary tracking-tighter tabular-nums leading-none">
                      ₹ {formData.amountTotal?.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {formData.state === DOCUMENT_STATUS.DRAFT && (
              <div className="p-4 bg-amber-500/10 border-2 border-amber-500/20 none-2xl flex items-start gap-4">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                <p className="text-[10px] font-bold text-amber-700 leading-relaxed uppercase tracking-tight">
                  This bill is still in <span className="underline">draft</span>
                  . Posting will generate accounting journal entries and affect
                  your balance sheet.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
