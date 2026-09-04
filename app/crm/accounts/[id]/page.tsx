'use client';
import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { LogActivityModal } from "@/components/crm/LogActivityModal";
import ActivityTimeline from "@/components/crm/ActivityTimeline";
import CustomerJourney from "@/components/crm/CustomerJourney";

export default function Account360Page(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/crm/accounts/${params.id}`)
      .then(res => res.json())
      .then(d => { setData(d.data); setLoading(false); });
  }, [params.id]);

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return <div className="p-6">Account not found</div>;

  const { account, stats, churnRisk, aiAnalysis } = data;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center bg-card p-6 rounded-lg border border-border">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 flex-wrap">
            {account.company_name}
            {account.type && (
              <span className="text-sm px-3 py-1 font-normal uppercase tracking-wider border border-border text-foreground flex items-center">
                {account.type}
              </span>
            )}
            <span className={`text-sm px-3 py-1 font-normal text-white flex items-center ${account.account_health_score >= 70 ? 'bg-emerald-600' : account.account_health_score < 40 ? 'bg-rose-600' : 'bg-amber-500'}`}>
              Health: {account.account_health_score}
            </span>
            <span className={`text-sm px-3 py-1 font-normal flex items-center ${account.status === 'Active' ? 'bg-blue-600 text-white' : account.status === 'At Risk' ? 'bg-orange-600 text-white' : 'bg-muted text-foreground'}`}>
              {account.status || 'Active'}
            </span>
          </h1>
          <p className="text-muted-foreground mt-2">{account.industry} | {account.website || 'No website'}</p>
        </div>
        <div className="flex gap-2">
          <LogActivityModal linkedRecordType="Account" linkedRecordId={account._id} />
          <NewOpportunityModal accountId={account._id} />
          <EditAccountModal account={account} onUpdate={() => window.location.reload()} />
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-card border border-border p-1 w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({stats.contactsCount})</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities ({stats.openOppsCount})</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="cases">Cases ({stats.openCasesCount})</TabsTrigger>
          <TabsTrigger value="quotes">Quotes</TabsTrigger>
          <TabsTrigger value="contracts">Contracts ({stats.activeContractsCount})</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="journey">Attribution & Journey</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="bg-card border border-border p-6 rounded-lg mt-4">
          <h2 className="text-xl font-bold mb-4">Account Information</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">Status:</span> {account.status}</div>
            <div><span className="text-muted-foreground">Segment:</span> {account.segment || '-'}</div>
            <div><span className="text-muted-foreground">Billing:</span> {account.billing_address || '-'}</div>
            <div><span className="text-muted-foreground">LTV:</span> ${account.lifetime_value}</div>
          </div>

          {churnRisk && (
            <div className="mt-6 pt-6 border-t border-border">
              <h3 className="font-bold mb-3 flex items-center gap-2">
                Churn Risk
                <Badge
                  variant="outline"
                  className={
                    churnRisk.level === "Critical" ? "border-red-900/50 text-red-400" :
                    churnRisk.level === "High" ? "border-orange-900/50 text-orange-400" :
                    churnRisk.level === "Medium" ? "border-yellow-900/50 text-yellow-400" :
                    "border-emerald-900/50 text-emerald-400"
                  }
                >
                  {churnRisk.level} ({churnRisk.score})
                </Badge>
              </h3>
              {churnRisk.reasons?.length > 0 && (
                <ul className="list-disc pl-4 text-sm text-muted-foreground space-y-1 mb-3">
                  {churnRisk.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
              )}
              {churnRisk.aiSuggestedAction && (
                <div className="text-xs bg-indigo-950/30 border border-indigo-900/50 rounded px-3 py-2 text-indigo-300">
                  AI-suggested retention action: {churnRisk.aiSuggestedAction}
                </div>
              )}
            </div>
          )}

          {aiAnalysis?.nextBestActions?.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border">
              <h3 className="font-bold mb-3">Next Best Action</h3>
              {aiAnalysis.nextBestActions.map((a: any, i: number) => (
                <div key={i} className="text-sm bg-accent/50 rounded px-3 py-2 mb-2">
                  <div className="font-semibold text-foreground">{a.action} <span className="text-xs text-muted-foreground">({a.priority}, {a.confidence}% confidence)</span></div>
                  <div className="text-xs text-muted-foreground mt-1">{a.reason}</div>
                </div>
              ))}
              {aiAnalysis.suggestedFollowUpMessage && (
                <div className="text-xs bg-indigo-950/30 border border-indigo-900/50 rounded px-3 py-2 text-indigo-300 mt-2">
                  Draft follow-up: â{aiAnalysis.suggestedFollowUpMessage}â
                </div>
              )}
            </div>
          )}
        </TabsContent>
        <TabsContent value="activities" className="bg-card border border-border p-6 rounded-lg mt-4">
          <ActivityTimeline linkedRecordId={account._id} />
        </TabsContent>
        <TabsContent value="tasks" className="bg-card border border-border p-6 rounded-lg mt-4">
          <AccountTasks accountId={account._id} />
        </TabsContent>
        <TabsContent value="contacts" className="bg-card border border-border p-6 rounded-lg mt-4">
          <AccountContacts accountId={account._id} />
        </TabsContent>
        <TabsContent value="opportunities" className="bg-card border border-border p-6 rounded-lg mt-4">
          <AccountOpportunities accountId={account._id} />
        </TabsContent>
        <TabsContent value="cases" className="bg-card border border-border p-6 rounded-lg mt-4">
          <AccountCases accountId={account._id} />
        </TabsContent>
        <TabsContent value="quotes" className="bg-card border border-border p-6 rounded-lg mt-4">
          <AccountQuotes accountId={account._id} />
        </TabsContent>
        <TabsContent value="documents" className="bg-card border border-border p-6 rounded-lg mt-4">
          <AccountDocuments accountId={account._id} />
        </TabsContent>
        <TabsContent value="approvals" className="bg-card border border-border p-6 rounded-lg mt-4">
          <AccountApprovals accountId={account._id} />
        </TabsContent>
        <TabsContent value="journey" className="bg-card border border-border p-6 rounded-lg mt-4">
          <div className="mb-6 border-b border-border pb-4">
            <h2 className="text-xl font-bold mb-2">Original Source Attribution</h2>
            {data.attribution ? (
              <div className="flex items-center gap-3 mt-3">
                <Badge className="bg-purple-600">Campaign</Badge>
                <div className="font-semibold text-lg">{data.attribution.campaign_name}</div>
                <Badge variant="outline" className="text-muted-foreground">{data.attribution.channel}</Badge>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic mt-3">No initial campaign attribution found.</div>
            )}
          </div>
          <h2 className="text-lg font-bold mb-4">Customer Lifecycle Journey</h2>
          <CustomerJourney stages={data.journey || []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EditAccountModal({ account, onUpdate }: { account: any, onUpdate: () => void }) {
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState(account.company_name);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/accounts/${account._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: companyName })
      });
      if (res.ok) {
        toast.success("Account updated successfully");
        setOpen(false);
        onUpdate();
      } else {
        toast.error("Failed to update account");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>Edit Account</Button>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Account</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input value={companyName} onChange={e => setCompanyName(e.target.value)} disabled={loading} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading} className="bg-primary">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewOpportunityModal({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [dealName, setDealName] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!dealName.trim()) return toast.error("Deal name is required");
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/opportunities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_name: dealName, amount: Number(amount) || 0, account_id: accountId })
      });
      if (res.ok) {
        toast.success("Opportunity created successfully");
        setOpen(false);
        setDealName(""); setAmount("");
        window.location.reload();
      } else {
        toast.error("Failed to create opportunity");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>New Opportunity</Button>
      <DialogContent>
        <DialogHeader><DialogTitle>New Opportunity</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Deal Name</Label>
            <Input value={dealName} onChange={e => setDealName(e.target.value)} disabled={loading} placeholder="e.g. Enterprise License" />
          </div>
          <div className="space-y-2">
            <Label>Expected Amount ($)</Label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} disabled={loading} placeholder="15000" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
          <Button onClick={handleCreate} disabled={loading} className="bg-primary">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Opportunity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountContacts({ accountId }: { accountId: string }) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", job_title: "" });
  const [loading, setLoading] = useState(false);

  const fetchContacts = () => {
    fetch(`/api/crm/contacts?account_id=${accountId}`)
      .then(res => res.json())
      .then(d => d.success && setContacts(d.data.contacts || []));
  };

  useEffect(() => { fetchContacts(); }, [accountId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim()) return toast.error("First name is required");
    setLoading(true);
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, account_id: accountId })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Contact added successfully!");
        setSheetOpen(false);
        setForm({ first_name: "", last_name: "", email: "", job_title: "" });
        fetchContacts();
      } else {
        toast.error(data.message || "Failed to add contact");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-lg">Contacts</h3>
        <Button onClick={() => setSheetOpen(true)} className="bg-primary">Add Contact</Button>
      </div>
      <div className="space-y-2 mt-4">
        {contacts.length === 0 ? <p className="text-muted-foreground text-sm">No contacts found for this account.</p> : contacts.map(c => (
          <div key={c._id} className="p-4 border border-border rounded bg-background flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-md">{c.first_name} {c.last_name}</p>
                {c.is_decision_maker && <Badge variant="default" className="text-[10px] px-1 py-0 h-4">DM</Badge>}
                {c.is_primary && <Badge className="bg-green-600 hover:bg-green-600 text-[10px] px-1 py-0 h-4 text-white">Primary</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{c.email} {c.job_title ? `| ${c.job_title}` : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground mr-2">{c.role_in_buying || ''}</span>
              <Badge variant="outline">{c.status || 'Active'}</Badge>
            </div>
          </div>
        ))}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle>Add Contact</SheetTitle></SheetHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label>First Name <span className="text-red-500">*</span></Label>
              <Input required value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value})} disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label>Job Title</Label>
              <Input value={form.job_title} onChange={e => setForm({...form, job_title: e.target.value})} disabled={loading} />
            </div>
            <SheetFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} disabled={loading}>Cancel</Button>
              <Button type="submit" disabled={loading} className="bg-primary">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Save Contact
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
function AccountApprovals({ accountId }: { accountId: string }) {
  const [approvals, setApprovals] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/crm/approvals?account_id=${accountId}`)
      .then(res => res.json())
      .then(d => d.success && setApprovals(d.data.approvals || []));
  }, [accountId]);

  if (approvals.length === 0) return <p className="text-sm text-muted-foreground">No approval history.</p>;

  return (
    <div className="space-y-2">
      {approvals.map(a => (
        <div key={a._id} className="flex justify-between items-center bg-background p-4 rounded border border-border">
          <div>
            <p className="font-bold">{a.type}</p>
            <p className="text-xs text-muted-foreground">Status: {a.status} | Requested By: {a.requested_by_id?.name || 'System'}</p>
          </div>
          <Badge variant={a.status === 'Approved' ? 'default' : a.status === 'Rejected' ? 'destructive' : 'outline'}>{a.status}</Badge>
        </div>
      ))}
    </div>
  );
}

function AccountCases({ accountId }: { accountId: string }) {
  const [cases, setCases] = useState<any[]>([]);
  
  useEffect(() => {
    fetch(`/api/crm/cases?account_id=${accountId}`)
      .then(res => res.json())
      .then(d => d.success && setCases(d.data.cases));
  }, [accountId]);

  const openCases = cases.filter(c => !['Resolved', 'Closed'].includes(c.status));
  const closedCases = cases.filter(c => ['Resolved', 'Closed'].includes(c.status));
  const breachedCases = cases.filter(c => c.sla_breached && !['Resolved', 'Closed'].includes(c.status));
  const escalations = cases.reduce((acc, c) => acc + (c.escalation_level || 0), 0);
  
  let totalSat = 0;
  let satCount = 0;
  let resTime = 0;
  let resCount = 0;
  
  cases.forEach(c => {
    if (c.satisfaction_score) { totalSat += c.satisfaction_score; satCount++; }
    if (['Resolved', 'Closed'].includes(c.status) && c.createdAt && c.updatedAt) {
      resTime += (new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime());
      resCount++;
    }
  });

  const avgSat = satCount > 0 ? (totalSat / satCount).toFixed(1) : 'N/A';
  const avgRes = resCount > 0 ? (resTime / resCount / 3600000).toFixed(1) + ' hrs' : 'N/A';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-background border border-border p-4 rounded-lg text-center">
          <p className="text-sm text-muted-foreground">Open</p>
          <p className="text-xl font-bold">{openCases.length}</p>
        </div>
        <div className="bg-background border border-red-800 p-4 rounded-lg text-center">
          <p className="text-sm text-red-500">Breached</p>
          <p className="text-xl font-bold text-red-500">{breachedCases.length}</p>
        </div>
        <div className="bg-background border border-border p-4 rounded-lg text-center">
          <p className="text-sm text-muted-foreground">Closed</p>
          <p className="text-xl font-bold">{closedCases.length}</p>
        </div>
        <div className="bg-background border border-border p-4 rounded-lg text-center">
          <p className="text-sm text-muted-foreground">Avg CSAT</p>
          <p className="text-xl font-bold text-green-500">{avgSat}</p>
        </div>
        <div className="bg-background border border-border p-4 rounded-lg text-center">
          <p className="text-sm text-muted-foreground">Avg Res Time</p>
          <p className="text-xl font-bold">{avgRes}</p>
        </div>
      </div>
      <div className="space-y-2 mt-4">
        {cases.map(c => (
          <div key={c._id} className="flex justify-between items-center p-3 border border-border rounded bg-background">
            <div>
              <p className="font-bold text-sm">{c.case_number} - {c.title}</p>
              <p className="text-xs text-muted-foreground">Severity: {c.severity} | Escalations: {c.escalation_level}</p>
            </div>
            <Badge variant={['Resolved', 'Closed'].includes(c.status) ? 'default' : 'outline'}>{c.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountTasks({ accountId }: { accountId: string }) {
  const [tasks, setTasks] = useState<any[]>([]);
  
  useEffect(() => {
    fetch(`/api/crm/tasks?account_id=${accountId}`)
      .then(res => res.json())
      .then(d => d.success && setTasks(d.data.tasks));
  }, [accountId]);

  const upcoming = tasks.filter(t => t.status === 'Pending' || t.status === 'In Progress');
  const overdue = tasks.filter(t => t.status === 'Overdue');
  const completed = tasks.filter(t => t.status === 'Completed');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-background border border-border p-4 rounded-lg">
          <p className="text-sm text-muted-foreground">Upcoming</p>
          <p className="text-2xl font-bold">{upcoming.length}</p>
        </div>
        <div className="bg-background border border-red-800 p-4 rounded-lg">
          <p className="text-sm text-red-500">Overdue</p>
          <p className="text-2xl font-bold text-red-500">{overdue.length}</p>
        </div>
        <div className="bg-background border border-border p-4 rounded-lg">
          <p className="text-sm text-muted-foreground">Completed</p>
          <p className="text-2xl font-bold">{completed.length}</p>
        </div>
      </div>
      <div className="space-y-2">
        {tasks.map(t => (
          <div key={t._id} className="flex justify-between items-center p-3 border border-border rounded bg-background">
            <div>
              <p className="font-bold text-sm">{t.title}</p>
              <p className="text-xs text-muted-foreground">Due: {new Date(t.due_date).toLocaleDateString()}</p>
            </div>
            <Badge variant={t.status === 'Completed' ? 'default' : 'outline'}>{t.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountOpportunities({ accountId }: { accountId: string }) {
  const [opps, setOpps] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/crm/opportunities?account_id=${accountId}`)
      .then(res => res.json())
      .then(d => d.success && setOpps(d.data.opportunities || d.data)); // Fallback depending on API shape
  }, [accountId]);

  const openOpps = opps.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage));
  const closedWon = opps.filter(o => o.stage === 'Closed Won');
  
  const pipelineValue = openOpps.reduce((acc, o) => acc + (o.amount || 0), 0);
  const forecastRevenue = openOpps.reduce((acc, o) => acc + (o.weighted_value || (o.amount * (o.probability/100)) || 0), 0);
  const closedWonRevenue = closedWon.reduce((acc, o) => acc + (o.amount || 0), 0);
  
  const totalClosed = opps.filter(o => ['Closed Won', 'Closed Lost'].includes(o.stage)).length;
  const winRate = totalClosed > 0 ? ((closedWon.length / totalClosed) * 100).toFixed(1) + '%' : 'N/A';

  const atRiskCount = openOpps.filter(o => o.dynamicRisk === 'At Risk' || o.dynamicRisk === 'Critical' || o.risk_level === 'High').length;

  const stageDistribution = openOpps.reduce((acc, o) => {
    acc[o.stage] = (acc[o.stage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-6 gap-4">
        <div className="bg-background border border-border p-4 rounded-lg text-center">
          <p className="text-sm text-muted-foreground">Open Opps</p>
          <p className="text-xl font-bold font-sans tabular-nums">{openOpps.length}</p>
        </div>
        <div className="bg-background border border-border p-4 rounded-lg text-center">
          <p className="text-sm text-muted-foreground">Pipeline Value</p>
          <p className="text-xl font-bold font-sans tabular-nums">₹{pipelineValue.toLocaleString()}</p>
        </div>
        <div className="bg-background border border-border p-4 rounded-lg text-center">
          <p className="text-sm text-muted-foreground">Forecast</p>
          <p className="text-xl font-bold font-sans tabular-nums text-blue-400">₹{forecastRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-background border border-border p-4 rounded-lg text-center">
          <p className="text-sm text-muted-foreground">Win Rate</p>
          <p className="text-xl font-bold font-sans tabular-nums">{winRate}</p>
        </div>
        <div className="bg-background border border-border p-4 rounded-lg text-center">
          <p className="text-sm text-muted-foreground">Expected Rev.</p>
          <p className="text-xl font-bold font-sans tabular-nums text-green-500">₹{closedWonRevenue.toLocaleString()}</p>
        </div>
        <div className={`bg-background border p-4 rounded-lg text-center ${atRiskCount > 0 ? 'border-red-900' : 'border-border'}`}>
          <p className="text-sm text-muted-foreground">Deals At Risk</p>
          <p className={`text-xl font-bold font-sans tabular-nums ${atRiskCount > 0 ? 'text-red-500' : 'text-green-500'}`}>{atRiskCount}</p>
        </div>
      </div>

      <div className="bg-background border border-border p-4 rounded-lg">
        <h4 className="text-sm font-bold mb-3 text-muted-foreground">Stage Distribution (Active Deals)</h4>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(stageDistribution).length === 0 && <span className="text-xs text-muted-foreground">No active stages</span>}
          {Object.entries(stageDistribution).map(([stage, count]: any) => (
            <Badge key={stage} variant="outline" className="border-border bg-card">
              {stage} <span className="ml-2 font-bold text-primary">{count}</span>
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2 mt-4">
        {opps.map(o => (
          <div key={o._id} className="flex justify-between items-center p-3 border border-border rounded bg-background">
            <div>
              <p className="font-bold text-sm">{o.deal_name || o.name}</p>
              <p className="text-xs text-muted-foreground">Amount: ${o.amount} | Probability: {o.probability}% | Exp. Close: {o.expected_close_date ? new Date(o.expected_close_date).toLocaleDateString() : 'N/A'}</p>
            </div>
            <Badge variant={o.stage === 'Closed Won' ? 'default' : o.stage === 'Closed Lost' ? 'destructive' : 'outline'}>{o.stage}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountQuotes({ accountId }: { accountId: string }) {
  const [quotes, setQuotes] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/crm/quotes?account_id=${accountId}`)
      .then(res => res.json())
      .then(d => d.success && setQuotes(d.data.quotes));
  }, [accountId]);

  if (quotes.length === 0) return <p className="text-sm text-muted-foreground">No quotes linked to this account.</p>;

  return (
    <div className="space-y-2">
      {quotes.map(q => (
        <div key={q._id} className="flex justify-between items-center bg-background p-4 rounded border border-border">
          <div>
            <p className="font-bold">{q.quote_number}</p>
            <p className="text-xs text-muted-foreground">Grand Total: ${q.grand_total.toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant={q.status === 'Approved' ? 'default' : q.status === 'Rejected' ? 'destructive' : 'outline'}>{q.status}</Badge>
            <Button variant="outline" size="sm" onClick={() => window.open(`/api/crm/quotes/${q._id}/pdf`, '_blank')}>PDF</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

import { UploadCloud } from "lucide-react";

function AccountDocuments({ accountId }: { accountId: string }) {
  const [docs, setDocs] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/crm/documents?linked_record_id=${accountId}&linked_record_type=Account`)
      .then(res => res.json())
      .then(d => d.success && setDocs(d.data.documents));
  }, [accountId]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold">Documents</h3>
        <Button variant="outline"><UploadCloud className="w-4 h-4 mr-2" /> Upload</Button>
      </div>
      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents uploaded.</p>
      ) : (
        <div className="space-y-2">
          {docs.map(d => (
            <div key={d._id} className="flex justify-between items-center bg-background p-3 rounded border border-border">
              <div>
                <p className="font-bold text-sm">{d.name}</p>
                <p className="text-xs text-muted-foreground">Version: {d.version} | Downloads: {d.download_count}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => window.open(`/api/crm/documents/${d._id}`, '_blank')}>Download</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
