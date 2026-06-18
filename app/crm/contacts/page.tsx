'use client';
import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Loader2, Plus, Download, Users, Star, UserCheck, Calendar } from "lucide-react";
import Link from "next/link";

const EMPTY_FORM = {
  first_name: "", last_name: "", email: "", mobile: "", designation: "", department: "",
  role_in_buying: "", preferred_communication: "", account_id: "",
  is_primary: false, is_decision_maker: false
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, decisionMakers: 0, primary: 0, thisMonth: 0 });
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/contacts?search=${search}`);
      const data = await res.json();
      if (data.success) {
        setContacts(data.data.contacts);
        setStats(data.data.stats);
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
    const timer = setTimeout(() => fetchContacts(), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const setField = (field: string, value: any) => setForm(p => ({ ...p, [field]: value }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) return toast.error("Name is required");
    if (!form.account_id) return toast.error("Linked Account is required");
    
    setSubmitting(true);
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Contact created successfully!");
        setSheetOpen(false);
        setForm(EMPTY_FORM);
        fetchContacts();
      } else {
        toast.error(data.message || "Failed to create contact");
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
        <h1 className="text-2xl font-bold">Contacts</h1>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button onClick={() => setSheetOpen(true)} className="bg-primary gap-2">
            <Plus className="h-4 w-4" /> New Contact
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 text-blue-500 rounded-md"><Users className="w-5 h-5" /></div>
          <div><p className="text-sm text-neutral-400">Total Contacts</p><p className="text-2xl font-bold">{stats.total}</p></div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg flex items-center gap-4">
          <div className="p-3 bg-purple-500/10 text-purple-500 rounded-md"><Star className="w-5 h-5" /></div>
          <div><p className="text-sm text-neutral-400">Decision Makers</p><p className="text-2xl font-bold">{stats.decisionMakers}</p></div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg flex items-center gap-4">
          <div className="p-3 bg-green-500/10 text-green-500 rounded-md"><UserCheck className="w-5 h-5" /></div>
          <div><p className="text-sm text-neutral-400">Primary Contacts</p><p className="text-2xl font-bold">{stats.primary}</p></div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-lg flex items-center gap-4">
          <div className="p-3 bg-orange-500/10 text-orange-500 rounded-md"><Calendar className="w-5 h-5" /></div>
          <div><p className="text-sm text-neutral-400">Added This Month</p><p className="text-2xl font-bold">{stats.thisMonth}</p></div>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Input placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" />
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Contact Info</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            : contacts.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No contacts found.</TableCell></TableRow>
            ) : contacts.map(c => (
              <TableRow key={c._id}>
                <TableCell>
                  <div className="font-medium">{c.first_name} {c.last_name}</div>
                  <div className="flex gap-1 mt-1">
                    {c.is_decision_maker && <Badge variant="default" className="text-[10px] px-1 py-0 h-4">DM</Badge>}
                    {c.is_primary && <Badge className="bg-green-600 hover:bg-green-600 text-[10px] px-1 py-0 h-4">Primary</Badge>}
                  </div>
                </TableCell>
                <TableCell>{c.account_id?.company_name || '-'}</TableCell>
                <TableCell>{c.designation || '-'}</TableCell>
                <TableCell>
                  {c.role_in_buying ? <span className="text-xs px-2 py-1 rounded border border-neutral-700 bg-neutral-800">{c.role_in_buying}</span> : '-'}
                </TableCell>
                <TableCell>
                  <div className="text-sm">{c.email || '-'}</div>
                  <div className="text-xs text-neutral-500">{c.mobile || '-'}</div>
                </TableCell>
                <TableCell>
                  <Link href={`/crm/contacts/${c._id}`}>
                    <Button variant="secondary" size="sm">View</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
                <input type="checkbox" checked={form.is_primary} onChange={e => setField("is_primary", e.target.checked)} className="rounded bg-neutral-800 border-neutral-700" />
                <span className="text-sm font-medium">Primary Contact</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_decision_maker} onChange={e => setField("is_decision_maker", e.target.checked)} className="rounded bg-neutral-800 border-neutral-700" />
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
