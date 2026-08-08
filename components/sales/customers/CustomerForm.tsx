"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { consumePrefill } from "@/lib/ai/aiPrefill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, ChevronRight, Mail, Download } from "lucide-react";
import { uploadToCloudinary } from "@/lib/upload";

const COUNTRIES = [
  "India",
  "United States",
  "United Kingdom",
  "United Arab Emirates",
  "Singapore",
  "Australia",
  "Canada",
  "Germany",
];

const INDIAN_STATES = [
  "Maharashtra",
  "Karnataka",
  "Delhi",
  "Tamil Nadu",
  "Gujarat",
  "Haryana",
  "Uttar Pradesh",
  "West Bengal",
  "Telangana",
  "Rajasthan",
];

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
    fax?: string;
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
  sales_purchase_tab: { property_payment_term_id: "due_on_receipt" },
  portalEnabled: false,
  documents: [],
  addresses: [
    { type: "billing", country: "India" },
    { type: "shipping", country: "India" },
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

  const [customFieldDefs, setCustomFieldDefs] = useState<any[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [addingField, setAddingField] = useState(false);

  const [reportingTagDefs, setReportingTagDefs] = useState<any[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [addingTag, setAddingTag] = useState(false);

  useEffect(() => {
    fetch("/api/accounting/accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.items || []))
      .catch(() => {});
    fetch("/api/sales/customers/custom-field-definitions")
      .then((r) => r.json())
      .then((d) => d.success && setCustomFieldDefs(d.data))
      .catch(() => {});
    fetch("/api/sales/customers/reporting-tags")
      .then((r) => r.json())
      .then((d) => d.success && setReportingTagDefs(d.data))
      .catch(() => {});
  }, []);

  // AI-native pre-fill: when the assistant prepared a customer, merge the
  // extracted fields into the real form and surface its suggestions. The user
  // still reviews and clicks the real "Save"/"Create" button (only on create).
  useEffect(() => {
    if (customerId) return;
    const p = consumePrefill("customer");
    if (!p) return;
    const d: any = p.data || {};
    const name = String(d.name || d.customerName || d.companyName || "").trim();
    const isCompany = typeof d.is_company === "boolean" ? d.is_company : Boolean(d.companyName && !d.firstName);
    setForm((f) => ({
      ...f,
      header: {
        ...f.header,
        name: name || f.header.name,
        displayName: name || f.header.displayName,
        is_company: isCompany,
        customerType: isCompany ? "business" : "individual",
        salutation: d.salutation || f.header.salutation,
        companyName: d.companyName || (isCompany ? name : f.header.companyName),
        firstName: d.firstName || f.header.firstName,
        lastName: d.lastName || f.header.lastName,
      },
      contact_details: {
        ...f.contact_details,
        email: d.email || f.contact_details.email,
        phone: d.phone || f.contact_details.phone,
        mobile: d.mobile || f.contact_details.mobile,
      },
      gstin: d.gstin || f.gstin,
      pan: d.pan || f.pan,
      currency: d.currency || f.currency,
    }));
    if (d.gstin) setGstinInput(String(d.gstin).toUpperCase());
    if (p.suggestions && p.suggestions.length) {
      toast.info("Review before saving", { description: p.suggestions.join("  •  "), duration: 9000 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

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

  const handleCopyBillingToShipping = () => {
    updateAddress("shipping", { ...billing, type: "shipping" });
    toast.success("Copied billing address to shipping address");
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
        updateAddress("billing", { state_name: data.data.address.state, country: "India" });
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
    const toastId = toast.loading("Uploading file...");
    try {
      const url = await uploadToCloudinary(file);
      update({ documents: [...form.documents, { name: file.name, url, size: file.size }] });
      toast.success("File uploaded", { id: toastId });
    } catch (e: any) {
      toast.error(e.message || "Failed to upload file", { id: toastId });
    }
  };

  const handleAddCustomFieldDef = async () => {
    if (!newFieldLabel.trim()) return;
    setAddingField(true);
    try {
      const res = await fetch("/api/sales/customers/custom-field-definitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newFieldLabel.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to add custom field");
      setCustomFieldDefs((defs) => [...defs, data.data]);
      setNewFieldLabel("");
      toast.success("Custom field added — it will show up for every customer from now on");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingField(false);
    }
  };

  const handleAddReportingTagDef = async () => {
    if (!newTagName.trim()) return;
    setAddingTag(true);
    try {
      const res = await fetch("/api/sales/customers/reporting-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to add reporting tag");
      setReportingTagDefs((defs) => [...defs, data.data]);
      update({ reportingTags: [...form.reportingTags, data.data.name] });
      setNewTagName("");
      toast.success("Reporting tag added");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAddingTag(false);
    }
  };

  const toggleReportingTag = (name: string) => {
    update({
      reportingTags: form.reportingTags.includes(name)
        ? form.reportingTags.filter((t) => t !== name)
        : [...form.reportingTags, name],
    });
  };

  const handleSave = async () => {
    if (!form.header.displayName?.trim()) {
      toast.error("Display Name is required");
      return;
    }

    const payload = {
      ...form,
      header: { ...form.header, name: form.header.displayName },
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
          <div className="grid grid-cols-2 gap-10">
            <div className="space-y-3">
              <h3 className="font-semibold">Billing Address</h3>
              <AddressFields addr={billing} onChange={(patch) => updateAddress("billing", patch)} />
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Shipping Address</h3>
                <span className="text-xs">
                  (
                  <button onClick={handleCopyBillingToShipping} className="text-blue-600 underline inline-flex items-center gap-1">
                    <Download className="w-3 h-3" /> Copy billing address
                  </button>
                  )
                </span>
              </div>
              <AddressFields addr={shipping} onChange={(patch) => updateAddress("shipping", patch)} />
            </div>
          </div>

          <div className="mt-6 border-l-4 border-yellow-400 bg-muted/30 p-4 text-xs text-muted-foreground max-w-3xl space-y-1">
            <p className="font-medium text-foreground">Note:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Add and manage additional addresses from this Customer&apos;s details section.</li>
              <li>
                You can customise how customers&apos; addresses are displayed in transaction PDFs. To do this, go to
                Settings &gt; Preferences &gt; Customers and Vendors, and navigate to the Address Format sections.
              </li>
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="pt-4 space-y-3">
          <div className="border rounded-none overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Salutation</TableHead>
                  <TableHead>First Name</TableHead>
                  <TableHead>Last Name</TableHead>
                  <TableHead>Email Address</TableHead>
                  <TableHead>Work Phone</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {form.contactPersons.map((cp, i) => {
                  const patchRow = (patch: Record<string, any>) => {
                    const next = [...form.contactPersons];
                    next[i] = { ...cp, ...patch };
                    update({ contactPersons: next });
                  };
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <Select value={cp.salutation || ""} onValueChange={(v) => patchRow({ salutation: v })}>
                          <SelectTrigger className="h-8 w-24">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {["Mr.", "Mrs.", "Ms.", "Dr."].map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input className="h-8" value={cp.firstName || ""} onChange={(e) => patchRow({ firstName: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input className="h-8" value={cp.lastName || ""} onChange={(e) => patchRow({ lastName: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input className="h-8" value={cp.email || ""} onChange={(e) => patchRow({ email: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <div className="flex">
                          <span className="border rounded-none px-1.5 flex items-center text-xs bg-muted">+91</span>
                          <Input
                            className="h-8"
                            value={cp.workPhone || ""}
                            onChange={(e) => patchRow({ workPhone: e.target.value })}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex">
                          <span className="border rounded-none px-1.5 flex items-center text-xs bg-muted">+91</span>
                          <Input className="h-8" value={cp.mobile || ""} onChange={(e) => patchRow({ mobile: e.target.value })} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <button onClick={() => update({ contactPersons: form.contactPersons.filter((_, idx) => idx !== i) })}>
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Button variant="outline" size="sm" onClick={() => update({ contactPersons: [...form.contactPersons, {}] })}>
            <Plus className="w-4 h-4 mr-1" /> Add Contact Person
          </Button>
        </TabsContent>

        <TabsContent value="custom" className="pt-4 space-y-4">
          {customFieldDefs.length === 0 ? (
            <p className="text-sm text-muted-foreground max-w-lg">
              Start adding custom fields for your Customers and Vendors by going to{" "}
              <span className="text-blue-600 italic">Settings ➠ Preferences ➠ Customers and Vendors</span>. You can
              also refine the address format of your Customers and Vendors from there.
            </p>
          ) : (
            <div className="grid grid-cols-[180px_1fr] gap-y-3 gap-x-4 items-center max-w-2xl">
              {customFieldDefs.map((def: any) => (
                <div key={def._id} className="contents">
                  <Label>{def.label}</Label>
                  <Input
                    value={form.customFields[def.label] || ""}
                    onChange={(e) => update({ customFields: { ...form.customFields, [def.label]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 max-w-md items-center">
            <Input
              placeholder="New custom field label"
              value={newFieldLabel}
              onChange={(e) => setNewFieldLabel(e.target.value)}
            />
            <Button variant="outline" size="sm" onClick={handleAddCustomFieldDef} disabled={addingField}>
              <Plus className="w-4 h-4 mr-1" /> Add Custom Field
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="tags" className="pt-4 space-y-4">
          {reportingTagDefs.length === 0 ? (
            <p className="text-sm text-muted-foreground max-w-lg">
              You&apos;ve not created any Reporting Tags.
              <br />
              Start creating reporting tags by going to{" "}
              <span className="text-blue-600 italic">More Settings ➠ Reporting Tags</span>
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {reportingTagDefs.map((def: any) => {
                const active = form.reportingTags.includes(def.name);
                return (
                  <button
                    key={def._id}
                    onClick={() => toggleReportingTag(def.name)}
                    className={`px-2.5 py-1 text-xs rounded-none border ${
                      active
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-background text-muted-foreground border-input"
                    }`}
                  >
                    {def.name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-2 max-w-sm items-center">
            <Input
              placeholder="New reporting tag"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddReportingTagDef()}
            />
            <Button variant="outline" size="sm" onClick={handleAddReportingTagDef} disabled={addingTag}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
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

      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 flex items-center justify-end gap-3 z-50">
        <Button variant="outline" onClick={() => router.push("/sales/customers")}>
          Cancel
        </Button>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}

function AddressFields({
  addr,
  onChange,
}: {
  addr: Record<string, any>;
  onChange: (patch: Record<string, any>) => void;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-y-3 gap-x-3 items-center">
      <Label className="text-xs">Attention</Label>
      <Input className="h-9" value={addr.attention || ""} onChange={(e) => onChange({ attention: e.target.value })} />

      <Label className="text-xs">Country/Region</Label>
      <Select value={addr.country || "India"} onValueChange={(v) => onChange({ country: v })}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {COUNTRIES.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Label className="text-xs">Address</Label>
      <div className="space-y-2">
        <Textarea
          rows={1}
          placeholder="Street 1"
          value={addr.street || ""}
          onChange={(e) => onChange({ street: e.target.value })}
        />
        <Textarea
          rows={1}
          placeholder="Street 2"
          value={addr.street2 || ""}
          onChange={(e) => onChange({ street2: e.target.value })}
        />
      </div>

      <Label className="text-xs">City</Label>
      <Input className="h-9" value={addr.city || ""} onChange={(e) => onChange({ city: e.target.value })} />

      <Label className="text-xs">State</Label>
      <div>
        <Input
          className="h-9"
          list="state-suggestions"
          placeholder="Select or type to add"
          value={addr.state_name || ""}
          onChange={(e) => onChange({ state_name: e.target.value })}
        />
        <datalist id="state-suggestions">
          {INDIAN_STATES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      <Label className="text-xs">Pin Code</Label>
      <Input className="h-9" value={addr.zip || ""} onChange={(e) => onChange({ zip: e.target.value })} />

      <Label className="text-xs">Phone</Label>
      <div className="flex">
        <span className="border rounded-none px-2 flex items-center text-sm bg-muted">+91</span>
        <Input className="h-9" value={addr.phone || ""} onChange={(e) => onChange({ phone: e.target.value })} />
      </div>

      <Label className="text-xs">Fax Number</Label>
      <Input className="h-9" value={addr.fax || ""} onChange={(e) => onChange({ fax: e.target.value })} />
    </div>
  );
}
