'use client';
import { useState, useEffect } from "react";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/SearchInput";
import {
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/shared/Table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Loader2, Plus, Download, FolderKanban } from "lucide-react";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";

const EMPTY_FORM = {
  title: "", description: "", account_id: "", contact_id: "", owner_id: "",
  category: "", subcategory: "", severity: "Low", status: "New"
};

export default function CasesPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [stats, setStats] = useState({ openCases: 0, overdueCases: 0, slaBreaches: 0, resolvedToday: 0, avgResTime: "0", reopenedCases: 0, avgSatScore: 0, escalations: 0 });
  const [accounts, setAccounts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // AI-native pre-fill (sweep): open the create sheet with any AI-extracted
  // fields merged in. Generic — only keys that exist on the form are copied.
  useAiPrefill("case", (p) => {
    setForm((f: any) => { const n: any = { ...f }; for (const k of Object.keys(f)) { const v = (p.data as any)?.[k]; if (v !== undefined && v !== null && v !== "") n[k] = v; } return n; });
    setSheetOpen(true);
    if (p.suggestions && p.suggestions.length) toast.info("Review before saving", { description: p.suggestions.join("  •  "), duration: 9000 });
  });

  const fetchCases = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/cases?search=${search}`);
      const data = await res.json();
      if (data.success) {
        setCases(data.data.cases);
      }
    } catch (e) {
      toast.error("Failed to load cases.");
    } finally {
      setLoading(false);
    }
  };

  const fetchKPIs = async () => {
    try {
      const res = await fetch(`/api/crm/cases/kpi`);
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (e) {}
  };

  const fetchAccountsAndContacts = async () => {
    try {
      const accRes = await fetch(`/api/crm/accounts?limit=100`);
      const accData = await accRes.json();
      if (accData.success) setAccounts(accData.data.accounts);

      const conRes = await fetch(`/api/crm/contacts?limit=100`);
      const conData = await conRes.json();
      if (conData.success) setContacts(conData.data.contacts);
    } catch {}
  };

  useEffect(() => {
    fetchKPIs();
    fetchAccountsAndContacts();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchCases(), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const setField = (field: string, value: any) => setForm(p => ({ ...p, [field]: value }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Title is required");
    if (!form.account_id) return toast.error("Linked Account is required");
    
    setSubmitting(true);
    try {
      const payload = { ...form, case_number: `CAS-${Date.now().toString().slice(-6)}` };
      const res = await fetch("/api/crm/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Case created successfully!");
        setSheetOpen(false);
        setForm(EMPTY_FORM);
        fetchCases();
        fetchKPIs();
      } else {
        toast.error(data.message || "Failed to create case");
      }
    } catch (e) {
      toast.error("Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between pb-2">
        <div className="shrink-0">
          <h2 className="text-[30px] font-medium tracking-[-0.05em]">
            Cases Management
          </h2>
        </div>

        <div className="flex flex-row gap-4">
          <Button
            onClick={() => setSheetOpen(true)}
            className="none-xl h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted gap-2"
          >
            <Plus className="h-4 w-4" /> Create Case
          </Button>
        </div>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <KPICard title="Open Cases" value={stats.openCases} />
        <KPICard title="Overdue" value={stats.overdueCases} />
        <KPICard title="SLA Breaches" value={stats.slaBreaches} />
        <KPICard title="Resolved Today" value={stats.resolvedToday} />
        <KPICard title="Avg Time" value={stats.avgResTime} />
        <KPICard title="Reopened" value={stats.reopenedCases} />
        <KPICard title="CSAT" value={stats.avgSatScore} />
        <KPICard title="Escalations" value={stats.escalations} />
      </div>

      {/* Table Card */}
      <Card className="overflow-hidden border-border/40 shadow-none bg-background">
        {/* Toolbar */}
        <div className="border-b border-border/20 px-8 py-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="shrink-0">
              <h2 className="text-[30px] font-medium tracking-[-0.05em]">
                All Cases
              </h2>

              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                {cases.length} {cases.length === 1 ? "Case" : "Cases"}
              </p>
            </div>

            <div className="w-full max-w-4xl flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
              {/* Search Input */}
              <div className="w-full max-w-sm">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search cases..."
                />
              </div>

              {/* Saved Views Dropdown */}
              <div className="flex items-center gap-1">
                <span className="font-mono text-[11px] text-muted-foreground/50">View:</span>
                <Select defaultValue="all">
                  <SelectTrigger className="w-[150px] h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                    <SelectValue placeholder="Saved Views" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border/40">
                    <SelectItem value="all">All Cases</SelectItem>
                    <SelectItem value="my">My Cases</SelectItem>
                  </SelectContent>
                </Select>
              </div>

          <Button
            variant="outline"
            className="h-12 px-6 rounded-none font-mono text-[11px] uppercase tracking-[0.15em] hover:bg-white/5 text-muted-foreground hover:text-foreground border border-border/20 transition-all duration-300 gap-2"
          >
            <Download className="h-4 w-4" /> Export
          </Button>
            </div>
          </div>
        </div>

        <CardContent className="p-0">
          <TableContainer>
            <TableHead>
              <TableRow className="text-left hover:bg-transparent">
                <TableHeaderCell>Case Number</TableHeaderCell>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Account</TableHeaderCell>
                <TableHeaderCell>Priority</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>SLA Due</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell><Skeleton className="h-5 w-20 font-mono" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Skeleton className="h-8 w-24" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : cases.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-24 text-center">
                    <FolderKanban className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />
                    <h3 className="text-lg font-medium text-foreground">No cases found</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Try adjusting your search query or filters.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                cases.map((c) => {
                  const severityColors: Record<string, string> = {
                    Critical: "text-[#F56868]",
                    High: "text-[#F1DF38]",
                    Medium: "text-[#6CADF5]",
                    Low: "text-[#8AE06C]",
                  };

                  const statusColors: Record<string, string> = {
                    New: "text-[#6CADF5]",
                    Open: "text-[#F1DF38]",
                    "In Progress": "text-[#A77DFF]",
                    "Waiting on Customer": "text-[#F1DF38]",
                    "Waiting on Internal Team": "text-[#A77DFF]",
                    Resolved: "text-[#8AE06C]",
                    Closed: "text-[#8AE06C]",
                    Reopened: "text-[#F56868]",
                  };

                  return (
                    <TableRow key={c._id}>
                      {/* Case Number */}
                      <TableCell className="font-mono text-sm text-[#6CADF5]">
                        {c.case_number}
                      </TableCell>

                      {/* Title */}
                      <TableCell className="max-w-[200px] truncate text-sm text-foreground">
                        {c.title}
                      </TableCell>

                      {/* Account */}
                      <TableCell className="text-sm text-muted-foreground">
                        {c.account_id?.company_name || '—'}
                      </TableCell>

                      {/* Severity/Priority */}
                      <TableCell>
                        <Badge
                          className={`
                            rounded-none
                            border-0
                            bg-transparent
                            px-0
                            font-mono
                            text-[12px]
                            hover:bg-transparent
                            shadow-none
                            ${severityColors[c.severity] ?? "text-muted-foreground"}
                          `}
                        >
                          {c.severity}
                        </Badge>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge
                          className={`
                            rounded-none
                            border-0
                            bg-transparent
                            px-0
                            font-mono
                            text-[12px]
                            hover:bg-transparent
                            shadow-none
                            ${statusColors[c.status] ?? "text-muted-foreground"}
                          `}
                        >
                          {c.status}
                        </Badge>
                      </TableCell>

                      {/* SLA Due */}
                      <TableCell className={`text-sm ${c.sla_breached ? "text-[#F56868] font-semibold" : "text-muted-foreground"}`}>
                        {c.sla_target_at ? new Date(c.sla_target_at).toLocaleDateString() : '—'}
                      </TableCell>

                      {/* Actions */}
                      <TableCell>
                        <div className="flex justify-end">
                          <Link href={`/crm/cases/${c._id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-3 rounded-none font-mono text-[11px] uppercase tracking-[0.15em] hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all duration-300"
                            >
                              Workspace
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </TableContainer>
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-2xl font-bold tracking-tight text-foreground">New Case</SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">Create a new support ticket or service request.</SheetDescription>
          </SheetHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-[0.05em] text-muted-foreground/60 mb-2 block">Title <span className="text-[#F56868]">*</span></Label>
              <Input
                value={form.title}
                onChange={e => setField("title", e.target.value)}
                required
                disabled={submitting}
                placeholder="e.g. Server down in US-East"
                className="rounded-none border-border/40 bg-white/[0.02] focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-[0.05em] text-muted-foreground/60 mb-2 block">Description</Label>
              <Textarea
                value={form.description}
                onChange={e => setField("description", e.target.value)}
                disabled={submitting}
                rows={4}
                className="rounded-none border-border/40 bg-white/[0.02] focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase tracking-[0.05em] text-muted-foreground/60 mb-2 block">Account <span className="text-[#F56868]">*</span></Label>
                <Select value={form.account_id} onValueChange={v => setField("account_id", v)} disabled={submitting}>
                  <SelectTrigger className="w-full h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                    <SelectValue placeholder="Select Account" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border/40">
                    {accounts.map(a => <SelectItem key={a._id} value={a._id}>{a.company_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase tracking-[0.05em] text-muted-foreground/60 mb-2 block">Contact</Label>
                <Select value={form.contact_id} onValueChange={v => setField("contact_id", v)} disabled={submitting}>
                  <SelectTrigger className="w-full h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                    <SelectValue placeholder="Select Contact" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border/40">
                    <SelectItem value="none">None</SelectItem>
                    {contacts.filter(c => c.account_id?._id === form.account_id || c.account_id === form.account_id).map(c => (
                      <SelectItem key={c._id} value={c._id}>{c.first_name} {c.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase tracking-[0.05em] text-muted-foreground/60 mb-2 block">Category</Label>
                <Select value={form.category} onValueChange={v => setField("category", v)} disabled={submitting}>
                  <SelectTrigger className="w-full h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border/40">
                    {['Product Issue','Billing','Technical Support','Service Request','Complaint','Account Access','Integration Issue','Other'].map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase tracking-[0.05em] text-muted-foreground/60 mb-2 block">Priority/Severity</Label>
                <Select value={form.severity} onValueChange={v => setField("severity", v)} disabled={submitting}>
                  <SelectTrigger className="w-full h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border/40">
                    {['Low','Medium','High','Critical'].map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase tracking-[0.05em] text-muted-foreground/60 mb-2 block">Status</Label>
              <Select value={form.status} onValueChange={v => setField("status", v)} disabled={submitting}>
                <SelectTrigger className="w-full h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border/40">
                  {['New','Open','In Progress','Waiting on Customer','Waiting on Internal Team','Resolved','Closed','Reopened'].map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <SheetFooter className="pt-6 flex gap-2 sm:space-x-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
                disabled={submitting}
                className="flex-1 rounded-none border-border/20 font-mono text-[11px] uppercase tracking-[0.15em] transition-all duration-300 h-11"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-none font-mono text-[11px] uppercase tracking-[0.15em] transition-all duration-300 h-11 bg-tertiary text-primary hover:bg-muted border border-secondary"
              >
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : "Create Case"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KPICard({ title, value }: any) {
  return (
    <Card className="border border-border/40 bg-background shadow-none rounded-none hover:border-border/60 hover:bg-white/[0.02] transition-all duration-300 p-4 flex flex-col justify-center items-center gap-2 text-center group">
      <div>
        <p className="text-[11px] text-muted-foreground/60 font-mono">{title}</p>
        <p className="text-2xl font-bold text-foreground tracking-tight mt-1">{value}</p>
      </div>
    </Card>
  );
}
