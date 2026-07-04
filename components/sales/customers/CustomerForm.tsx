"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Plus, Mail, ChevronRight } from "lucide-react";

export interface CustomerFormValue {
  header: {
    name: string;
    is_company: boolean;
    displayName: string;
    customerType: "business" | "individual";
    salutation?: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
  };
  contact_details: {
    email?: string;
    phone?: string;
    mobile?: string;
    language?: string;
  };
  gstin?: string;
  pan?: string;
  currency: string;
  openingBalance: number;
  accounting_tab: { property_account_receivable_id?: string };
  sales_purchase_tab: { property_payment_term_id?: string };
  portalEnabled: boolean;
  documents: { name: string; url: string; size?: number }[];
  addresses: {
    type: "billing" | "shipping";
    attention?: string;
    street?: string;
    street2?: string;
    city?: string;
    state_name?: string;
    zip?: string;
    country?: string;
    phone?: string;
  }[];
  contactPersons: {
    salutation?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    workPhone?: string;
    mobile?: string;
    designation?: string;
  }[];
  customFields: Record<string, string>;
  reportingTags: string[];
  remarks?: string;
}

export const EMPTY_CUSTOMER: CustomerFormValue = {
  header: { name: "", is_company: true, displayName: "", customerType: "business" },
  contact_details: { language: "English" },
  currency: "INR",
  openingBalance: 0,
  accounting_tab: {},
  sales_purchase_tab: {},
  portalEnabled: false,
  documents: [],
  addresses: [
    { type: "billing" },
    { type: "shipping" },
  ],
  contactPersons: [],
  customFields: {},
  reportingTags: [],
};

interface CustomerFormProps {
  initialValue?: CustomerFormValue;
  customerId?: string;
}

export function CustomerForm({ initialValue, customerId }: CustomerFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<CustomerFormValue>(initialValue || EMPTY_CUSTOMER);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [gstinInput, setGstinInput] = useState(form.gstin || "");
  const [prefilling, setPrefilling] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [customFieldRows, setCustomFieldRows] = useState<{ key: string; value: string }[]>(
    Object.entries(form.customFields || {}).map(([key, value]) => ({ key, value })),
  );

  useEffect(() => {
    fetch("/api/accounting/accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.items || []))
      .catch(() => {});
  }, []);

  const update = (patch: Partial<CustomerFormValue>) => setForm((f) => ({ ...f, ...patch }));
  const updateNested = <K extends keyof CustomerFormValue>(key: K, patch: Partial<CustomerFormValue[K]>) =>
    setForm((f) => ({ ...f, [key]: { ...(f[key] as any), ...patch } }));

  const billing = form.addresses.find((a) => a.type === "billing") || { type: "billing" as const };
  const shipping = form.addresses.find((a) => a.type === "shipping") || { type: "shipping" as const };

  const updateAddress = (type: "billing" | "shipping", patch: Record<string, any>) => {
    setForm((f) => {
      const others = f.addresses.filter((a) => a.type !== type);
      const current = f.addresses.find((a) => a.type === type) || { type };
      return { ...f, addresses: [...others, { ...current, ...patch }] };
    });
  };

  const handlePrefill = async () => {
    if (!gstinInput) {
      toast.error("Enter a GSTIN first");
      return;
    }
    setPrefilling(true);
    try {
      const res = await fetch(`/api/sales/customers/gstin-lookup?gstin=${encodeURIComponent(gstinInput)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "GSTIN lookup failed");
      update({ gstin: gstinInput.toUpperCase() });
      if (data.data?.legalName && !form.header.companyName) {
        updateNested("header", { companyName: data.data.legalName });
      }
      if (data.data?.address?.state) {
        updateAddress("billing", { state_name: data.data.address.state });
      }
      toast.success("Prefilled from GST portal");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPrefilling(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (form.documents.length >= 10) {
      toast.error("You can upload a maximum of 10 files");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Each file must be 10MB or smaller");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    update({ documents: [...form.documents, { name: file.name, url: dataUrl, size: file.size }] });
  };

  const handleSave = async () => {
    if (!form.header.displayName?.trim()) {
      toast.error("Display Name is required");
      return;
    }

    const customFields = Object.fromEntries(
      customFieldRows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value]),
    );

    const payload = {
      ...form,
      header: { ...form.header, name: form.header.displayName },
      customFields,
    };

    setSaving(true);
    try {
      const url = customerId ? `/api/sales/customers/${customerId}` : "/api/sales/customers";
      const method = customerId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save customer");
      toast.success(customerId ? "Customer updated" : "Customer created");
      router.push("/sales/customers");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">{customerId ? "Edit Customer" : "New Customer"}</h1>

      <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 text-sm px-4 py-3 rounded-none flex items-center gap-3">
        <span>Prefill Customer details from the GST portal using the Customer&apos;s GSTIN.</span>
        <Input
          value={gstinInput}
          onChange={(e) => setGstinInput(e.target.value.toUpperCase())}
          placeholder="15-digit GSTIN"
          className="h-8 w-48 bg-background"
        />
        <button onClick={handlePrefill} disabled={prefilling} className="font-medium underline flex items-center">
          {prefilling ? "Prefilling..." : "Prefill"} <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-[180px_1fr] gap-y-5 gap-x-4 items-start">
        <Label className="pt-2">Customer Type</Label>
        <RadioGroup
          value={form.header.customerType}
          onValueChange={(v) => updateNested("header", { customerType: v as any })}
          className="flex flex-row gap-6"
        >
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="business" /> Business
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="individual" /> Individual
          </label>
        </RadioGroup>

        <Label className="pt-2">Primary Contact</Label>
        <div className="flex gap-2">
          <Select
            value={form.header.salutation || ""}
            onValueChange={(v) => updateNested("header", { salutation: v })}
          >
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Salutation" />
            </SelectTrigger>
            <SelectContent>
              {["Mr.", "Mrs.", "Ms.", "Dr."].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="First Name"
            value={form.header.firstName || ""}
            onChange={(e) => updateNested("header", { firstName: e.target.value })}
          />
          <Input
            placeholder="Last Name"
            value={form.header.lastName || ""}
            onChange={(e) => updateNested("header", { lastName: e.target.value })}
          />
        </div>

        <Label className="pt-2">Company Name</Label>
        <Input
          value={form.header.companyName || ""}
          onChange={(e) => updateNested("header", { companyName: e.target.value })}
        />

        <Label className="pt-2">
          Display Name <span className="text-red-500">*</span>
        </Label>
        <div>
          <Input
            list="display-name-suggestions"
            placeholder="Select or type to add"
            value={form.header.displayName}
            onChange={(e) => updateNested("header", { displayName: e.target.value })}
          />
          <datalist id="display-name-suggestions">
            {form.header.companyName && <option value={form.header.companyName} />}
            {form.header.firstName && form.header.lastName && (
              <option value={`${form.header.firstName} ${form.header.lastName}`} />
            )}
          </datalist>
        </div>

        <Label className="pt-2">Email Address</Label>
        <div className="relative max-w-sm">
          <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="email"
            className="pl-9"
            value={form.contact_details.email || ""}
            onChange={(e) => updateNested("contact_details", { email: e.target.value })}
          />
        </div>

        <Label className="pt-2">Phone</Label>
        <div className="flex gap-3">
          <div className="flex-1">
            <span className="text-xs text-muted-foreground">Work Phone</span>
            <div className="flex">
              <span className="border rounded-none px-2 flex items-center text-sm bg-muted">+91</span>
              <Input
                value={form.contact_details.phone || ""}
                onChange={(e) => updateNested("contact_details", { phone: e.target.value })}
              />
            </div>
          </div>
          <div className="flex-1">
            <span className="text-xs text-muted-foreground">Mobile</span>
            <div className="flex">
              <span className="border rounded-none px-2 flex items-center text-sm bg-muted">+91</span>
              <Input
                value={form.contact_details.mobile || ""}
                onChange={(e) => updateNested("contact_details", { mobile: e.target.value })}
              />
            </div>
          </div>
        </div>

        <Label className="pt-2">Customer Language</Label>
        <Select
          value={form.contact_details.language || "English"}
          onValueChange={(v) => updateNested("contact_details", { language: v })}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["English", "Hindi", "Tamil", "Telugu", "Marathi", "Gujarati"].map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="other">
        <TabsList className="flex w-full justify-start bg-transparent border-b rounded-none h-auto p-0 gap-4">
          {[
            ["other", "Other Details"],
            ["address", "Address"],
            ["contacts", "Contact Persons"],
            ["custom", "Custom Fields"],
            ["tags", "Reporting Tags"],
            ["remarks", "Remarks"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 pb-2"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="other" className="pt-4 space-y-4">
          <div className="grid grid-cols-[180px_1fr] gap-y-4 gap-x-4 items-center max-w-2xl">
            <Label>PAN</Label>
            <Input value={form.pan || ""} onChange={(e) => update({ pan: e.target.value.toUpperCase() })} />

            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(v) => update({ currency: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INR">INR - Indian Rupee</SelectItem>
                <SelectItem value="USD">USD - US Dollar</SelectItem>
                <SelectItem value="EUR">EUR - Euro</SelectItem>
              </SelectContent>
            </Select>

            <Label>Accounts Receivable</Label>
            <Select
              value={form.accounting_tab.property_account_receivable_id || ""}
              onValueChange={(v) => updateNested("accounting_tab", { property_account_receivable_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a: any) => (
                  <SelectItem key={a._id} value={a._id}>
                    {a.name || a.accountName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Label>Opening Balance</Label>
            <div className="flex">
              <span className="border rounded-none px-2 flex items-center text-sm bg-muted">INR</span>
              <Input
                type="number"
                value={form.openingBalance}
                onChange={(e) => update({ openingBalance: Number(e.target.value) })}
              />
            </div>

            <Label>Payment Terms</Label>
            <Select
              value={form.sales_purchase_tab.property_payment_term_id || "due_on_receipt"}
              onValueChange={(v) => updateNested("sales_purchase_tab", { property_payment_term_id: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                <SelectItem value="net_15">Net 15</SelectItem>
                <SelectItem value="net_30">Net 30</SelectItem>
                <SelectItem value="net_45">Net 45</SelectItem>
              </SelectContent>
            </Select>

            <Label>Enable Portal?</Label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.portalEnabled} onCheckedChange={(v) => update({ portalEnabled: !!v })} />
              Allow portal access for this customer
            </label>
          </div>

          <div className="max-w-2xl space-y-2">
            <Label>Documents</Label>
            <div className="border border-dashed rounded-none p-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                You can upload a maximum of 10 files, 10MB each
              </span>
              <label>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                />
                <span className="text-sm font-medium text-blue-600 cursor-pointer">Upload File</span>
              </label>
            </div>
            {form.documents.length > 0 && (
              <ul className="text-sm space-y-1">
                {form.documents.map((d, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span>{d.name}</span>
                    <button
                      onClick={() => update({ documents: form.documents.filter((_, idx) => idx !== i) })}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="address" className="pt-4">
          <div className="grid grid-cols-2 gap-8">
            {(["billing", "shipping"] as const).map((type) => {
              const addr = type === "billing" ? billing : shipping;
              return (
                <div key={type} className="space-y-3">
                  <h3 className="font-semibold capitalize">{type} Address</h3>
                  <Input
                    placeholder="Attention"
                    value={addr.attention || ""}
                    onChange={(e) => updateAddress(type, { attention: e.target.value })}
                  />
                  <Input
                    placeholder="Street"
                    value={addr.street || ""}
                    onChange={(e) => updateAddress(type, { street: e.target.value })}
                  />
                  <Input
                    placeholder="Street 2"
                    value={addr.street2 || ""}
                    onChange={(e) => updateAddress(type, { street2: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="City"
                      value={addr.city || ""}
                      onChange={(e) => updateAddress(type, { city: e.target.value })}
                    />
                    <Input
                      placeholder="State"
                      value={addr.state_name || ""}
                      onChange={(e) => updateAddress(type, { state_name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Zip"
                      value={addr.zip || ""}
                      onChange={(e) => updateAddress(type, { zip: e.target.value })}
                    />
                    <Input
                      placeholder="Country"
                      value={addr.country || ""}
                      onChange={(e) => updateAddress(type, { country: e.target.value })}
                    />
                  </div>
                  <Input
                    placeholder="Phone"
                    value={addr.phone || ""}
                    onChange={(e) => updateAddress(type, { phone: e.target.value })}
                  />
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="pt-4 space-y-3">
          {form.contactPersons.map((cp, i) => (
            <div key={i} className="grid grid-cols-7 gap-2 items-center">
              <Input
                placeholder="Salutation"
                value={cp.salutation || ""}
                onChange={(e) => {
                  const next = [...form.contactPersons];
                  next[i] = { ...cp, salutation: e.target.value };
                  update({ contactPersons: next });
                }}
              />
              <Input
                placeholder="First Name"
                value={cp.firstName || ""}
                onChange={(e) => {
                  const next = [...form.contactPersons];
                  next[i] = { ...cp, firstName: e.target.value };
                  update({ contactPersons: next });
                }}
              />
              <Input
                placeholder="Last Name"
                value={cp.lastName || ""}
                onChange={(e) => {
                  const next = [...form.contactPersons];
                  next[i] = { ...cp, lastName: e.target.value };
                  update({ contactPersons: next });
                }}
              />
              <Input
                placeholder="Email"
                value={cp.email || ""}
                onChange={(e) => {
                  const next = [...form.contactPersons];
                  next[i] = { ...cp, email: e.target.value };
                  update({ contactPersons: next });
                }}
              />
              <Input
                placeholder="Work Phone"
                value={cp.workPhone || ""}
                onChange={(e) => {
                  const next = [...form.contactPersons];
                  next[i] = { ...cp, workPhone: e.target.value };
                  update({ contactPersons: next });
                }}
              />
              <Input
                placeholder="Designation"
                value={cp.designation || ""}
                onChange={(e) => {
                  const next = [...form.contactPersons];
                  next[i] = { ...cp, designation: e.target.value };
                  update({ contactPersons: next });
                }}
              />
              <button onClick={() => update({ contactPersons: form.contactPersons.filter((_, idx) => idx !== i) })}>
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => update({ contactPersons: [...form.contactPersons, {}] })}>
            <Plus className="w-4 h-4 mr-1" /> Add Contact Person
          </Button>
        </TabsContent>

        <TabsContent value="custom" className="pt-4 space-y-3">
          {customFieldRows.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                placeholder="Field Name"
                value={row.key}
                onChange={(e) => {
                  const next = [...customFieldRows];
                  next[i] = { ...row, key: e.target.value };
                  setCustomFieldRows(next);
                }}
              />
              <Input
                placeholder="Value"
                value={row.value}
                onChange={(e) => {
                  const next = [...customFieldRows];
                  next[i] = { ...row, value: e.target.value };
                  setCustomFieldRows(next);
                }}
              />
              <button onClick={() => setCustomFieldRows(customFieldRows.filter((_, idx) => idx !== i))}>
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setCustomFieldRows([...customFieldRows, { key: "", value: "" }])}>
            <Plus className="w-4 h-4 mr-1" /> Add Custom Field
          </Button>
        </TabsContent>

        <TabsContent value="tags" className="pt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {form.reportingTags.map((tag, i) => (
              <span key={i} className="bg-muted px-2 py-1 text-xs rounded-none flex items-center gap-1">
                {tag}
                <button onClick={() => update({ reportingTags: form.reportingTags.filter((_, idx) => idx !== i) })}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 max-w-sm">
            <Input
              placeholder="Add a tag and press Enter"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tagInput.trim()) {
                  e.preventDefault();
                  update({ reportingTags: [...form.reportingTags, tagInput.trim()] });
                  setTagInput("");
                }
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="remarks" className="pt-4">
          <Textarea
            className="max-w-2xl"
            rows={5}
            value={form.remarks || ""}
            onChange={(e) => update({ remarks: e.target.value })}
            placeholder="Internal remarks about this customer"
          />
        </TabsContent>
      </Tabs>

      <div className="flex items-center gap-3 pt-4 border-t">
        <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/sales/customers")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
