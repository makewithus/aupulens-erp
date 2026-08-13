"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
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
import { signOut, useSession } from "next-auth/react";
import { Lightbulb } from "lucide-react";
import { DateField } from "@/components/finance/accounting/DateField";
import { useAccountingCurrencyStore } from "@/store/useAccountingCurrencyStore";
import { AccountPicker } from "@/components/finance/accounting/AccountPicker";
import { StatCard } from "@/components/admin/StatCard";
import { UsersGraph } from "@/components/admin/graphics/UsersGraph";
import { ActivePulse } from "@/components/admin/graphics/ActivePulse";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
    cachedFetch("/api/sales/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d.items || []))
      .catch(() => {});
    cachedFetch("/api/finance/accounting/journal-templates")
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
      const res = await cachedFetch("/api/finance/journal-entries", {
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
    <Card className="overflow-hidden border border-border/40 bg-background rounded-none shadow-none max-w-6xl mx-auto">
      <div className="border-b border-border/20 px-8 py-6 flex justify-between items-center bg-white/[0.01]">
        <h2 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">New Journal Entry</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="link" className="text-primary hover:underline text-sm font-medium px-0 font-mono uppercase tracking-wider">Choose Template ▾</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-none border-border/30">
            {templates.map((t) => (
              <DropdownMenuItem key={t._id} onClick={() => applyTemplate(t)} className="cursor-pointer rounded-none">
                {t.templateName}
              </DropdownMenuItem>
            ))}
            {templates.length > 0 && <div className="h-px bg-border my-1" />}
            <DropdownMenuItem onClick={() => router.push("/finance/accounting/journals/templates/new")} className="cursor-pointer text-primary rounded-none">
              + New Template
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CardContent className="p-8 space-y-6">
        <div className="grid grid-cols-[200px_1fr] gap-y-6 items-start max-w-3xl">
          <label className="text-xs font-bold uppercase tracking-wider text-red-500 pt-2 font-mono">Date *</label>
          <DateField value={date} onChange={setDate} className="max-w-[300px] rounded-none" />

          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/75 pt-2 font-mono">Reverse Date</label>
          <div className="space-y-3">
            <DateField value={reverseJournalDate} onChange={setReverseJournalDate} className="max-w-[300px] rounded-none" />
            <div className="flex items-center space-x-2">
              <Checkbox id="publish_reverse" checked={publishReverseOnDate} onCheckedChange={(c) => setPublishReverseOnDate(!!c)} className="rounded-none" />
              <label htmlFor="publish_reverse" className="text-xs text-muted-foreground/80 font-medium">Publish reverse journal only on the reverse journal date ⓘ</label>
            </div>
          </div>

          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/75 pt-2 font-mono">Journal #</label>
          <div className="flex items-center max-w-[300px]">
            <Input value={journalNumber} onChange={(e) => setJournalNumber(e.target.value)} placeholder="Auto-generated" className="rounded-none focus-visible:ring-0 border-r-0" />
            <Button variant="outline" className="rounded-none border-l-0 px-3 text-primary hover:bg-transparent" type="button"><SettingsIcon className="h-4 w-4" /></Button>
          </div>

          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/75 pt-2 font-mono">Reference #</label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} className="max-w-[300px] rounded-none" />

          <label className="text-xs font-bold uppercase tracking-wider text-red-500 pt-2 font-mono">Notes *</label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Max. 500 characters" maxLength={500} className="max-w-[400px] h-24 resize-none rounded-none" />

          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/75 pt-2 font-mono">Reporting Method</label>
          <div className="flex items-center space-x-6 pt-2">
            {REPORTING_METHODS.map((m) => (
              <label key={m.value} className="flex items-center space-x-2 text-xs font-medium cursor-pointer text-foreground/80">
                <input type="radio" name="reporting" className="accent-primary h-4 w-4" checked={reportingMethod === m.value} onChange={() => setReportingMethod(m.value)} />
                <span>{m.label}</span>
              </label>
            ))}
          </div>

          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/75 pt-2 font-mono">Currency</label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="max-w-[300px] rounded-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              {enabledCurrencies.map((c) => (
                <SelectItem key={c.code} value={c.code} className="rounded-none">
                  {c.code} - {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-12">
          <div className="border border-border/40 rounded-none overflow-hidden">
            <Table className="w-full text-sm">
              <TableHeader className="border-b border-border/30 bg-muted/40">
                <TableRow>
                  <TableHead className="py-4 px-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60 w-8"></TableHead>
                  <TableHead className="py-4 px-4 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60 w-[25%] border-r border-border/10">ACCOUNT</TableHead>
                  <TableHead className="py-4 px-4 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60 w-[25%] border-r border-border/10">DESCRIPTION</TableHead>
                  <TableHead className="py-4 px-4 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60 w-[20%] border-r border-border/10">CONTACT ({currency})</TableHead>
                  <TableHead className="py-4 px-4 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60 border-r border-border/10">DEBITS</TableHead>
                  <TableHead className="py-4 px-4 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">CREDITS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/20">
                {rows.map((row) => (
                  <TableRow key={row.id} className="group bg-card hover:bg-white/[0.01] transition-colors">
                    <TableCell className="p-2 text-center text-muted-foreground/50 hover:text-red-500 cursor-pointer font-bold" onClick={() => removeRow(row.id)}>✕</TableCell>
                    <TableCell className="p-0 border-r border-border/10">
                      <AccountPicker
                        accounts={accounts}
                        value={row.accountId}
                        onChange={(v) => updateRow(row.id, { accountId: v })}
                        placeholder="Select an account"
                        className="border-0 shadow-none h-10 w-full rounded-none px-3 bg-transparent text-sm focus:ring-0"
                      />
                    </TableCell>
                    <TableCell className="p-0 border-r border-border/10">
                      <Input
                        value={row.description}
                        onChange={(e) => updateRow(row.id, { description: e.target.value })}
                        placeholder="Description"
                        className="border-0 shadow-none focus-visible:ring-0 rounded-none h-10 px-3 bg-transparent text-sm"
                      />
                    </TableCell>
                    <TableCell className="p-0 border-r border-border/10">
                      <Select value={row.contactId || "none"} onValueChange={(v) => updateRow(row.id, { contactId: v === "none" ? "" : v })}>
                        <SelectTrigger className="border-0 shadow-none focus:ring-0 rounded-none h-10 px-3 bg-transparent text-sm"><SelectValue placeholder="Select Contact" /></SelectTrigger>
                        <SelectContent className="rounded-none">
                          <SelectItem value="none" className="rounded-none">None</SelectItem>
                          {customers.map((c) => (
                            <SelectItem key={c._id} value={c._id} className="rounded-none">{c.header?.name || c.name || "Unnamed"}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="p-0 border-r border-border/10">
                      <Input
                        type="number"
                        value={row.debit}
                        onChange={(e) => updateRow(row.id, { debit: e.target.value, credit: e.target.value ? "" : row.credit })}
                        placeholder="0.00"
                        className="border-0 shadow-none focus-visible:ring-0 rounded-none h-10 text-right px-3 bg-transparent placeholder:text-muted-foreground/30 font-mono text-sm"
                      />
                    </TableCell>
                    <TableCell className="p-0">
                      <Input
                        type="number"
                        value={row.credit}
                        onChange={(e) => updateRow(row.id, { credit: e.target.value, debit: e.target.value ? "" : row.debit })}
                        placeholder="0.00"
                        className="border-0 shadow-none focus-visible:ring-0 rounded-none h-10 text-right px-3 bg-transparent placeholder:text-muted-foreground/30 font-mono text-sm"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-6 flex flex-col md:flex-row justify-between items-start gap-6">
            <Button variant="ghost" className="text-primary hover:text-primary hover:bg-primary/10 font-mono text-xs uppercase tracking-wider px-3 rounded-none" onClick={addRow} type="button">
              <Plus className="h-4 w-4 mr-2" /> Add New Row
            </Button>

            <div className="w-full md:w-[450px] bg-white/[0.01] border border-border/30 rounded-none p-6 space-y-4">
              <div className="flex justify-between text-xs font-mono uppercase tracking-wider text-muted-foreground items-center">
                <span>Sub Total</span>
                <div className="flex space-x-12 font-semibold text-foreground"><span className="w-20 text-right">{subTotalDebit.toFixed(2)}</span><span className="w-20 text-right">{subTotalCredit.toFixed(2)}</span></div>
              </div>
              <div className="flex justify-between text-sm font-mono uppercase tracking-wider text-foreground items-center border-t border-border/20 pt-4">
                <span className="font-bold">Total ({currency})</span>
                <div className="flex space-x-12 font-black text-foreground"><span className="w-20 text-right">{subTotalDebit.toFixed(2)}</span><span className="w-20 text-right">{subTotalCredit.toFixed(2)}</span></div>
              </div>
              <div className="flex justify-between text-xs font-mono uppercase tracking-wider items-center border-t border-border/20 pt-4" style={{ color: difference === 0 ? undefined : "#ef4444" }}>
                <span>Difference</span>
                <span className="font-semibold pr-2">{difference.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>

      <div className="fixed bottom-0 left-0 right-0 sm:right-(--ai-sidebar-w,0px) transition-[right] duration-200 bg-background border-t p-4 flex items-center justify-end gap-3 z-50">
        <Button variant="outline" className="font-mono text-xs uppercase tracking-wider px-6 rounded-none bg-background cursor-pointer" onClick={() => handleSave("draft")} disabled={!!saving}>
          {saving === "draft" ? "Saving..." : "Save as Draft"}
        </Button>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-mono text-xs uppercase tracking-wider px-6 rounded-none cursor-pointer" onClick={() => handleSave("posted")} disabled={!!saving}>
          {saving === "posted" ? "Publishing..." : "Save and Publish"}
        </Button>
        <Button variant="outline" className="font-mono text-xs uppercase tracking-wider px-6 rounded-none cursor-pointer" onClick={resetForm} disabled={!!saving} type="button">Cancel</Button>
      </div>
    </Card>
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
        cachedFetch(`/api/finance/accounting/accounts?view=${view}`),
        cachedFetch("/api/finance/accounting/account-types")
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
      const res = await cachedFetch("/api/finance/accounting/accountants");
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

      const res = await cachedFetch(url, {
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

  // AI-native: extract a new ledger account's details → open the create modal
  // pre-filled. The account type is resolved to a real id server-side when it
  // was named; the user reviews and clicks Create.
  useAiPrefill("finance_account", (p) => {
    const d = p.data || {};
    setEditAccountId(null);
    setFormData({
      accountName: d.accountName || "",
      accountCode: d.accountCode ? String(d.accountCode) : "",
      accountType: d.accountType || "",
      description: d.description || "",
      watchlist: !!d.watchlist,
    });
    setIsAccountModalOpen(true);
  });

  const handleToggleActive = async (id: string, newActiveState: boolean) => {
    try {
      const res = await cachedFetch(`/api/finance/accounting/accounts/${id}`, {
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
      const res = await cachedFetch(`/api/finance/accounting/accounts/${id}`, { method: "DELETE" });
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
      const res = await cachedFetch("/api/finance/accounting/accounts/export", {
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
      const res = await cachedFetch("/api/finance/accounting/accounts/import/parse", {
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
      const res = await cachedFetch("/api/finance/accounting/accounts/import/execute", {
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

  // Calculate totals for Stats grid
  const kpis = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter(a => a.isActive !== false).length;
    const asset = accounts.filter(a => TOP_LEVEL_MAP[a.accountType?.name] === "Asset").length;
    const liability = accounts.filter(a => TOP_LEVEL_MAP[a.accountType?.name] === "Liability").length;
    return { total, active, asset, liability };
  }, [accounts]);

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
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/finance" })}
      onRefresh={fetchData}
      profilePath="/finance/profile"
    >
      <div className="space-y-6">
        {/* Top Nav Tabs */}
        <AccountingSubNav />

        {/* Header Toolbar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Chart of Accounts
            </h1>
          </div>
          
          <div className="flex items-center gap-2">
            <Link href="/finance/accounting/chart-of-accounts/account-types">
              <Button variant="outline" className="h-12 px-6 rounded-none border border-border/45 font-mono text-[13px] uppercase tracking-wider hover:bg-white/5 cursor-pointer text-foreground/95">Account Types</Button>
            </Link>
            <Button variant="outline" onClick={() => setIsAccountantsOpen(true)} className="h-12 px-6 rounded-none border border-border/45 font-mono text-[13px] uppercase tracking-wider hover:bg-white/5 cursor-pointer text-foreground/95">
              <Users className="h-4 w-4 mr-2 text-muted-foreground/70" />
              Find Accountants
            </Button>
            <Button
              onClick={() => setIsAccountModalOpen(true)}
              className="none-xl h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[13px] uppercase tracking-wider rounded-none cursor-pointer"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Account
            </Button>
          </div>
        </div>

        {activeTab === "Chart of Accounts" ? (
          <>
            {/* Stats Cards banner */}
            <div className="space-y-1">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
                <StatCard title="Total Accounts" value={kpis.total} visual={<UsersGraph />} />
                <StatCard title="Active Accounts" value={kpis.active} visual={<ActivePulse />} />
                <StatCard title="Asset Accounts" value={kpis.asset} visual={<UsersGraph />} />
                <StatCard title="Liability Accounts" value={kpis.liability} visual={<ActivePulse />} />
              </div>

              {/* Main Card grid */}
              <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
                {/* Card Header & Controls Toolbar */}
                <div className="border-b border-border/20 px-8 py-6">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="text-[30px] font-medium tracking-[-0.05em] p-0 hover:bg-transparent flex items-center gap-2 text-foreground h-auto rounded-none">
                            {view.charAt(0).toUpperCase() + view.slice(1)} Accounts
                            <span className="text-primary text-xl font-black mt-1">▾</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56 mt-2 rounded-none border border-border/30">
                          {[
                            "All", "Active", "Inactive", "Asset", "Liability", "Equity", "Income", "Expense"
                          ].map(v => (
                            <DropdownMenuItem key={v} onClick={() => setView(v.toLowerCase())} className="flex justify-between items-center py-2 cursor-pointer text-foreground rounded-none">
                              {v} Accounts
                              <Star className="h-4 w-4 text-muted-foreground opacity-50" />
                            </DropdownMenuItem>
                          ))}
                          <div className="h-px bg-border my-1"></div>
                          <DropdownMenuItem className="py-2 text-primary font-medium cursor-pointer rounded-none">
                            <Plus className="h-4 w-4 mr-2" /> New View
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                        {filteredAccounts.length} {filteredAccounts.length === 1 ? "Account" : "Accounts"}
                      </p>
                    </div>

                    {/* Toolbar Controls */}
                    <div className="w-full max-w-3xl flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-end">
                      {/* Search Input */}
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/35 transition-colors" />
                        <Input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search accounts..."
                          className="h-11 rounded-none border-border/40 bg-transparent pl-11 pr-4 text-[14px] tracking-tight shadow-none transition-all duration-300 placeholder:text-muted-foreground/60 hover:border-border/40 focus-visible:border-primary/40 focus-visible:bg-white/[0.015] focus-visible:ring-0 w-full text-foreground"
                        />
                      </div>

                      {/* Settings Utilities Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="h-11 px-3 rounded-none border border-border/40 hover:bg-white/5 cursor-pointer text-foreground">
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground/75" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-none border border-border/30">
                          <DropdownMenuItem onClick={() => setSortOrder(sortOrder === "code_asc" ? "code_desc" : "code_asc")} className="rounded-none py-2 cursor-pointer">
                            <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" /> Sort by Account Code
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setIsImportOpen(true); setImportStep(1); setImportFile(null); setImportResult(null); }} className="rounded-none py-2 cursor-pointer">
                            <Upload className="h-4 w-4 mr-2 text-muted-foreground" /> Import Chart of Accounts
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setExportMode("all"); setIsExportOpen(true); }} className="rounded-none py-2 cursor-pointer">
                            <Download className="h-4 w-4 mr-2 text-muted-foreground" /> Export Chart of Accounts
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setExportMode("view"); setIsExportOpen(true); }} className="rounded-none py-2 cursor-pointer">
                            <Download className="h-4 w-4 mr-2 text-muted-foreground" /> Export Current View
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>

                {/* Table Content */}
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="border-border/40">
                      <TableRow>
                        <TableHead className="w-12 text-center py-5">
                          <Checkbox className="rounded-none" />
                        </TableHead>
                        <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">ACCOUNT NAME</TableHead>
                        <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 cursor-pointer select-none group" onClick={() => setSortOrder(sortOrder === "code_asc" ? "code_desc" : "code_asc")}>
                          ACCOUNT CODE
                          <ArrowUpDown className="h-3 w-3 inline-block ml-1 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                        </TableHead>
                        <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">ACCOUNT TYPE</TableHead>
                        <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">PARENT ACCOUNT</TableHead>
                        <TableHead className="px-8 py-5 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">ACTIONS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-border/30">
                      {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-center py-7"><Skeleton className="h-4 w-4 mx-auto rounded-none" /></TableCell>
                            <TableCell className="px-8 py-7"><Skeleton className="h-5 w-44 rounded-none" /></TableCell>
                            <TableCell className="px-8 py-7"><Skeleton className="h-4 w-16 rounded-none" /></TableCell>
                            <TableCell className="px-8 py-7"><Skeleton className="h-4 w-28 rounded-none" /></TableCell>
                            <TableCell className="px-8 py-7"><Skeleton className="h-4 w-24 rounded-none" /></TableCell>
                            <TableCell className="px-8 py-7 text-right"><Skeleton className="h-8 w-8 ml-auto rounded-none" /></TableCell>
                          </TableRow>
                        ))
                      ) : filteredAccounts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-24 text-center">
                            <Star className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />
                            <h3 className="text-lg font-medium text-foreground">No accounts found</h3>
                            <p className="mt-2 text-sm text-muted-foreground">Try adjusting your view dropdown or search queries.</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredAccounts.map(a => (
                          <TableRow key={a._id} className="hover:bg-white/[0.015] transition-colors duration-300 text-sm group font-medium">
                            <TableCell className="text-center">
                              {a.isLocked ? <Lock className="h-4 w-4 text-muted-foreground/40 mx-auto" /> : <Checkbox className="rounded-none" />}
                            </TableCell>
                            <TableCell className="px-8 py-7 font-bold text-foreground hover:text-primary transition-colors cursor-pointer">{a.accountName}</TableCell>
                            <TableCell className="px-8 py-7 font-mono text-xs text-muted-foreground">{a.accountCode || "-"}</TableCell>
                            <TableCell className="px-8 py-7 text-muted-foreground/95">{a.accountType?.name || "-"}</TableCell>
                            <TableCell className="px-8 py-7 text-muted-foreground/80">{a.parentAccountId?.accountName || "-"}</TableCell>
                            <TableCell className="px-8 py-7 text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-8 w-8 p-0 text-muted-foreground/50 hover:text-foreground cursor-pointer rounded-none">
                                    <SettingsIcon className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 shadow-lg border rounded-none">
                                  <DropdownMenuItem onClick={() => handleEditClick(a)} className="cursor-pointer py-2 rounded-none">
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleToggleActive(a._id, !a.isActive)} className="cursor-pointer py-2 rounded-none">
                                    {a.isActive === false ? "Mark as Active" : "Mark as Inactive"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleDeleteAccount(a._id)} className="cursor-pointer text-red-500 py-2 rounded-none">
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
                </CardContent>
              </Card>
            </div>
          </>
        ) : activeTab === "Journals" ? (
          <JournalForm accounts={accounts} />
        ) : (
          <Card className="py-24 text-center text-muted-foreground bg-background rounded-none border border-border/40 shadow-none">
            <h3 className="text-lg font-medium text-foreground">Not Implemented</h3>
            <p className="mt-2 text-sm">Content for {activeTab} is not yet implemented.</p>
          </Card>
        )}
      </div>

      {/* Find Accountants Panel */}
      <Sheet open={isAccountantsOpen} onOpenChange={setIsAccountantsOpen}>
        <SheetContent side="right" className="w-[400px] sm:w-[540px] overflow-y-auto rounded-none border-l border-border/30 bg-background">
          {selectedAccountant ? (
            <div className="space-y-6 pt-4">
              <Button variant="ghost" onClick={() => setSelectedAccountant(null)} className="mb-4 rounded-none font-mono text-xs uppercase tracking-wider">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <h2 className="text-2xl font-bold text-foreground">{selectedAccountant.name}</h2>
              <p className="text-lg text-muted-foreground">{selectedAccountant.firmName}</p>
              <div className="space-y-4 pt-4 border-t border-border/20">
                <div>
                  <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground/60">Location</h4>
                  <p className="text-sm font-semibold mt-1">{selectedAccountant.state}, {selectedAccountant.country}</p>
                </div>
                <div>
                  <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground/60">Contact</h4>
                  <p className="text-sm font-semibold mt-1">{selectedAccountant.email}</p>
                  <p className="text-sm font-semibold">{selectedAccountant.phone}</p>
                </div>
                {selectedAccountant.description && (
                  <div>
                    <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground/60">Description</h4>
                    <p className="text-sm mt-1">{selectedAccountant.description}</p>
                  </div>
                )}
                {selectedAccountant.servicesOffered?.length > 0 && (
                  <div>
                    <h4 className="font-mono text-xs uppercase tracking-wider text-muted-foreground/60">Services Offered</h4>
                    <ul className="list-disc pl-5 text-sm mt-1 space-y-1">
                      {selectedAccountant.servicesOffered.map((s: string) => <li key={s} className="font-medium text-foreground/80">{s}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6 pt-4">
              <SheetHeader>
                <SheetTitle className="text-2xl font-black tracking-tighter">Find Accountants</SheetTitle>
              </SheetHeader>
              <p className="text-sm text-muted-foreground">Connect with an accountant in your area to manage your business finances with ease.</p>
              <div className="space-y-3 pt-4 border-t border-border/20">
                {accountants.map(acc => (
                  <div key={acc._id} className="p-4 border border-border/30 rounded-none cursor-pointer hover:bg-white/[0.015] transition-colors" onClick={() => setSelectedAccountant(acc)}>
                    <h3 className="font-bold text-lg text-foreground">{acc.name}</h3>
                    <p className="text-sm font-medium text-muted-foreground">{acc.firmName}</p>
                    <p className="text-xs text-muted-foreground/50 mt-1 font-mono">{acc.state}, {acc.country}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* New Account Modal */}
      <Dialog open={isAccountModalOpen} onOpenChange={(val) => { setIsAccountModalOpen(val); if (!val) { setEditAccountId(null); setFormData({ accountName: "", accountCode: "", accountType: "", description: "", watchlist: false }); } }}>
        <DialogContent className="rounded-none border border-border/30 bg-background max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tighter">{editAccountId ? "Edit Account" : "Create Account"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70 font-mono">Account Type*</label>
              <Select value={formData.accountType} onValueChange={(v) => setFormData({...formData, accountType: v})}>
                <SelectTrigger className="rounded-none">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  {Object.keys(groupedTypes).map(segment => (
                    <SelectGroup key={segment} className="rounded-none">
                      <SelectLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">{segment}</SelectLabel>
                      {groupedTypes[segment].map((t: any) => (
                        <SelectItem key={t._id} value={t._id} className="rounded-none">{t.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70 font-mono">Account Name*</label>
              <Input value={formData.accountName} onChange={(e) => setFormData({...formData, accountName: e.target.value})} className="rounded-none" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70 font-mono">Account Code</label>
              <Input value={formData.accountCode} onChange={(e) => setFormData({...formData, accountCode: e.target.value})} className="rounded-none" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70 font-mono">Description</label>
              <Textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Max. 500 characters" maxLength={500} className="rounded-none h-24 resize-none" />
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox id="watchlist" checked={formData.watchlist} onCheckedChange={(c) => setFormData({...formData, watchlist: !!c})} className="rounded-none" />
              <label htmlFor="watchlist" className="text-xs text-foreground/80 font-medium">Add to the watchlist on my dashboard</label>
            </div>
          </div>
          <DialogFooter className="border-t pt-4 gap-2">
            <Button variant="outline" className="rounded-none cursor-pointer" onClick={() => setIsAccountModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateAccount} disabled={!formData.accountName || !formData.accountType} className="rounded-none cursor-pointer">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="sm:max-w-[700px] p-0 rounded-none border border-border/30 bg-background">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <DialogTitle className="text-xl font-bold tracking-tighter mx-auto">Accounts - {importStep === 1 ? 'Select File' : importStep === 2 ? 'Map Fields' : 'Preview'}</DialogTitle>
          </div>
          
          <div className="flex items-center justify-center space-x-4 py-4 bg-muted/20">
            <div className="flex items-center">
              <div className={`h-6 w-6 rounded-none flex items-center justify-center text-xs font-bold ${importStep >= 1 ? 'bg-primary text-primary-foreground font-semibold' : 'border-2 text-muted-foreground/40 border-border/30'}`}>1</div>
              <span className={`ml-2 text-xs font-mono uppercase tracking-wider ${importStep >= 1 ? 'text-foreground font-semibold' : 'text-muted-foreground/55'}`}>Configure</span>
            </div>
            <div className="h-px w-16 bg-border/40"></div>
            <div className="flex items-center">
              <div className={`h-6 w-6 rounded-none flex items-center justify-center text-xs font-bold ${importStep >= 2 ? 'bg-primary text-primary-foreground font-semibold' : 'border-2 text-muted-foreground/40 border-border/30'}`}>2</div>
              <span className={`ml-2 text-xs font-mono uppercase tracking-wider ${importStep >= 2 ? 'text-foreground font-semibold' : 'text-muted-foreground/55'}`}>Map Fields</span>
            </div>
            <div className="h-px w-16 bg-border/40"></div>
            <div className="flex items-center">
              <div className={`h-6 w-6 rounded-none flex items-center justify-center text-xs font-bold ${importStep >= 3 ? 'bg-primary text-primary-foreground font-semibold' : 'border-2 text-muted-foreground/40 border-border/30'}`}>3</div>
              <span className={`ml-2 text-xs font-mono uppercase tracking-wider ${importStep >= 3 ? 'text-foreground font-semibold' : 'text-muted-foreground/55'}`}>Preview</span>
            </div>
          </div>
          
          {importStep === 1 && (
            <div className="space-y-6 px-10 py-6">
              <div className="border border-dashed border-border/50 rounded-none p-10 text-center bg-white/[0.005]">
                <div className="mx-auto h-12 w-12 bg-white/[0.01] rounded-none flex items-center justify-center shadow-sm border border-border/20 mb-4">
                  <Upload className="h-5 w-5 text-muted-foreground/50" />
                </div>
                <h3 className="font-semibold text-foreground mb-4">Drag and drop file to import</h3>
                <input type="file" id="import-file" accept=".csv,.tsv,.xls,.xlsx" className="hidden" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
                <button type="button" onClick={() => document.getElementById('import-file')?.click()} className="cursor-pointer bg-primary text-primary-foreground font-mono text-xs uppercase tracking-wider px-4 py-2.5 rounded-none transition-colors">
                  {importFile ? importFile.name : "Choose File ▾"}
                </button>
                <p className="text-xs text-muted-foreground/60 mt-4 font-mono">Maximum File Size: 25 MB • File Format: CSV or TSV or XLS</p>
              </div>

              <p className="text-xs text-muted-foreground">
                Download a <a href="#" className="text-primary hover:underline font-semibold">sample file</a> and compare it to your import file to ensure you have the file perfect for the import.
              </p>

              <div className="grid grid-cols-[200px_1fr] gap-4 items-start border-t border-border/20 pt-6">
                <label className="text-xs font-bold uppercase tracking-wider text-red-500 pt-1 font-mono">Duplicate Handling *</label>
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <input type="radio" id="dup-skip" name="duplicateHandling" checked={importConfig.duplicateHandling === "skip"} onChange={() => setImportConfig({...importConfig, duplicateHandling: "skip"})} className="mt-1 accent-primary h-4 w-4" />
                    <label htmlFor="dup-skip" className="text-sm">
                      <span className="font-semibold text-foreground block mb-1">Skip Duplicates</span>
                      <span className="text-xs text-muted-foreground leading-relaxed">Retains the accounts in Aupulens ERP and does not import the duplicates in the import file.</span>
                    </label>
                  </div>
                  <div className="flex items-start space-x-3">
                    <input type="radio" id="dup-overwrite" name="duplicateHandling" checked={importConfig.duplicateHandling === "overwrite"} onChange={() => setImportConfig({...importConfig, duplicateHandling: "overwrite"})} className="mt-1 accent-primary h-4 w-4" />
                    <label htmlFor="dup-overwrite" className="text-sm">
                      <span className="font-semibold text-foreground block mb-1">Overwrite accounts</span>
                      <span className="text-xs text-muted-foreground leading-relaxed">Imports the duplicates in the import file and overwrites the existing accounts in Aupulens ERP.</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[200px_1fr] gap-4 items-center border-t border-border/20 pt-6">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 font-mono">Character Encoding</label>
                <Select defaultValue="utf8">
                  <SelectTrigger className="w-full rounded-none">
                    <SelectValue placeholder="UTF-8 (Unicode)" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    <SelectItem value="utf8" className="rounded-none">UTF-8 (Unicode)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-between items-center pt-6 border-t border-border/20">
                <Button className="bg-primary text-primary-foreground font-mono text-xs uppercase tracking-wider px-6 rounded-none cursor-pointer" onClick={handleImportParse} disabled={!importFile || loading}>
                  {loading ? "Parsing..." : "Next >"}
                </Button>
                <Button variant="outline" className="rounded-none cursor-pointer" onClick={() => setIsImportOpen(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {importStep === 2 && (
            <div className="space-y-4 px-10 py-6">
              <h3 className="font-bold text-foreground">Map Fields</h3>
              <p className="text-xs text-muted-foreground">Map your file columns to Aupulens fields.</p>
              <div className="space-y-3 pt-4">
                {[
                  { id: "accountName", label: "Account Name*" },
                  { id: "accountCode", label: "Account Code" },
                  { id: "accountType", label: "Account Type*" },
                  { id: "description", label: "Description" }
                ].map(field => (
                  <div key={field.id} className="grid grid-cols-2 gap-4 items-center">
                    <label className="text-sm font-medium">{field.label}</label>
                    <Select value={(importMapping as any)[field.id]} onValueChange={(v) => setImportMapping({...importMapping, [field.id]: v})}>
                      <SelectTrigger className="rounded-none">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent className="rounded-none">
                        {importColumns.map(col => (
                          <SelectItem key={col} value={col} className="rounded-none">{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-6 border-t border-border/20 mt-6">
                <Button className="bg-primary text-primary-foreground font-mono text-xs uppercase tracking-wider px-6 rounded-none cursor-pointer" onClick={() => setImportStep(3)} disabled={!importMapping.accountName || !importMapping.accountType}>Next &gt;</Button>
                <Button variant="outline" className="rounded-none cursor-pointer" onClick={() => setImportStep(1)}>Back</Button>
              </div>
            </div>
          )}

          {importStep === 3 && (
            <div className="space-y-4 px-10 py-6">
              <h3 className="font-bold text-foreground">Preview Data</h3>
              <p className="text-xs text-muted-foreground">Previewing first 5 rows to be imported.</p>
              <div className="border border-border/30 rounded-none overflow-hidden text-sm">
                <Table className="w-full text-left">
                  <TableHeader className="bg-muted/40 border-b border-border/20">
                    <TableRow>
                      <TableHead className="p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">Account Name</TableHead>
                      <TableHead className="p-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">Account Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/20">
                    {importPreview.map((row, i) => (
                      <TableRow key={i} className="bg-card">
                        <TableCell className="p-3 font-semibold text-foreground">{row[importColumns.indexOf(importMapping.accountName)] || "-"}</TableCell>
                        <TableCell className="p-3 text-muted-foreground">{row[importColumns.indexOf(importMapping.accountType)] || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-between items-center pt-6 border-t border-border/20 mt-6">
                <Button className="bg-primary text-primary-foreground font-mono text-xs uppercase tracking-wider px-6 rounded-none cursor-pointer" onClick={handleImportExecute} disabled={loading}>{loading ? "Importing..." : "Import"}</Button>
                <Button variant="outline" className="rounded-none cursor-pointer" onClick={() => setImportStep(2)}>Back</Button>
              </div>
            </div>
          )}

          {importStep === 4 && importResult && (
            <div className="space-y-4 px-10 py-8 text-center bg-card">
              <div className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-4 py-2 font-mono text-xs uppercase tracking-widest inline-block mx-auto mb-2 rounded-none">
                Import Complete
              </div>
              <h3 className="text-lg font-bold text-foreground">Successfully imported {importResult.imported} accounts.</h3>
              <p className="text-muted-foreground text-xs font-mono">Skipped: {importResult.skipped} | Overwritten: {importResult.overwritten}</p>
              {importResult.errors?.length > 0 && (
                <div className="mt-4 text-left bg-rose-500/5 border border-rose-500/15 p-3 rounded-none text-rose-500 font-mono text-xs h-32 overflow-y-auto">
                  {importResult.errors.map((e: string, i: number) => <div key={i}>{e}</div>)}
                </div>
              )}
              <DialogFooter className="mt-6 border-t pt-4">
                <Button onClick={() => setIsImportOpen(false)} className="rounded-none cursor-pointer w-full">Done</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Export Modal */}
      <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
        <DialogContent className="sm:max-w-[550px] rounded-none border border-border/30 bg-background">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold tracking-tighter">{exportMode === "all" ? "Export Chart of Accounts" : "Export Current View"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="bg-primary/5 text-primary border border-border/10 p-4 rounded-none text-xs font-medium leading-relaxed">
              {exportMode === "all" 
                ? "You can export your data from Aupulens ERP in CSV, XLS or XLSX format." 
                : "Only the current view with its visible columns will be exported from Aupulens ERP in CSV or XLS format."
              }
            </div>

            {exportMode === "all" && (
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/75 font-mono">Export Template</label>
                <Select defaultValue="default">
                  <SelectTrigger className="w-full rounded-none">
                    <SelectValue placeholder="Select an Export Template" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    <SelectItem value="default" className="rounded-none">Select an Export Template</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-red-500 font-mono">Decimal Format *</label>
              <Select defaultValue="1">
                <SelectTrigger className="w-[60%] rounded-none">
                  <SelectValue placeholder="1234567.89" />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="1" className="rounded-none">1234567.89</SelectItem>
                  <SelectItem value="2" className="rounded-none">1,234,567.89</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-red-500 font-mono">Export File Format *</label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input type="radio" name="exportFormat" id="fmt-csv" checked={exportFormat === "csv"} onChange={() => setExportFormat("csv")} className="accent-primary h-4 w-4" />
                  <label htmlFor="fmt-csv" className="text-xs text-foreground/80 font-semibold">CSV (Comma Separated Value)</label>
                </div>
                <div className="flex items-center space-x-2">
                  <input type="radio" name="exportFormat" id="fmt-xls" checked={exportFormat === "xls"} onChange={() => setExportFormat("xls")} className="accent-primary h-4 w-4" />
                  <label htmlFor="fmt-xls" className="text-xs text-foreground/80 font-semibold">XLS (Microsoft Excel 1997-2004 Compatible)</label>
                </div>
                {exportMode === "all" && (
                  <div className="flex items-center space-x-2">
                    <input type="radio" name="exportFormat" id="fmt-xlsx" checked={exportFormat === "xlsx"} onChange={() => setExportFormat("xlsx")} className="accent-primary h-4 w-4" />
                    <label htmlFor="fmt-xlsx" className="text-xs text-foreground/80 font-semibold">XLSX (Microsoft Excel)</label>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/75 font-mono">File Protection Password</label>
              <div className="relative w-full">
                <Input type="password" className="rounded-none pr-10" />
                <Eye className="absolute right-3 top-3 h-4 w-4 text-muted-foreground/50 cursor-pointer" />
              </div>
              <p className="text-[10px] text-muted-foreground/60 leading-relaxed font-mono mt-1">
                Your password must be at least 12 characters and include one uppercase letter, lowercase letter, number, and special character.
              </p>
            </div>

            <div className="text-[11px] font-mono text-muted-foreground/70 leading-relaxed border-t border-border/20 pt-4">
              <strong>Note:</strong> You can export only the first {exportMode === "all" ? "25,000" : "10,000"} rows. If you have more rows, please export in smaller batches using filters.
            </div>
          </div>
          
          <DialogFooter className="border-t pt-4 gap-2">
            <Button className="bg-primary text-primary-foreground font-mono text-xs uppercase tracking-wider px-6 rounded-none cursor-pointer" onClick={() => handleExport(exportMode)}>Export</Button>
            <Button variant="outline" className="rounded-none cursor-pointer" onClick={() => setIsExportOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
