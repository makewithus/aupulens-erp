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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Loader2, Plus, FolderKanban } from "lucide-react";
import Link from "next/link";

const STATUS_COLORS_REDESIGNED: Record<string, string> = {
  Active: "text-[#8AE06C]",    // Soft green
  Inactive: "text-[#F56868]",  // Soft red
  Prospect: "text-[#6CADF5]",  // Soft blue
  Customer: "text-[#A77DFF]",  // Soft purple
};

const EMPTY_FORM = { company_name: "", website: "", industry: "" };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // AI-native pre-fill (sweep): open the create sheet with any AI-extracted
  // fields merged in. Generic — only keys that exist on the form are copied.
  useAiPrefill("account", (p) => {
    setForm((f: any) => { const n: any = { ...f }; for (const k of Object.keys(f)) { const v = (p.data as any)?.[k]; if (v !== undefined && v !== null && v !== "") n[k] = v; } return n; });
    setSheetOpen(true);
    if (p.suggestions && p.suggestions.length) toast.info("Review before saving", { description: p.suggestions.join("  •  "), duration: 9000 });
  });

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/accounts?search=${search}`);
      const data = await res.json();
      if (data.success) setAccounts(data.data.accounts ?? data.data ?? []);
    } catch (e) {
      toast.error("Failed to load accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => fetchAccounts(), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const setField = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name.trim()) return toast.error("Company name is required");
    
    setSubmitting(true);
    try {
      const res = await fetch("/api/crm/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Account created successfully!");
        setSheetOpen(false);
        setForm(EMPTY_FORM);
        fetchAccounts();
      } else {
        toast.error(data.message || "Failed to create account");
      }
    } catch (e) {
      toast.error("Network error.");
    } finally {
      setSubmitting(false);
    }
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
                All Accounts
              </h2>

              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                {accounts.length} {accounts.length === 1 ? "Account" : "Accounts"}
              </p>
            </div>

            <div className="w-full max-w-md flex flex-row gap-8">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search accounts..."
              />
              <Button
                onClick={() => setSheetOpen(true)}
                className="none-xl h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Account
              </Button>
            </div>
          </div>
        </div>

        <CardContent className="p-0">
          <TableContainer>
            <TableHead>
              <TableRow className="text-left hover:bg-transparent">
                <TableHeaderCell>Company Name</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Industry</TableHeaderCell>
                <TableHeaderCell>Health</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    {/* Company Name */}
                    <TableCell>
                      <Skeleton className="h-5 w-32" />
                    </TableCell>

                    {/* Type */}
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>

                    {/* Industry */}
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>

                    {/* Health */}
                    <TableCell>
                      <Skeleton className="h-5 w-10" />
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <Skeleton className="h-5 w-16" />
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      <div className="flex justify-end">
                        <Skeleton className="h-8 w-20" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : accounts.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-24 text-center">
                    <FolderKanban className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />

                    <h3 className="text-lg font-medium">
                      {search ? "No accounts match your filters" : "No accounts found"}
                    </h3>

                    <p className="mt-2 text-sm text-muted-foreground">
                      {search ? "Try adjusting your search query." : "Click \"New Account\" to create one."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                accounts.map((acc) => (
                  <TableRow key={acc._id}>
                    {/* Company Name */}
                    <TableCell>
                      <h3 className="text-[18px] font-medium tracking-[-0.03em] text-foreground">
                        {acc.company_name}
                      </h3>
                    </TableCell>

                    {/* Type */}
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {acc.type || "—"}
                      </span>
                    </TableCell>

                    {/* Industry */}
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {acc.industry || "—"}
                      </span>
                    </TableCell>

                    {/* Health */}
                    <TableCell>
                      <span className="font-mono text-sm text-muted-foreground">
                        {acc.account_health_score ?? 0}
                      </span>
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
                          uppercase
                          tracking-[0.12em]
                          hover:bg-transparent
                          shadow-none
                          ${STATUS_COLORS_REDESIGNED[acc.status] ?? "text-muted-foreground"}
                        `}
                      >
                        {acc.status || "Active"}
                      </Badge>
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Link href={`/crm/accounts/${acc._id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-3 rounded-none font-mono text-[11px] uppercase tracking-[0.15em] hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all duration-300"
                          >
                            360 View
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </TableContainer>
        </CardContent>
      </Card>

      {/* New Account Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader className="mb-6">
            <SheetTitle>New Account</SheetTitle>
            <SheetDescription>
              Create a new company account profile.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="company_name">Company Name <span className="text-red-500">*</span></Label>
              <Input
                id="company_name"
                placeholder="e.g. Acme Corp"
                value={form.company_name}
                onChange={e => setField("company_name", e.target.value)}
                disabled={submitting}
                required
              />
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                placeholder="e.g. www.acme.com"
                value={form.website}
                onChange={e => setField("website", e.target.value)}
                disabled={submitting}
              />
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                placeholder="e.g. Technology"
                value={form.industry}
                onChange={e => setField("industry", e.target.value)}
                disabled={submitting}
              />
            </div>

            <SheetFooter className="pt-4 flex gap-2">
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} disabled={submitting} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="flex-1 bg-primary">
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating...</> : "Create Account"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
