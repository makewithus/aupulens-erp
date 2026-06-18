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
import { Loader2, Plus, Download, AlertCircle, CheckCircle2, Clock, Activity, FileText } from "lucide-react";
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
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Cases Management</h1>
          <p className="text-muted-foreground text-sm">Manage customer support tickets and service requests.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button onClick={() => setSheetOpen(true)} className="bg-primary gap-2">
            <Plus className="h-4 w-4" /> Create Case
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
        <KPICard title="Open Cases" value={stats.openCases} icon={<FileText className="w-4 h-4" />} color="blue" />
        <KPICard title="Overdue" value={stats.overdueCases} icon={<Clock className="w-4 h-4" />} color="red" />
        <KPICard title="SLA Breaches" value={stats.slaBreaches} icon={<AlertCircle className="w-4 h-4" />} color="orange" />
        <KPICard title="Resolved Today" value={stats.resolvedToday} icon={<CheckCircle2 className="w-4 h-4" />} color="green" />
        <KPICard title="Avg Time" value={stats.avgResTime} icon={<Clock className="w-4 h-4" />} color="purple" />
        <KPICard title="Reopened" value={stats.reopenedCases} icon={<Activity className="w-4 h-4" />} color="yellow" />
        <KPICard title="CSAT" value={stats.avgSatScore} icon={<CheckCircle2 className="w-4 h-4" />} color="teal" />
        <KPICard title="Escalations" value={stats.escalations} icon={<AlertCircle className="w-4 h-4" />} color="red" />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Input placeholder="Global Search cases..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" />
        <Select defaultValue="all">
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Saved Views" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Cases</SelectItem><SelectItem value="my">My Cases</SelectItem></SelectContent>
        </Select>
        <Button variant="outline">Advanced Filter</Button>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Case Number</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>SLA Due</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            : cases.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No cases found.</TableCell></TableRow>
            ) : cases.map(c => (
              <TableRow key={c._id}>
                <TableCell className="font-medium text-blue-400">{c.case_number}</TableCell>
                <TableCell className="max-w-[200px] truncate">{c.title}</TableCell>
                <TableCell>{c.account_id?.company_name || '-'}</TableCell>
                <TableCell>
                  <Badge className={
                    c.severity === 'Critical' ? 'bg-red-600' :
                    c.severity === 'High' ? 'bg-orange-500' :
                    c.severity === 'Medium' ? 'bg-yellow-500' : 'bg-blue-500'
                  }>{c.severity}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{c.status}</Badge>
                </TableCell>
                <TableCell className={c.sla_breached ? "text-red-500 font-bold" : ""}>
                  {c.sla_target_at ? new Date(c.sla_target_at).toLocaleDateString() : '-'}
                </TableCell>
                <TableCell>
                  <Link href={`/crm/cases/${c._id}`}>
                    <Button variant="secondary" size="sm">Workspace</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>New Case</SheetTitle>
            <SheetDescription>Create a new support ticket or service request.</SheetDescription>
          </SheetHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title <span className="text-red-500">*</span></Label>
              <Input value={form.title} onChange={e => setField("title", e.target.value)} required disabled={submitting} placeholder="e.g. Server down in US-East" />
            </div>
            
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setField("description", e.target.value)} disabled={submitting} rows={4} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Account <span className="text-red-500">*</span></Label>
                <Select value={form.account_id} onValueChange={v => setField("account_id", v)} disabled={submitting}>
                  <SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => <SelectItem key={a._id} value={a._id}>{a.company_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Contact</Label>
                <Select value={form.contact_id} onValueChange={v => setField("contact_id", v)} disabled={submitting}>
                  <SelectTrigger><SelectValue placeholder="Select Contact" /></SelectTrigger>
                  <SelectContent>
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
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setField("category", v)} disabled={submitting}>
                  <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                  <SelectContent>
                    {['Product Issue','Billing','Technical Support','Service Request','Complaint','Account Access','Integration Issue','Other'].map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority/Severity</Label>
                <Select value={form.severity} onValueChange={v => setField("severity", v)} disabled={submitting}>
                  <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                  <SelectContent>
                    {['Low','Medium','High','Critical'].map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setField("status", v)} disabled={submitting}>
                <SelectTrigger><SelectValue placeholder="Select Status" /></SelectTrigger>
                <SelectContent>
                  {['New','Open','In Progress','Waiting on Customer','Waiting on Internal Team','Resolved','Closed','Reopened'].map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <SheetFooter className="pt-6 flex gap-2">
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} disabled={submitting} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} className="flex-1 bg-primary">
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : "Create Case"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KPICard({ title, value, icon, color }: any) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-lg flex flex-col justify-center items-center gap-2 text-center">
      <div className={`p-2 bg-${color}-500/10 text-${color}-500 rounded-md`}>{icon}</div>
      <div>
        <p className="text-[11px] text-neutral-400 uppercase tracking-wider">{title}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}
