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
import { Loader2, Plus, Download, Users, Star, UserCheck, Calendar, FolderKanban } from "lucide-react";
import Link from "next/link";
import { confirmDialog } from "@/components/providers/ConfirmRoot";

const EMPTY_FORM = {
  first_name: "", last_name: "", email: "", mobile: "", designation: "", department: "",
  role_in_buying: "", preferred_communication: "", account_id: "",
  is_primary: false, is_decision_maker: false
};

const LIMIT = 25;

export default function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, decisionMakers: 0, primary: 0, thisMonth: 0 });
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // AI-native pre-fill (sweep): open the create sheet with any AI-extracted
  // fields merged in. Generic — only keys that exist on the form are copied.
  useAiPrefill("contact", (p) => {
    setForm((f: any) => { const n: any = { ...f }; for (const k of Object.keys(f)) { const v = (p.data as any)?.[k]; if (v !== undefined && v !== null && v !== "") n[k] = v; } return n; });
    setSheetOpen(true);
    if (p.suggestions && p.suggestions.length) toast.info("Review before saving", { description: p.suggestions.join("  •  "), duration: 9000 });
  });

  const fetchContacts = async (currentPage = page, currentSearch = debouncedSearch) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: String(LIMIT) });
      if (currentSearch) params.set("search", currentSearch);
      const res = await fetch(`/api/crm/contacts?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setContacts(data.data.contacts);
        setStats(data.data.stats);
        setTotal(data.data.total ?? 0);
        setTotalPages(data.data.totalPages ?? 1);
      }
    } catch (e) {
      toast.error("Failed to load contacts.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`/api/crm/accounts?limit=100`);
      const data = await res.json();
      if (data.success) setAccounts(data.data.accounts);
    } catch {}
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    fetchContacts(page, debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch]);

  const setField = (field: string, value: any) => setForm(p => ({ ...p, [field]: value }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) return toast.error("Name is required");
    if (!form.account_id) return toast.error("Linked Account is required");
    
    setSubmitting(true);
    try {
      const created = await submitContact(false);
      if (created) {
        toast.success("Contact created successfully!");
        setSheetOpen(false);
        setForm(EMPTY_FORM);
        fetchContacts();
      }
    } catch (e) {
      toast.error("Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitContact = async (confirmDuplicate: boolean): Promise<boolean> => {
    const res = await fetch("/api/crm/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, confirmDuplicate }),
    });
    const data = await res.json();

    if (res.status === 409) {
      if (data.fuzzy) {
        const matchNames = (data.matches || [])
          .map((m: any) => {
            const r = m.record;
            return r ? `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.email : "an existing contact";
          })
          .join(", ");
        const proceed = await confirmDialog({
          title: "Possible duplicate contact",
          description: `This looks similar to ${matchNames}. Create it anyway?`,
        });
        if (proceed) return submitContact(true);
        return false;
      }
      toast.warning("Duplicate contact detected — a contact with this email or phone already exists.");
      return false;
    }

    if (!data.success) {
      toast.error(data.message || "Failed to create contact");
      return false;
    }

    return true;
  };

  return (
    <div className="space-y-6">
      {/* Table Card */}
      <Card className="overflow-hidden border-border/40 shadow-none bg-background">
        {/* Header */}
        <div className="border-b border-border/20 px-6 py-4">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="shrink-0">
              <h2 className="text-[30px] font-medium tracking-[-0.05em]">
                All Contacts
              </h2>

              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                {total} {total === 1 ? "Contact" : "Contacts"}
              </p>
            </div>

            <div className="w-full max-w-md flex flex-row gap-8">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search contacts..."
              />
              <Button
                onClick={() => setSheetOpen(true)}
                className="none-xl h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Contact
              </Button>
            </div>
          </div>
        </div>

        {/* <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-card border border-border p-4 rounded-lg flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 text-blue-500 rounded-md"><Users className="w-5 h-5" /></div>
            <div><p className="text-sm text-muted-foreground">Total Contacts</p><p className="text-2xl font-bold">{stats.total}</p></div>
          </div>
          <div className="bg-card border border-border p-4 rounded-lg flex items-center gap-4">
            <div className="p-3 bg-purple-500/10 text-purple-500 rounded-md"><Star className="w-5 h-5" /></div>
            <div><p className="text-sm text-muted-foreground">Decision Makers</p><p className="text-2xl font-bold">{stats.decisionMakers}</p></div>
          </div>
          <div className="bg-card border border-border p-4 rounded-lg flex items-center gap-4">
            <div className="p-3 bg-green-500/10 text-green-500 rounded-md"><UserCheck className="w-5 h-5" /></div>
            <div><p className="text-sm text-muted-foreground">Primary Contacts</p><p className="text-2xl font-bold">{stats.primary}</p></div>
          </div>
          <div className="bg-card border border-border p-4 rounded-lg flex items-center gap-4">
            <div className="p-3 bg-orange-500/10 text-orange-500 rounded-md"><Calendar className="w-5 h-5" /></div>
            <div><p className="text-sm text-muted-foreground">Added This Month</p><p className="text-2xl font-bold">{stats.thisMonth}</p></div>
          </div>
        </div> */}

        <CardContent className="p-0">
          <TableContainer>
            <TableHead>
              <TableRow className="text-left hover:bg-transparent">
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Account</TableHeaderCell>
                <TableHeaderCell>Designation</TableHeaderCell>
                <TableHeaderCell>Role</TableHeaderCell>
                <TableHeaderCell>Contact Info</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    {/* Name */}
                    <TableCell>
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <div className="flex gap-1">
                          <Skeleton className="h-4 w-8" />
                          <Skeleton className="h-4 w-12" />
                        </div>
                      </div>
                    </TableCell>

                    {/* Account */}
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>

                    {/* Designation */}
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>

                    {/* Role */}
                    <TableCell>
                      <Skeleton className="h-5 w-24" />
                    </TableCell>

                    {/* Contact Info */}
                    <TableCell>
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3.5 w-20" />
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      <div className="flex justify-end">
                        <Skeleton className="h-8 w-16" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : contacts.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-24 text-center">
                    <FolderKanban className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />

                    <h3 className="text-lg font-medium">
                      {search ? "No contacts match your filters" : "No contacts found"}
                    </h3>

                    <p className="mt-2 text-sm text-muted-foreground">
                      {search ? "Try adjusting your search query." : 'Click "New Contact" to create one.'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                contacts.map((c) => (
                  <TableRow key={c._id}>
                    {/* Name */}
                    <TableCell>
                      <h3 className="text-[18px] font-medium tracking-[-0.03em] text-foreground">
                        {c.first_name} {c.last_name}
                      </h3>
                      <div className="flex gap-1 mt-2">
                        {c.is_decision_maker && (
                          <Badge
                            className="
                              rounded-none
                              border-0
                              bg-transparent
                              px-0
                              font-mono
                              text-[11px]
                              uppercase
                              tracking-[0.12em]
                              hover:bg-transparent
                              shadow-none
                              text-[#A77DFF]
                            "
                          >
                            DM
                          </Badge>
                        )}
                        {c.is_decision_maker && c.is_primary && (
                          <span className="text-muted-foreground/30 font-mono text-[11px] px-1">
                            •
                          </span>
                        )}
                        {c.is_primary && (
                          <Badge
                            className="
                              rounded-none
                              border-0
                              bg-transparent
                              px-0
                              font-mono
                              text-[11px]
                              uppercase
                              tracking-[0.12em]
                              hover:bg-transparent
                              shadow-none
                              text-[#8AE06C]
                            "
                          >
                            Primary
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Account */}
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {c.account_id?.company_name || "—"}
                      </span>
                    </TableCell>

                    {/* Designation */}
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {c.designation || "—"}
                      </span>
                    </TableCell>

                    {/* Role */}
                    <TableCell>
                      {c.role_in_buying ? (
                        <Badge
                          className="
                            rounded-none
                            border
                            border-border/30
                            bg-white/[0.02]
                            px-2
                            py-1
                            font-mono
                            text-[11px]
                            uppercase
                            tracking-[0.05em]
                            text-muted-foreground
                            hover:bg-white/[0.02]
                            shadow-none
                          "
                        >
                          {c.role_in_buying}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Contact Info */}
                    <TableCell>
                      <div className="text-sm text-foreground">{c.email || "—"}</div>
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground/60">
                        {c.mobile || "—"}
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Link href={`/crm/contacts/${c._id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-3 rounded-none font-mono text-[11px] uppercase tracking-[0.15em] hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all duration-300"
                          >
                            View
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </TableContainer>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-border/20">
              <p className="font-mono text-[11px] text-muted-foreground/60">
                Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  Previous
                </Button>
                <span className="text-sm">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>New Contact</SheetTitle>
            <SheetDescription>Create a new contact profile.</SheetDescription>
          </SheetHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>First Name <span className="text-red-500">*</span></Label>
                <Input value={form.first_name} onChange={e => setField("first_name", e.target.value)} required disabled={submitting} />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name <span className="text-red-500">*</span></Label>
                <Input value={form.last_name} onChange={e => setField("last_name", e.target.value)} required disabled={submitting} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Linked Account <span className="text-red-500">*</span></Label>
              <Select value={form.account_id} onValueChange={v => setField("account_id", v)} disabled={submitting}>
                <SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a._id} value={a._id}>{a.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => setField("email", e.target.value)} disabled={submitting} />
              </div>
              <div className="space-y-1.5">
                <Label>Mobile</Label>
                <Input value={form.mobile} onChange={e => setField("mobile", e.target.value)} disabled={submitting} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Designation</Label>
                <Input value={form.designation} onChange={e => setField("designation", e.target.value)} disabled={submitting} />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input value={form.department} onChange={e => setField("department", e.target.value)} disabled={submitting} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Role in Buying</Label>
              <Select value={form.role_in_buying} onValueChange={v => setField("role_in_buying", v)} disabled={submitting}>
                <SelectTrigger><SelectValue placeholder="Select Role" /></SelectTrigger>
                <SelectContent>
                  {['Decision Maker','Influencer','Finance Contact','Technical Contact','Procurement','Support Contact','Executive Sponsor','End User'].map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-4 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_primary} onChange={e => setField("is_primary", e.target.checked)} className="rounded bg-accent border-border" />
                <span className="text-sm font-medium">Primary Contact</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_decision_maker} onChange={e => setField("is_decision_maker", e.target.checked)} className="rounded bg-accent border-border" />
                <span className="text-sm font-medium">Decision Maker</span>
              </label>
            </div>

            <SheetFooter className="pt-6 flex gap-2">
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} disabled={submitting} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="flex-1 bg-primary">
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : "Save Contact"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
