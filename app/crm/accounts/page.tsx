'use client';
import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { Loader2, Plus } from "lucide-react";
import Link from "next/link";

const EMPTY_FORM = { company_name: "", website: "", industry: "" };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/accounts?search=${search}`);
      const data = await res.json();
      if (data.success) setAccounts(data.data.accounts);
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
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <Button onClick={() => setSheetOpen(true)} className="bg-primary gap-2">
          <Plus className="h-4 w-4" />
          New Account
        </Button>
      </div>
      
      <div className="mb-4">
        <Input placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" />
      </div>
      
      <div className="bg-neutral-900 border border-neutral-800 rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            : accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No accounts found.</TableCell>
              </TableRow>
            ) : accounts.map(acc => (
              <TableRow key={acc._id}>
                <TableCell className="font-medium">{acc.company_name}</TableCell>
                <TableCell>{acc.type || '-'}</TableCell>
                <TableCell>{acc.industry || '-'}</TableCell>
                <TableCell><Badge className="bg-green-600">{acc.account_health_score}</Badge></TableCell>
                <TableCell><Badge variant="outline">{acc.status}</Badge></TableCell>
                <TableCell>
                  <Link href={`/crm/accounts/${acc._id}`}>
                    <Button variant="secondary" size="sm">360 View</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
