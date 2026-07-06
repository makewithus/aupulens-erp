"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AccountingSubNav } from "@/components/finance/accounting/AccountingSubNav";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Plus, Search, Lock, Users, Upload, Download, ArrowLeft, Settings as SettingsIcon, ArrowUpDown, Eye, Star } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { useSession } from "next-auth/react";
import { Lightbulb } from "lucide-react";
import { DateField } from "@/components/finance/accounting/DateField";
import { useAccountingCurrencyStore } from "@/store/useAccountingCurrencyStore";
import { AccountPicker } from "@/components/finance/accounting/AccountPicker";

interface JournalLineRow {
  id: number;
  accountId: string;
  description: string;
  contactId: string;
  debit: string;
  credit: string;
}

const emptyLine = (id: number): JournalLineRow => ({ id, accountId: "", description: "", contactId: "", debit: "", credit: "" });

const REPORTING_METHODS = [
  { value: "accrual_and_cash", label: "Accrual and Cash" },
  { value: "accrual_only", label: "Accrual Only" },
  { value: "cash_only", label: "Cash Only" },
];

const JournalForm = ({ accounts }: { accounts: any[] }) => {
  const router = useRouter();
  const todayIso = new Date().toISOString().slice(0, 10);
  const { baseCurrency, enabledCurrencies, fetchCurrency } = useAccountingCurrencyStore();

  const [date, setDate] = useState(todayIso);
  const [reverseJournalDate, setReverseJournalDate] = useState("");
  const [publishReverseOnDate, setPublishReverseOnDate] = useState(false);
  const [journalNumber, setJournalNumber] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [reportingMethod, setReportingMethod] = useState("accrual_and_cash");
  const [currency, setCurrency] = useState(baseCurrency);
  const [rows, setRows] = useState<JournalLineRow[]>([emptyLine(1), emptyLine(2)]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [saving, setSaving] = useState<"draft" | "posted" | null>(null);

  useEffect(() => {
    fetchCurrency();
  }, [fetchCurrency]);

  useEffect(() => {
    setCurrency(baseCurrency);
  }, [baseCurrency]);

  useEffect(() => {
    fetch("/api/sales/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d.items || []))
      .catch(() => {});
    fetch("/api/finance/accounting/journal-templates")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setTemplates(d.data);
      })
      .catch(() => {});
  }, []);

  const updateRow = (id: number, patch: Partial<JournalLineRow>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows([...rows, emptyLine(Date.now())]);
  const removeRow = (id: number) => rows.length > 2 && setRows(rows.filter((r) => r.id !== id));

  const applyTemplate = (tpl: any) => {
    setNotes(tpl.notes || "");
    setReportingMethod(tpl.reportingMethod || "accrual_and_cash");
    setCurrency(tpl.currency || "INR");
    setReference(tpl.referenceNumber || "");
    if (tpl.lines?.length) {
      setRows(
        tpl.lines.map((l: any, i: number) => ({
          id: Date.now() + i,
          accountId: l.accountId?._id || l.accountId || "",
          description: l.description || "",
          contactId: l.contactId || "",
          debit: "",
          credit: "",
        })),
      );
    }
    toast.success(`Applied template "${tpl.templateName}"`);
  };

  const subTotalDebit = rows.reduce((s, r) => s + (Number(r.debit) || 0), 0);
  const subTotalCredit = rows.reduce((s, r) => s + (Number(r.credit) || 0), 0);
  const difference = Number((subTotalDebit - subTotalCredit).toFixed(2));

  const resetForm = () => {
    setDate(todayIso);
    setReverseJournalDate("");
    setPublishReverseOnDate(false);
    setJournalNumber("");
    setReference("");
    setNotes("");
    setReportingMethod("accrual_and_cash");
    setRows([emptyLine(1), emptyLine(2)]);
  };

  const handleSave = async (status: "draft" | "posted") => {
    if (!notes.trim()) return toast.error("Notes is required");
    const validLines = rows.filter((r) => r.accountId && (Number(r.debit) > 0 || Number(r.credit) > 0));
    if (validLines.length < 2) return toast.error("At least two lines with an account and amount are required");
    if (status === "posted" && difference !== 0) {
      return toast.error(`Unbalanced journal: debit ${subTotalDebit.toFixed(2)} must equal credit ${subTotalCredit.toFixed(2)}`);
    }

    setSaving(status);
    try {
      const res = await fetch("/api/finance/journal-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          header: { name: journalNumber || undefined, date, ref: reference, journalType: "general" },
          lineIds: validLines.map((r) => ({
            accountId: r.accountId,
            label: r.description,
            debit: Number(r.debit) || 0,
            credit: Number(r.credit) || 0,
            partnerId: r.contactId || undefined,
          })),
          voucherType: "journal",
          voucherStatus: status,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to save journal");
      toast.success(status === "posted" ? "Journal published" : "Journal saved as draft");
      resetForm();
      router.push("/finance/accounting/journal-entries");
    } catch (e: any) {
      toast.error(e.message || "Failed to save journal");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="bg-card text-card-foreground p-8 rounded-lg shadow-sm border max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8 pb-4 border-b border-border">
        <h2 className="text-2xl font-semibold tracking-tight">New Journal</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="link" className="text-primary hover:underline text-sm font-medium px-0">Choose Template ▾</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {templates.map((t) => (
              <DropdownMenuItem key={t._id} onClick={() => applyTemplate(t)} className="cursor-pointer">
                {t.templateName}
              </DropdownMenuItem>
            ))}
            {templates.length > 0 && <div className="h-px bg-border my-1" />}
            <DropdownMenuItem onClick={() => router.push("/finance/accounting/journals/templates/new")} className="cursor-pointer text-primary">
              + New Template
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-[200px_1fr] gap-y-6 items-start max-w-3xl">
        <label className="text-sm font-medium text-red-500 pt-2">Date*</label>
        <DateField value={date} onChange={setDate} className="max-w-[300px]" />

        <label className="text-sm font-medium text-muted-foreground pt-2">Reverse Journal Date</label>
        <div className="space-y-2">
          <DateField value={reverseJournalDate} onChange={setReverseJournalDate} className="max-w-[300px]" />
          <div className="flex items-center space-x-2">
            <Checkbox id="publish_reverse" checked={publishReverseOnDate} onCheckedChange={(c) => setPublishReverseOnDate(!!c)} />
            <label htmlFor="publish_reverse" className="text-sm text-muted-foreground">Publish reverse journal only on the reverse journal date <span className="opacity-70">ⓘ</span></label>
          </div>
        </div>

        <label className="text-sm font-medium text-muted-foreground pt-2">Journal# <span className="opacity-70">(auto if blank)</span></label>
        <div className="flex items-center max-w-[300px]">
          <Input value={journalNumber} onChange={(e) => setJournalNumber(e.target.value)} placeholder="Auto-generated" className="rounded-r-none focus-visible:ring-0 border-r-0" />
          <Button variant="outline" className="rounded-l-none border-l-0 px-3 text-primary hover:bg-transparent" type="button"><SettingsIcon className="h-4 w-4" /></Button>
        </div>

        <label className="text-sm font-medium text-muted-foreground pt-2">Reference#</label>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} className="max-w-[300px]" />

        <label className="text-sm font-medium text-red-500 pt-2">Notes*</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Max. 500 characters" maxLength={500} className="max-w-[400px] h-24 resize-none" />

        <label className="text-sm font-medium text-muted-foreground pt-2">Reporting Method <span className="opacity-70">ⓘ</span></label>
        <div className="flex items-center space-x-6 pt-2">
          {REPORTING_METHODS.map((m) => (
            <label key={m.value} className="flex items-center space-x-2 text-sm cursor-pointer">
              <input type="radio" name="reporting" className="accent-primary" checked={reportingMethod === m.value} onChange={() => setReportingMethod(m.value)} />
              <span>{m.label}</span>
            </label>
          ))}
        </div>

        <label className="text-sm font-medium text-muted-foreground pt-2">Currency</label>
        <Select value={currency} onValueChange={setCurrency}>
          <SelectTrigger className="max-w-[300px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {enabledCurrencies.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.code} - {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-12">
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted border-b text-muted-foreground text-xs tracking-wider">
              <tr>
                <th className="py-3 px-4 font-medium w-8"></th>
                <th className="py-3 px-4 text-left font-medium w-[25%] border-r">ACCOUNT</th>
                <th className="py-3 px-4 text-left font-medium w-[25%] border-r">DESCRIPTION</th>
                <th className="py-3 px-4 text-left font-medium w-[20%] border-r">CONTACT ({currency})</th>
                <th className="py-3 px-4 text-right font-medium border-r">DEBITS</th>
                <th className="py-3 px-4 text-right font-medium">CREDITS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b group bg-card hover:bg-muted/50 transition-colors">
                  <td className="p-2 text-center text-muted-foreground cursor-pointer" onClick={() => removeRow(row.id)}>✕</td>
                  <td className="p-0 border-r">
                    <AccountPicker
                      accounts={accounts}
                      value={row.accountId}
                      onChange={(v) => updateRow(row.id, { accountId: v })}
                      placeholder="Select an account"
                      className="border-0 shadow-none h-10 w-full rounded-none px-3 bg-transparent"
                    />
                  </td>
                  <td className="p-0 border-r">
                    <Input
                      value={row.description}
                      onChange={(e) => updateRow(row.id, { description: e.target.value })}
                      placeholder="Description"
                      className="border-0 shadow-none focus-visible:ring-0 rounded-none h-10 px-3 bg-transparent"
                    />
                  </td>
                  <td className="p-0 border-r">
                    <Select value={row.contactId || "none"} onValueChange={(v) => updateRow(row.id, { contactId: v === "none" ? "" : v })}>
                      <SelectTrigger className="border-0 shadow-none focus:ring-0 rounded-none h-10 px-3 bg-transparent"><SelectValue placeholder="Select Contact" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {customers.map((c) => (
                          <SelectItem key={c._id} value={c._id}>{c.header?.name || c.name || "Unnamed"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-0 border-r">
                    <Input
                      type="number"
                      value={row.debit}
                      onChange={(e) => updateRow(row.id, { debit: e.target.value, credit: e.target.value ? "" : row.credit })}
                      className="border-0 shadow-none focus-visible:ring-0 rounded-none h-10 text-right px-3 bg-transparent"
                    />
                  </td>
                  <td className="p-0">
                    <Input
                      type="number"
                      value={row.credit}
                      onChange={(e) => updateRow(row.id, { credit: e.target.value, debit: e.target.value ? "" : row.debit })}
                      className="border-0 shadow-none focus-visible:ring-0 rounded-none h-10 text-right px-3 bg-transparent"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-between items-start">
          <Button variant="ghost" className="text-primary hover:text-primary hover:bg-primary/10 font-medium px-2" onClick={addRow} type="button">
            <div className="bg-primary/20 rounded-full p-0.5 mr-2"><Plus className="h-4 w-4" /></div> Add New Row
          </Button>

          <div className="w-[450px] bg-muted/50 rounded-lg p-6 space-y-4">
            <div className="flex justify-between text-sm items-center">
              <span className="font-medium text-foreground">Sub Total</span>
              <div className="flex space-x-12 font-medium text-foreground"><span className="w-20 text-right">{subTotalDebit.toFixed(2)}</span><span className="w-20 text-right">{subTotalCredit.toFixed(2)}</span></div>
            </div>
            <div className="flex justify-between text-base items-center">
              <span className="font-bold text-foreground">Total ({currency})</span>
              <div className="flex space-x-12 font-bold text-foreground"><span className="w-20 text-right">{subTotalDebit.toFixed(2)}</span><span className="w-20 text-right">{subTotalCredit.toFixed(2)}</span></div>
            </div>
            <div className="flex justify-between text-sm items-center" style={{ color: difference === 0 ? undefined : "#ef4444" }}>
              <span>Difference</span>
              <span className="font-medium pr-2">{difference.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 flex items-center justify-end gap-3 z-50">
        <Button variant="outline" className="font-medium px-6 bg-background" onClick={() => handleSave("draft")} disabled={!!saving}>
          {saving === "draft" ? "Saving..." : "Save as Draft"}
        </Button>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6" onClick={() => handleSave("posted")} disabled={!!saving}>
          {saving === "posted" ? "Publishing..." : "Save and Publish"}
        </Button>
        <Button variant="outline" className="font-medium" onClick={resetForm} disabled={!!saving} type="button">Cancel</Button>
      </div>
    </div>
  );
};

export default function ChartOfAccountsPage() {
  return (
    <Suspense fallback={null}>
      <ChartOfAccountsPageInner />
    </Suspense>
  );
}

function ChartOfAccountsPageInner() {
  const { data: session } = useSession();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountTypes, setAccountTypes] = useState<any[]>([]);
  const [accountants, setAccountants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("active");
  const [search, setSearch] = useState("");
  
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isAccountantsOpen, setIsAccountantsOpen] = useState(false);
  const [selectedAccountant, setSelectedAccountant] = useState<any>(null);
  
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importStep, setImportStep] = useState(1);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importConfig, setImportConfig] = useState({ duplicateHandling: "skip", encoding: "UTF-8" });
  const [importColumns, setImportColumns] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importMapping, setImportMapping] = useState({ accountName: "", accountCode: "", accountType: "", description: "" });
  const [importResult, setImportResult] = useState<any>(null);

  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<"all" | "view">("all");
  const [exportFormat, setExportFormat] = useState("csv");

  const [formData, setFormData] = useState({ accountName: "", accountCode: "", accountType: "", description: "", watchlist: false });
  const [editAccountId, setEditAccountId] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") === "Journals" ? "Journals" : "Chart of Accounts");

  useEffect(() => {
    setActiveTab(searchParams.get("tab") === "Journals" ? "Journals" : "Chart of Accounts");
  }, [searchParams]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [accRes, typeRes] = await Promise.all([
        fetch(`/api/finance/accounting/accounts?view=${view}`),
        fetch("/api/finance/accounting/account-types")
      ]);
      const accData = await accRes.json();
      const typeData = await typeRes.json();
      if (accRes.ok) setAccounts(accData.accounts || []);
      if (typeRes.ok) setAccountTypes(typeData.accountTypes || []);
    } catch (e) {
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  const fetchAccountants = async () => {
    try {
      const res = await fetch("/api/finance/accounting/accountants");
      const data = await res.json();
      if (res.ok) setAccountants(data.accountants || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, [view]);

  useEffect(() => {
    if (isAccountantsOpen && accountants.length === 0) fetchAccountants();
  }, [isAccountantsOpen]);

  const handleCreateAccount = async () => {
    try {
      const url = editAccountId 
        ? `/api/finance/accounting/accounts/${editAccountId}`
        : "/api/finance/accounting/accounts";
      const method = editAccountId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(editAccountId ? "Account updated" : "Account created");
        setIsAccountModalOpen(false);
        setFormData({ accountName: "", accountCode: "", accountType: "", description: "", watchlist: false });
        setEditAccountId(null);
        fetchData();
      } else {
        toast.error(data.error || `Failed to ${editAccountId ? 'update' : 'create'} account`);
      }
    } catch (e) {
      toast.error("An error occurred");
    }
  };

  const handleEditClick = (account: any) => {
    setEditAccountId(account._id);
    setFormData({
      accountName: account.accountName || "",
      accountCode: account.accountCode || "",
      accountType: account.accountType?._id || account.accountType || "",
      description: account.description || "",
      watchlist: !!account.watchlist
    });
    setIsAccountModalOpen(true);
  };

  const handleToggleActive = async (id: string, newActiveState: boolean) => {
    try {
      const res = await fetch(`/api/finance/accounting/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newActiveState }),
      });
      if (res.ok) {
        toast.success(newActiveState ? "Account marked as active" : "Account marked as inactive");
        fetchData();
      } else {
        toast.error("Failed to update status");
      }
    } catch (e) {
      toast.error("An error occurred");
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm("Are you sure you want to delete this account?")) return;
    try {
      const res = await fetch(`/api/finance/accounting/accounts/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        toast.success("Account deleted");
        fetchData();
      } else {
        toast.error(data.error || "Failed to delete account");
      }
    } catch (e) {
      toast.error("An error occurred");
    }
  };

  const handleExport = async (mode: "all" | "view") => {
    try {
      const res = await fetch("/api/finance/accounting/accounts/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view: mode === "view" ? view : "all", format: "csv" })
      });
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chart_of_accounts_${mode}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setIsExportOpen(false);
    } catch (e) {
      toast.error("Export failed");
    }
  };

  const handleImportParse = async () => {
    if (!importFile) return toast.error("Select a file first");
    const formData = new FormData();
    formData.append("file", importFile);
    try {
      setLoading(true);
      const res = await fetch("/api/finance/accounting/accounts/import/parse", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setImportColumns(data.columns);
        setImportPreview(data.preview);
        setImportStep(2);
      } else {
        toast.error(data.error || "Parse failed");
      }
    } catch (e) {
      toast.error("Parse failed");
    } finally {
      setLoading(false);
    }
  };

  const handleImportExecute = async () => {
    if (!importFile) return;
    const formData = new FormData();
    formData.append("file", importFile);
    formData.append("mapping", JSON.stringify(importMapping));
    formData.append("duplicateHandling", importConfig.duplicateHandling);
    try {
      setLoading(true);
      const res = await fetch("/api/finance/accounting/accounts/import/execute", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult(data);
        setImportStep(4); // Success step
        fetchData();
      } else {
        toast.error(data.error || "Import failed");
      }
    } catch (e) {
      toast.error("Import failed");
    } finally {
      setLoading(false);
    }
  };

  const TOP_LEVEL_MAP: Record<string, string> = {
    "Other Asset": "Asset",
    "Deferred Tax Asset": "Asset",
    "Non Current Asset": "Asset",
    "Intangible Asset": "Asset",
    "Payment Clearing Account": "Asset",
    "Other Current Asset": "Asset",
    "Cash": "Asset",
    "Bank": "Asset",
    "Accounts Receivable": "Asset",
    "Fixed Asset": "Asset",
    "Stock": "Asset",
    "Deferred Tax Liability": "Liability",
    "Overseas Tax Payable": "Liability",
    "Other Current Liability": "Liability",
    "Credit Card": "Liability",
    "Other Liability": "Liability",
    "Accounts Payable": "Liability",
    "Equity": "Equity",
    "Income": "Income",
    "Other Income": "Income",
    "Expense": "Expense",
    "Cost Of Goods Sold": "Expense",
    "Other Expense": "Expense",
  };

  const groupedTypes = accountTypes.reduce((acc, curr) => {
    const mainCategory = TOP_LEVEL_MAP[curr.name] || curr.segment || "Other";
    if (!acc[mainCategory]) acc[mainCategory] = [];
    acc[mainCategory].push(curr);
    return acc;
  }, {});

  const [sortOrder, setSortOrder] = useState<"name_asc" | "code_asc" | "code_desc">("code_asc");

  const filteredAccounts = accounts
    .filter(a => {
      const matchesSearch = (a.accountName && a.accountName.toLowerCase().includes(search.toLowerCase())) || 
                            (a.accountCode && a.accountCode.toLowerCase().includes(search.toLowerCase()));
      let matchesView = true;
      if (["asset", "liability", "equity", "income", "expense"].includes(view)) {
         const cat = TOP_LEVEL_MAP[a.accountType?.name] || a.accountType?.segment || "Other";
         if (cat.toLowerCase() !== view) matchesView = false;
      }
      return matchesSearch && matchesView;
    })
    .sort((a, b) => {
      if (sortOrder === "name_asc") return (a.accountName || "").localeCompare(b.accountName || "");
      if (sortOrder === "code_asc") return (a.accountCode || "").localeCompare(b.accountCode || "");
      if (sortOrder === "code_desc") return (b.accountCode || "").localeCompare(a.accountCode || "");
      return 0;
    });

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Chart of Accounts"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Accounting" },
        { label: "Chart of Accounts" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Top Nav */}
        <AccountingSubNav />

      {activeTab === "Chart of Accounts" ? (
        <>
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="text-2xl font-bold p-0 hover:bg-transparent flex items-center gap-2 text-foreground h-auto rounded-none">
                    {view.charAt(0).toUpperCase() + view.slice(1)} Accounts
                    <span className="text-primary text-xl leading-none font-black ml-1 mt-0.5">▾</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 mt-2 shadow-lg border">
                  {[
                    "All", "Active", "Inactive", "Asset", "Liability", "Equity", "Income", "Expense"
                  ].map(v => (
                    <DropdownMenuItem key={v} onClick={() => setView(v.toLowerCase())} className="flex justify-between items-center py-2 cursor-pointer text-foreground">
                      {v} Accounts
                      <Star className="h-4 w-4 text-muted-foreground opacity-50" />
                    </DropdownMenuItem>
                  ))}
                  <div className="h-px bg-border my-1"></div>
                  <DropdownMenuItem className="py-2 text-primary font-medium cursor-pointer">
                    <Plus className="h-4 w-4 mr-2" /> New View
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            <div className="flex items-center space-x-2">
              <Link href="/finance/accounting/chart-of-accounts/account-types">
                <Button variant="outline">Manage Account Types</Button>
              </Link>
              <Button variant="outline" onClick={() => setIsAccountantsOpen(true)}>
                <Users className="h-4 w-4 mr-2" />
                Find Accountants
              </Button>
              <Button onClick={() => setIsAccountModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="px-2"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSortOrder(sortOrder === "code_asc" ? "code_desc" : "code_asc")}>
                    <ArrowUpDown className="h-4 w-4 mr-2" /> Sort by Account Code
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setIsImportOpen(true); setImportStep(1); setImportFile(null); setImportResult(null); }}>
                    <Upload className="h-4 w-4 mr-2" /> Import Chart of Accounts
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setExportMode("all"); setIsExportOpen(true); }}>
                    <Download className="h-4 w-4 mr-2" /> Export Chart of Accounts
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setExportMode("view"); setIsExportOpen(true); }}>
                    <Download className="h-4 w-4 mr-2" /> Export Current View
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border shadow-sm overflow-hidden">
            <div className="p-2 border-b flex items-center bg-white dark:bg-gray-800">
              <Search className="h-4 w-4 text-gray-400 mx-2" />
              <Input 
                className="border-0 focus-visible:ring-0 shadow-none bg-transparent text-gray-900 dark:text-gray-100 placeholder:text-gray-400" 
                placeholder="Search accounts..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">
                    <Checkbox />
                  </TableHead>
                  <TableHead>ACCOUNT NAME</TableHead>
                  <TableHead className="cursor-pointer select-none group" onClick={() => setSortOrder(sortOrder === "code_asc" ? "code_desc" : "code_asc")}>
                    ACCOUNT CODE
                    <ArrowUpDown className="h-3 w-3 inline-block ml-1 text-gray-400 group-hover:text-blue-500 transition-colors" />
                  </TableHead>
                  <TableHead>ACCOUNT TYPE</TableHead>
                  <TableHead>DOCUMENTS</TableHead>
                  <TableHead>PARENT ACCOUNT NAME</TableHead>
                  <TableHead className="w-12 text-center"><Search className="h-4 w-4 text-gray-400 inline-block" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : filteredAccounts.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">No accounts found</TableCell></TableRow>
                ) : (
                  filteredAccounts.map(a => (
                    <TableRow key={a._id}>
                      <TableCell className="text-center">
                        {a.isLocked ? <Lock className="h-4 w-4 text-gray-400 mx-auto" /> : <Checkbox />}
                      </TableCell>
                      <TableCell className="font-medium text-blue-600 dark:text-blue-400 cursor-pointer">{a.accountName}</TableCell>
                      <TableCell>{a.accountCode || "-"}</TableCell>
                      <TableCell>{a.accountType?.name || "-"}</TableCell>
                      <TableCell></TableCell>
                      <TableCell>{a.parentAccountId?.accountName || "-"}</TableCell>
                      <TableCell className="text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600">
                              <SettingsIcon className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 shadow-lg border">
                            <DropdownMenuItem onClick={() => handleEditClick(a)} className="cursor-pointer text-gray-700 py-2">
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleActive(a._id, !a.isActive)} className="cursor-pointer text-gray-700 py-2">
                              {a.isActive === false ? "Mark as Active" : "Mark as Inactive"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteAccount(a._id)} className="cursor-pointer text-red-600 py-2">
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      ) : activeTab === "Journals" ? (
        <JournalForm accounts={accounts} />
      ) : (
        <div className="py-20 text-center text-gray-500 bg-white rounded-lg border shadow-sm">
          Content for {activeTab} is not yet implemented.
        </div>
      )}

      {/* Find Accountants Panel */}
      <Sheet open={isAccountantsOpen} onOpenChange={setIsAccountantsOpen}>
        <SheetContent side="right" className="w-[400px] sm:w-[540px] overflow-y-auto">
          {selectedAccountant ? (
            <div>
              <Button variant="ghost" onClick={() => setSelectedAccountant(null)} className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <h2 className="text-2xl font-bold">{selectedAccountant.name}</h2>
              <p className="text-lg text-gray-600">{selectedAccountant.firmName}</p>
              <div className="mt-6 space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900">Location</h4>
                  <p>{selectedAccountant.state}, {selectedAccountant.country}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">Contact</h4>
                  <p>{selectedAccountant.email}</p>
                  <p>{selectedAccountant.phone}</p>
                </div>
                {selectedAccountant.description && (
                  <div>
                    <h4 className="font-semibold text-gray-900">Description</h4>
                    <p className="text-sm">{selectedAccountant.description}</p>
                  </div>
                )}
                {selectedAccountant.servicesOffered?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-900">Services Offered</h4>
                    <ul className="list-disc pl-5 text-sm">
                      {selectedAccountant.servicesOffered.map((s: string) => <li key={s}>{s}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <SheetHeader>
                <SheetTitle>Find Accountants</SheetTitle>
              </SheetHeader>
              <p className="text-sm text-gray-500 mt-2 mb-6">Connect with an accountant in your area to manage your business finances with ease.</p>
              <div className="space-y-4">
                {accountants.map(acc => (
                  <div key={acc._id} className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50" onClick={() => setSelectedAccountant(acc)}>
                    <h3 className="font-semibold text-lg">{acc.name}</h3>
                    <p className="text-sm font-medium">{acc.firmName}</p>
                    <p className="text-xs text-gray-500 mt-1">{acc.state}, {acc.country}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* New Account Modal */}
      <Dialog open={isAccountModalOpen} onOpenChange={(val) => { setIsAccountModalOpen(val); if (!val) { setEditAccountId(null); setFormData({ accountName: "", accountCode: "", accountType: "", description: "", watchlist: false }); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editAccountId ? "Edit Account" : "Create Account"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Account Type*</label>
              <Select value={formData.accountType} onValueChange={(v) => setFormData({...formData, accountType: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(groupedTypes).map(segment => (
                    <SelectGroup key={segment}>
                      <SelectLabel>{segment}</SelectLabel>
                      {groupedTypes[segment].map((t: any) => (
                        <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Account Name*</label>
              <Input value={formData.accountName} onChange={(e) => setFormData({...formData, accountName: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Account Code</label>
              <Input value={formData.accountCode} onChange={(e) => setFormData({...formData, accountCode: e.target.value})} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Max. 500 characters" maxLength={500} />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="watchlist" checked={formData.watchlist} onCheckedChange={(c) => setFormData({...formData, watchlist: !!c})} />
              <label htmlFor="watchlist" className="text-sm font-medium">Add to the watchlist on my dashboard</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAccountModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateAccount} disabled={!formData.accountName || !formData.accountType}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="sm:max-w-[700px] p-0">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <DialogTitle className="text-xl font-semibold mx-auto">Accounts - {importStep === 1 ? 'Select File' : importStep === 2 ? 'Map Fields' : 'Preview'}</DialogTitle>
          </div>
          
          <div className="flex items-center justify-center space-x-4 py-4 bg-gray-50/50">
            <div className="flex items-center">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${importStep >= 1 ? 'bg-blue-500 text-white' : 'border-2 text-gray-400'}`}>1</div>
              <span className={`ml-2 text-sm font-semibold ${importStep >= 1 ? 'text-gray-900' : 'text-gray-400'}`}>Configure</span>
            </div>
            <div className="h-px w-16 bg-gray-300"></div>
            <div className="flex items-center">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${importStep >= 2 ? 'bg-blue-500 text-white' : 'border-2 text-gray-400'}`}>2</div>
              <span className={`ml-2 text-sm font-semibold ${importStep >= 2 ? 'text-gray-900' : 'text-gray-400'}`}>Map Fields</span>
            </div>
            <div className="h-px w-16 bg-gray-300"></div>
            <div className="flex items-center">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${importStep >= 3 ? 'bg-blue-500 text-white' : 'border-2 text-gray-400'}`}>3</div>
              <span className={`ml-2 text-sm font-semibold ${importStep >= 3 ? 'text-gray-900' : 'text-gray-400'}`}>Preview</span>
            </div>
          </div>
          
          {importStep === 1 && (
            <div className="space-y-6 px-10 py-6">
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center bg-gray-50/30">
                <div className="mx-auto h-12 w-12 bg-white rounded-full flex items-center justify-center shadow-sm border mb-4">
                  <Upload className="h-5 w-5 text-gray-400" />
                </div>
                <h3 className="font-semibold text-gray-800 mb-4">Drag and drop file to import</h3>
                <input type="file" id="import-file" accept=".csv,.tsv,.xls,.xlsx" className="hidden" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
                <button type="button" onClick={() => document.getElementById('import-file')?.click()} className="cursor-pointer bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors">
                  {importFile ? importFile.name : "Choose File ▾"}
                </button>
                <p className="text-xs text-gray-400 mt-4">Maximum File Size: 25 MB • File Format: CSV or TSV or XLS</p>
              </div>

              <p className="text-sm text-gray-500">
                Download a <a href="#" className="text-blue-600 hover:underline">sample file</a> and compare it to your import file to ensure you have the file perfect for the import.
              </p>

              <div className="grid grid-cols-[200px_1fr] gap-4 items-start">
                <label className="text-sm font-medium text-red-500 pt-1">Duplicate Handling: * <span className="text-gray-400 font-normal">ⓘ</span></label>
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <input type="radio" id="dup-skip" name="duplicateHandling" checked={importConfig.duplicateHandling === "skip"} onChange={() => setImportConfig({...importConfig, duplicateHandling: "skip"})} className="mt-1 text-blue-600 focus:ring-blue-500" />
                    <label htmlFor="dup-skip" className="text-sm">
                      <span className="font-medium text-gray-800 block mb-1">Skip Duplicates</span>
                      <span className="text-gray-500 leading-relaxed">Retains the accounts in Aupulens ERP and does not import the duplicates in the import file.</span>
                    </label>
                  </div>
                  <div className="flex items-start space-x-3">
                    <input type="radio" id="dup-overwrite" name="duplicateHandling" checked={importConfig.duplicateHandling === "overwrite"} onChange={() => setImportConfig({...importConfig, duplicateHandling: "overwrite"})} className="mt-1 text-blue-600 focus:ring-blue-500" />
                    <label htmlFor="dup-overwrite" className="text-sm">
                      <span className="font-medium text-gray-800 block mb-1">Overwrite accounts</span>
                      <span className="text-gray-500 leading-relaxed">Imports the duplicates in the import file and overwrites the existing accounts in Aupulens ERP.</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[200px_1fr] gap-4 items-center">
                <label className="text-sm font-medium text-gray-700">Character Encoding <span className="text-gray-400 font-normal">ⓘ</span></label>
                <Select defaultValue="utf8">
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="UTF-8 (Unicode)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utf8">UTF-8 (Unicode)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-[#fffdf2] border border-[#f5e8b5] p-3 rounded-md flex items-center text-sm font-semibold text-gray-800">
                <Lightbulb className="h-4 w-4 text-yellow-500 mr-2" /> Page Tips
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <Button className="bg-blue-500 hover:bg-blue-600 text-white px-6" onClick={handleImportParse} disabled={!importFile || loading}>
                  {loading ? "Parsing..." : "Next >"}
                </Button>
                <Button variant="outline" className="bg-gray-50" onClick={() => setIsImportOpen(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {importStep === 2 && (
            <div className="space-y-4 px-10 py-6">
              <h3 className="font-medium">Map Fields</h3>
              <p className="text-sm text-gray-500">Map your file columns to Aupulens fields.</p>
              <div className="space-y-3">
                {[
                  { id: "accountName", label: "Account Name*" },
                  { id: "accountCode", label: "Account Code" },
                  { id: "accountType", label: "Account Type*" },
                  { id: "description", label: "Description" }
                ].map(field => (
                  <div key={field.id} className="grid grid-cols-2 gap-4 items-center">
                    <label className="text-sm font-medium">{field.label}</label>
                    <Select value={(importMapping as any)[field.id]} onValueChange={(v) => setImportMapping({...importMapping, [field.id]: v})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {importColumns.map(col => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-4 border-t">
                <Button className="bg-blue-500 hover:bg-blue-600 text-white px-6" onClick={() => setImportStep(3)} disabled={!importMapping.accountName || !importMapping.accountType}>Next &gt;</Button>
                <Button variant="outline" className="bg-gray-50" onClick={() => setImportStep(1)}>Back</Button>
              </div>
            </div>
          )}

          {importStep === 3 && (
            <div className="space-y-4 px-10 py-6">
              <h3 className="font-medium">Preview</h3>
              <p className="text-sm text-gray-500">Previewing first 5 rows to be imported.</p>
              <div className="overflow-x-auto border rounded-lg text-sm">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-2">Account Name</th>
                      <th className="p-2">Account Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.map((row, i) => (
                      <tr key={i} className="border-b">
                        <td className="p-2">{row[importColumns.indexOf(importMapping.accountName)] || "-"}</td>
                        <td className="p-2">{row[importColumns.indexOf(importMapping.accountType)] || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center pt-4 border-t">
                <Button className="bg-blue-500 hover:bg-blue-600 text-white px-6" onClick={handleImportExecute} disabled={loading}>{loading ? "Importing..." : "Import"}</Button>
                <Button variant="outline" className="bg-gray-50" onClick={() => setImportStep(2)}>Back</Button>
              </div>
            </div>
          )}

          {importStep === 4 && importResult && (
            <div className="space-y-4 py-4 text-center">
              <div className="bg-green-100 text-green-800 p-4 rounded-lg inline-block mx-auto mb-2">
                Import Complete
              </div>
              <p className="text-gray-700">Successfully imported {importResult.imported} accounts.</p>
              <p className="text-gray-500 text-sm">Skipped: {importResult.skipped} | Overwritten: {importResult.overwritten}</p>
              {importResult.errors?.length > 0 && (
                <div className="mt-4 text-left bg-red-50 p-2 rounded text-red-800 text-xs h-32 overflow-y-auto">
                  {importResult.errors.map((e: string, i: number) => <div key={i}>{e}</div>)}
                </div>
              )}
              <DialogFooter className="mt-4">
                <Button onClick={() => setIsImportOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Export Modal */}
      <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>{exportMode === "all" ? "Export Chart of Accounts" : "Export Current View"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="bg-blue-50/50 text-blue-700 p-3 rounded-md text-sm flex items-start border border-blue-100">
              <span className="mr-2 text-blue-600 font-bold">i</span> 
              {exportMode === "all" 
                ? "You can export your data from Aupulens ERP in CSV, XLS or XLSX format." 
                : "Only the current view with its visible columns will be exported from Aupulens ERP in CSV or XLS format."
              }
            </div>

            {exportMode === "all" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Export Template <span className="text-gray-400 cursor-pointer">ⓘ</span></label>
                <Select defaultValue="default">
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select an Export Template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Select an Export Template</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-red-500">Decimal Format*</label>
              <Select defaultValue="1">
                <SelectTrigger className="w-[60%]">
                  <SelectValue placeholder="1234567.89" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1234567.89</SelectItem>
                  <SelectItem value="2">1,234,567.89</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-red-500">Export File Format*</label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input type="radio" name="exportFormat" id="fmt-csv" checked={exportFormat === "csv"} onChange={() => setExportFormat("csv")} className="text-blue-600 focus:ring-blue-500" />
                  <label htmlFor="fmt-csv" className="text-sm text-gray-700">CSV (Comma Separated Value)</label>
                </div>
                <div className="flex items-center space-x-2">
                  <input type="radio" name="exportFormat" id="fmt-xls" checked={exportFormat === "xls"} onChange={() => setExportFormat("xls")} className="text-blue-600 focus:ring-blue-500" />
                  <label htmlFor="fmt-xls" className="text-sm text-gray-700">XLS (Microsoft Excel 1997-2004 Compatible)</label>
                </div>
                {exportMode === "all" && (
                  <div className="flex items-center space-x-2">
                    <input type="radio" name="exportFormat" id="fmt-xlsx" checked={exportFormat === "xlsx"} onChange={() => setExportFormat("xlsx")} className="text-blue-600 focus:ring-blue-500" />
                    <label htmlFor="fmt-xlsx" className="text-sm text-gray-700">XLSX (Microsoft Excel)</label>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">File Protection Password</label>
              <div className="relative w-full">
                <Input type="password" />
                <Eye className="absolute right-3 top-2.5 h-4 w-4 text-gray-400 cursor-pointer" />
              </div>
              <p className="text-xs text-gray-400 leading-relaxed pt-1">
                Your password must be at least 12 characters and include one uppercase letter, lowercase letter, number, and special character.
              </p>
            </div>

            <div className="text-[13px] text-gray-500 leading-relaxed">
              <strong className="text-gray-700">Note:</strong> You can export only the first {exportMode === "all" ? "25,000" : "10,000"} rows. If you have more rows, please initiate a backup for the data in your Aupulens ERP organization, and download it. <a href="#" className="text-blue-600 hover:underline">Backup Your Data</a>
            </div>
          </div>
          
          <DialogFooter className="sm:justify-start gap-2">
            <Button className="bg-blue-500 hover:bg-blue-600 text-white" onClick={() => handleExport(exportMode)}>Export</Button>
            <Button variant="outline" onClick={() => setIsExportOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
    </DashboardLayout>
  );
}
