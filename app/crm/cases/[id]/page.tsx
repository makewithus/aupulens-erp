'use client';
import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ActivityTimeline from "@/components/crm/ActivityTimeline";
import CaseEscalationHistory from "@/components/crm/CaseEscalationHistory";
import CommunicationCenter from "@/components/crm/CommunicationCenter";
import DocumentManager from "@/components/crm/DocumentManager";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { Clock, AlertTriangle, CheckCircle2, User, Building } from "lucide-react";

export default function CaseDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [satScore, setSatScore] = useState(0);
  const [satComment, setSatComment] = useState("");
  const [statusInput, setStatusInput] = useState("");

  const fetchCase = async () => {
    const res = await fetch(`/api/crm/cases/${params.id}`);
    const d = await res.json();
    if (d.success) {
      setData(d.data);
      setStatusInput(d.data.status);
    }
    setLoading(false);
  };

  useEffect(() => { fetchCase(); }, [params.id]);

  const escalate = async () => {
    const res = await fetch(`/api/crm/cases/${params.id}/escalate`, { method: 'POST' });
    if (res.ok) { toast.success("Case escalated"); fetchCase(); }
  };

  const updateStatus = async (newStatus: string) => {
    let payload: any = { status: newStatus };
    if (newStatus === 'Closed') {
      const summary = prompt("Please provide a resolution summary (min 20 characters):", data.resolution_summary || "Resolved standard procedure applied.");
      if (!summary || summary.length < 20) {
        toast.error("Resolution summary must be at least 20 characters.");
        return;
      }
      payload.resolution_summary = summary;
    }

    const res = await fetch(`/api/crm/cases/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) { 
      toast.success("Status Updated"); 
      setStatusInput(newStatus);
      fetchCase(); 
    } else {
      let d;
      try { d = await res.json(); } catch(e) {}
      toast.error(d?.message || "Failed to update status");
    }
  };

  const reopen = async () => {
    const res = await fetch(`/api/crm/cases/${params.id}/reopen`, { method: 'POST' });
    const d = await res.json();
    if (d.success) { toast.success("Case reopened"); fetchCase(); }
    else toast.error(d.message);
  };

  const resolveCase = async () => {
    const res = await fetch(`/api/crm/cases/${params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Resolved', resolution_summary: "Resolved standard procedure applied." })
    });
    if (res.ok) { toast.success("Case Resolved"); fetchCase(); }
    else { const err = await res.json(); toast.error(err.message); }
  };

  const submitSatisfaction = async () => {
    const res = await fetch(`/api/crm/cases/${params.id}/satisfaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: satScore, comment: satComment })
    });
    if (res.ok) { toast.success("Feedback submitted!"); fetchCase(); }
    else { const err = await res.json(); toast.error(err.message); }
  };

  if (loading) return <div className="p-6">Loading Case...</div>;
  if (!data) return <div className="p-6">Case not found</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center bg-neutral-900 p-6 rounded-lg border border-neutral-800 gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            {data.case_number} - {data.title}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Select value={statusInput} onValueChange={updateStatus}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {['New','Open','In Progress','Waiting on Customer','Waiting on Internal Team','Resolved','Closed','Reopened'].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge className={data.severity === 'Critical' ? 'bg-red-600' : 'bg-blue-600'}>{data.severity}</Badge>
            <Badge variant="outline">{data.category || 'Support'}</Badge>
          </div>
          <p className="text-muted-foreground mt-3 flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1"><User className="w-4 h-4"/> {data.owner_id?.name || 'Unassigned'}</span>
            <span className={data.sla_breached ? 'text-red-500 font-bold flex items-center gap-1' : 'flex items-center gap-1'}>
              <Clock className="w-4 h-4"/> SLA: {new Date(data.sla_target_at).toLocaleString()} {data.sla_breached ? '(BREACHED)' : ''}
            </span>
            <span className="flex items-center gap-1"><AlertTriangle className="w-4 h-4"/> Esc Level: {data.escalation_level}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {data.status === 'Closed' ? (
            <Button onClick={reopen} className="bg-orange-600">Reopen</Button>
          ) : data.status === 'Resolved' ? (
            <Button onClick={() => updateStatus('Closed')} className="bg-primary">Close Case</Button>
          ) : (
            <>
              <Button variant="destructive" onClick={escalate}>Escalate</Button>
              <Button onClick={resolveCase} className="bg-green-600 hover:bg-green-700">Resolve</Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {data.status === 'Resolved' && !data.satisfaction_score && (
            <div className="bg-blue-900/20 border border-blue-800 p-6 rounded-lg">
              <h3 className="font-bold text-blue-200 mb-2">Customer Satisfaction Survey (Simulation)</h3>
              <div className="flex gap-2 mb-4">
                {[1,2,3,4,5].map(n => (
                  <Button key={n} variant={satScore === n ? 'default' : 'outline'} onClick={() => setSatScore(n)}>{n}</Button>
                ))}
              </div>
              <input type="text" placeholder="Comments..." className="w-full bg-neutral-950 p-2 rounded border border-neutral-800 mb-4 text-sm" value={satComment} onChange={e => setSatComment(e.target.value)} />
              <Button onClick={submitSatisfaction} disabled={!satScore}>Submit Feedback</Button>
            </div>
          )}
          {data.satisfaction_score && (
            <div className="bg-green-900/20 border border-green-800 p-4 rounded-lg flex items-center gap-4">
              <CheckCircle2 className="text-green-500 w-8 h-8" />
              <div>
                <h3 className="font-bold text-green-500">CSAT Score: {data.satisfaction_score} / 5</h3>
                <p className="text-sm mt-1">&quot;{data.satisfaction_comment}&quot;</p>
              </div>
            </div>
          )}

          <Tabs defaultValue="timeline">
            <TabsList className="bg-neutral-900 border border-neutral-800 w-full flex overflow-x-auto">
              <TabsTrigger value="timeline">Activity Timeline</TabsTrigger>
              <TabsTrigger value="communications">Communications</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="escalations">SLA & Escalations</TabsTrigger>
            </TabsList>
            <TabsContent value="timeline" className="bg-neutral-900 border border-neutral-800 p-6 rounded-lg mt-4">
              <ActivityTimeline linkedRecordId={params.id} />
            </TabsContent>
            <TabsContent value="communications" className="bg-neutral-900 border border-neutral-800 p-6 rounded-lg mt-4">
              <CommunicationCenter recordId={params.id} recordType="Case" />
            </TabsContent>
            <TabsContent value="documents" className="bg-neutral-900 border border-neutral-800 p-6 rounded-lg mt-4">
              <DocumentManager linkedRecordId={params.id} linkedRecordType="Case" />
            </TabsContent>
            <TabsContent value="tasks" className="p-4 bg-neutral-900 border border-neutral-800 mt-4 rounded-lg">
              <CaseTasks caseId={params.id} />
            </TabsContent>
            <TabsContent value="escalations" className="bg-neutral-900 border border-neutral-800 p-6 rounded-lg mt-4">
              <h3 className="font-bold mb-4">SLA Tracking & Escalations</h3>
              <div className="mb-6">
                <p className="text-sm">Created: {new Date(data.createdAt).toLocaleString()}</p>
                <p className="text-sm">SLA Target: {new Date(data.sla_target_at).toLocaleString()}</p>
                <p className="text-sm">Breached: {data.sla_breached ? 'Yes' : 'No'}</p>
              </div>
              <h4 className="font-bold mb-4">Escalation History</h4>
              <CaseEscalationHistory history={data.escalation_history} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-lg">
            <h2 className="text-lg font-bold mb-4">Case Details</h2>
            <div className="space-y-3">
              <div><p className="text-xs text-neutral-500">Description</p><p className="text-sm whitespace-pre-wrap">{data.description || 'No description provided.'}</p></div>
              <div><p className="text-xs text-neutral-500">Category</p><p className="text-sm">{data.category || '-'}</p></div>
              <div><p className="text-xs text-neutral-500">Subcategory</p><p className="text-sm">{data.subcategory || '-'}</p></div>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-lg">
            <h2 className="text-lg font-bold mb-4">Customer Information</h2>
            <div className="space-y-4">
              {data.account_id ? (
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 text-blue-500 rounded"><Building className="w-5 h-5"/></div>
                  <div>
                    <p className="text-xs text-neutral-500">Account</p>
                    <Link href={`/crm/accounts/${data.account_id._id}`} className="text-sm font-medium hover:underline text-blue-400">
                      {data.account_id.company_name}
                    </Link>
                  </div>
                </div>
              ) : null}
              {data.contact_id ? (
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500/10 text-green-500 rounded"><User className="w-5 h-5"/></div>
                  <div>
                    <p className="text-xs text-neutral-500">Contact</p>
                    <Link href={`/crm/contacts/${data.contact_id._id}`} className="text-sm font-medium hover:underline text-blue-400">
                      {data.contact_id.first_name} {data.contact_id.last_name}
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-500">No primary contact linked.</p>
              )}
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-lg">
            <h2 className="text-lg font-bold mb-4">Resolution History</h2>
            <p className="text-sm text-muted-foreground">{data.resolution_summary || "Not resolved yet."}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CaseTasks({ caseId }: { caseId: string }) {
  const [tasks, setTasks] = useState<any[]>([]);
  
  useEffect(() => {
    fetch(`/api/crm/tasks?case_id=${caseId}`)
      .then(res => res.json())
      .then(d => d.success && setTasks(d.data.tasks));
  }, [caseId]);

  if (tasks.length === 0) return <p className="text-sm text-muted-foreground">No tasks linked to this case.</p>;

  return (
    <div className="space-y-2">
      {tasks.map(t => (
        <div key={t._id} className="flex justify-between items-center p-3 border border-neutral-800 rounded bg-neutral-950">
          <div>
            <p className="font-bold text-sm">{t.title}</p>
            <p className="text-xs text-muted-foreground">Due: {new Date(t.due_date).toLocaleDateString()}</p>
          </div>
          <Badge variant={t.status === 'Completed' ? 'default' : 'outline'}>{t.status}</Badge>
        </div>
      ))}
    </div>
  );
}
