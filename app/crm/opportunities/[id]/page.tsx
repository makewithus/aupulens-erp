'use client';
import { useState, useEffect, use } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Check, Loader2, Plus } from "lucide-react";
import OpportunityTimeline from "@/components/crm/OpportunityTimeline";
import QuoteBuilder from "@/components/crm/QuoteBuilder";
import { formatOpportunityDate } from "@/lib/crm/opportunityDisplay";
import { cachedFetch, invalidateCache } from "@/lib/api/cachedFetch";

const OPPORTUNITY_STAGES = [
  "Prospecting", "Discovery", "Requirement Gathering", "Solution Fit",
  "Proposal Sent", "Negotiation", "Approval", "Closed Won", "Closed Lost",
];

export default function OpportunityDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const [opp, setOpp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStage, setUpdatingStage] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState("");
  const [conversationSummaries, setConversationSummaries] = useState<any[]>([]);

  const fetchOpp = async () => {
    try {
      const res = await cachedFetch(`/api/crm/opportunities/${params.id}`);
      const data = await res.json();
      if (data.success) {
        setOpp(data.data);
        setSelectedStage(data.data.stage || "Prospecting");
        // AI enrichments are slower than the deal details. Load the record first,
        // then fill in the assessment and AI probability without blocking the page.
        void fetch(`/api/crm/opportunities/${params.id}?insights=true`, { cache: "no-store" })
          .then((insightRes) => insightRes.json())
          .then((insightData) => {
            if (insightData.success) setOpp((current: any) => current ? ({ ...current, ...insightData.data }) : current);
          })
          .catch(() => {});
      } else if (!opp) {
        setOpp(null);
      }
    } catch {
      if (!opp) toast.error("Could not load this deal. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      const cachedRows = JSON.parse(sessionStorage.getItem("crm-opportunity-detail-cache") || "[]");
      const cached = Array.isArray(cachedRows) ? cachedRows.find((row: any) => String(row._id) === params.id) : null;
      if (cached) {
        setOpp(cached);
        setLoading(false);
      }
    } catch { /* continue with the database request */ }
    void fetchOpp();
  }, [params.id]);

  useEffect(() => {
    cachedFetch(`/api/crm/conversation-summaries?recordType=Opportunity&recordId=${params.id}`)
      .then((res) => res.json())
      .then((data) => { if (data.success) setConversationSummaries(data.data); });
  }, [params.id]);

  const updateStage = async (newStage: string) => {
    if (updatingStage) return;
    if (opp?.stage === newStage) {
      toast.info(`This deal is already at ${newStage}`);
      return;
    }

    setUpdatingStage(newStage);
    try {
      const res = await cachedFetch(`/api/crm/opportunities/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage })
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        toast.error(result.message || "Failed to update stage");
        return;
      }

      invalidateCache();
      setOpp((current: any) => current ? ({
        ...current,
        stage: result.data.stage,
        probability: result.data.probability,
        weighted_value: result.data.weighted_value,
        stage_history: result.data.stage_history,
        stage_entered_at: result.data.stage_entered_at,
      }) : result.data);
      setSelectedStage(result.data.stage);
      toast.success(newStage === "Proposal Sent" ? "Moved to Proposal" : `Stage moved to ${newStage}`);
      void fetchOpp().catch(() => {});
    } catch {
      toast.error("Could not update the deal stage. Please try again.");
    } finally {
      setUpdatingStage(null);
    }
  };

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!opp) return <div className="p-6">Opportunity not found</div>;

  const weightedValue = opp.amount * (opp.probability / 100);
  const proposalReached = ["Proposal Sent", "Negotiation", "Approval", "Closed Won"].includes(opp.stage);
  const stageHistory = (opp.stage_history || [])
    .filter((entry: any) => entry?.stage)
    .map((entry: any, index: number) => ({ ...entry, __index: index }))
    .sort((a: any, b: any) => {
      const aTime = new Date(a.enteredAt || a.entered_at || 0).getTime();
      const bTime = new Date(b.enteredAt || b.entered_at || 0).getTime();
      return aTime - bTime || a.__index - b.__index;
    })
    .reduce((history: any[], entry: any) => {
      if (history[history.length - 1]?.stage !== entry.stage) history.push(entry);
      return history;
    }, []);
  if (opp.stage && stageHistory[stageHistory.length - 1]?.stage !== opp.stage) {
    stageHistory.push({ stage: opp.stage, entered_at: opp.stage_entered_at || opp.updatedAt });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center bg-card p-6 rounded-lg border border-border">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            {opp.deal_name || opp.name || "Untitled Opportunity"}
            <Badge variant="outline">{opp.stage}</Badge>
            {opp.dynamicRisk && (
              <Badge className={opp.dynamicRisk === 'High' ? 'bg-red-600' : opp.dynamicRisk === 'Medium' ? 'bg-orange-600' : 'bg-green-600'}>
                Risk: {opp.dynamicRisk}
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-2">
            Account: {opp.account_id?.company_name} | Amount: ${opp.amount?.toLocaleString()} | Prob: {opp.probability}% | Weighted: ${weightedValue.toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="opportunity-stage">Opportunity stage</label>
          <select
            id="opportunity-stage"
            value={selectedStage || opp.stage}
            onChange={(event) => setSelectedStage(event.target.value)}
            disabled={Boolean(updatingStage)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            {OPPORTUNITY_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
          </select>
          {selectedStage !== opp.stage && (
            <Button onClick={() => updateStage(selectedStage)} disabled={Boolean(updatingStage)}>
              {updatingStage === selectedStage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Stage
            </Button>
          )}
          {opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost' && (
            <>
              <Button
                onClick={() => updateStage('Proposal Sent')}
                variant="outline"
                disabled={Boolean(updatingStage) || proposalReached}
              >
                {updatingStage === "Proposal Sent" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : proposalReached ? <Check className="mr-2 h-4 w-4" /> : null}
                {proposalReached ? "Moved to Proposal" : "Move to Proposal"}
              </Button>
              <Button onClick={() => updateStage('Closed Won')} className="bg-green-600" disabled={Boolean(updatingStage)}>
                {updatingStage === "Closed Won" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Close Won
              </Button>
              <Button onClick={() => updateStage('Closed Lost')} variant="destructive" disabled={Boolean(updatingStage)}>
                {updatingStage === "Closed Lost" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Close Lost
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-1 lg:col-span-2 space-y-6">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="bg-card border border-border flex flex-wrap h-auto p-1 justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activities">Activities</TabsTrigger>
              <TabsTrigger value="stakeholders">Stakeholders</TabsTrigger>
              <TabsTrigger value="quotes">Quotes</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="forecast">Forecast</TabsTrigger>
              <TabsTrigger value="approvals">Approvals</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="mt-4">
              <div className="bg-card border border-border p-6 rounded-lg space-y-6">
                <div>
                  <h3 className="font-bold mb-4">Deal Details</h3>
                  <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                    <div><span className="text-muted-foreground block mb-1">Expected Close</span> <span className="font-medium">{formatOpportunityDate(opp.expected_close_date)}</span></div>
                    <div><span className="text-muted-foreground block mb-1">Owner</span> <span className="font-medium">{opp.ownerId?.name || opp.owner_id?.name || 'Unassigned'}</span></div>
                    <div><span className="text-muted-foreground block mb-1">Source</span> <span className="font-medium">{opp.source || 'N/A'}</span></div>
                    <div><span className="text-muted-foreground block mb-1">Next Action</span> <span className="font-medium">{opp.next_action || 'N/A'}</span></div>
                    <div><span className="text-muted-foreground block mb-1">Product/Service Line</span> <span className="font-medium">{opp.product_service_line || 'N/A'}</span></div>
                    <div><span className="text-muted-foreground block mb-1">Priority</span> <span className="font-medium">{opp.priority || 'Medium'}</span></div>
                  </div>
                </div>

                {opp.competitors && opp.competitors.length > 0 && (
                  <div className="pt-4 border-t border-border">
                    <h3 className="font-bold mb-3">Competitors</h3>
                    <div className="flex flex-wrap gap-2">
                      {opp.competitors.map((c: string, idx: number) => (
                        <Badge key={idx} variant="outline" className="border-border bg-background">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="activities" className="mt-4">
              <div className="bg-card border border-border p-6 rounded-lg">
                <OpportunityTimeline oppId={params.id} />
              </div>
            </TabsContent>

            <TabsContent value="stakeholders" className="mt-4">
              <div className="bg-card border border-border p-6 rounded-lg">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold">Influence Map & Stakeholders</h3>
                  <Button variant="outline" size="sm"><Plus className="w-4 h-4 mr-1"/> Link Contact</Button>
                </div>
                {(!opp.stakeholders || opp.stakeholders.length === 0) ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No stakeholders mapped. Link contacts to build the influence map.</div>
                ) : (
                  <div className="grid gap-4">
                    {opp.stakeholders.map((s: any, i: number) => (
                      <div key={i} className="flex justify-between items-center bg-background p-4 rounded border border-border">
                        <div>
                          <p className="font-bold">{s.contactId?.first_name} {s.contactId?.last_name}</p>
                          <p className="text-xs text-muted-foreground">{s.contactId?.email || s.contactId?.mobile}</p>
                        </div>
                        <Badge className="bg-purple-600 hover:bg-purple-700">{s.role}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="quotes" className="mt-4">
              <div className="bg-card border border-border p-6 rounded-lg">
                <OpportunityQuotes oppId={params.id} accountId={opp.account_id?._id} />
              </div>
            </TabsContent>

            <TabsContent value="tasks" className="mt-4">
              <div className="bg-card border border-border p-6 rounded-lg text-center py-12 text-muted-foreground">
                Tasks management will be displayed here.
              </div>
            </TabsContent>

            <TabsContent value="documents" className="mt-4">
              <div className="bg-card border border-border p-6 rounded-lg">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold">Attachments & Documents</h3>
                  <Button variant="outline" size="sm">Upload Document</Button>
                </div>
                {(!opp.attachments || opp.attachments.length === 0) ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No documents attached to this deal.</div>
                ) : (
                  <div className="space-y-2">
                    {opp.attachments.map((doc: any, i: number) => (
                      <div key={i} className="flex justify-between items-center bg-background p-3 rounded border border-border text-sm">
                        <span className="text-blue-400 hover:underline cursor-pointer">{doc.name}</span>
                        <span className="text-xs text-muted-foreground">{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              <div className="bg-card border border-border p-6 rounded-lg">
                <h3 className="font-bold mb-4">Stage History</h3>
                <div className="relative border-l border-border ml-3 space-y-6">
                  {stageHistory.map((sh: any, i: number) => (
                    <div key={i} className="pl-6 relative">
                      <div className="absolute w-3 h-3 bg-primary rounded-full -left-1.5 top-1 border-2 border-border" />
                      <p className="font-bold text-sm">
                        {sh.stage}{sh.stage === opp.stage ? <span className="ml-2 text-xs font-normal text-primary">Current</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Entered: {(sh.enteredAt || sh.entered_at) ? new Date(sh.enteredAt || sh.entered_at).toLocaleString("en-GB") : "—"}
                      </p>
                      {(sh.exitedAt || sh.exited_at) && (
                        <p className="text-xs text-muted-foreground">
                          Exited: {new Date(sh.exitedAt || sh.exited_at).toLocaleString("en-GB")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="forecast" className="mt-4">
              <div className="bg-card border border-border p-6 rounded-lg text-center py-12 text-muted-foreground">
                Forecasting analytics for this specific deal will render here. Current Category: {opp.forecast_category}
              </div>
            </TabsContent>

            <TabsContent value="approvals" className="mt-4">
              <div className="bg-card border border-border p-6 rounded-lg text-center py-12 text-muted-foreground">
                No pending approvals required for this deal currently.
              </div>
            </TabsContent>

            <TabsContent value="notes" className="mt-4">
              <div className="bg-card border border-border p-6 rounded-lg text-center py-12 text-muted-foreground">
                Internal collaborative notes stream.
              </div>
            </TabsContent>

          </Tabs>
        </div>

        <div className="col-span-1 space-y-6">
          <div className="bg-card border border-border p-6 rounded-lg">
            <h3 className="font-bold mb-4">Deal Health</h3>
            {opp.dynamicRisk === 'Critical' ? (
              <div className="p-4 bg-red-950/30 border border-red-900 rounded-lg">
                <p className="font-bold text-red-400 mb-2">Critical Risk</p>
                <ul className="list-disc pl-4 text-sm text-red-300 space-y-1">
                  {opp.healthFlags?.map((flag: string, i: number) => <li key={i}>{flag}</li>)}
                </ul>
              </div>
            ) : opp.dynamicRisk === 'At Risk' || opp.dynamicRisk === 'High' ? (
              <div className="p-4 bg-orange-950/30 border border-orange-900 rounded-lg">
                <p className="font-bold text-orange-400 mb-2">At Risk</p>
                <ul className="list-disc pl-4 text-sm text-orange-300 space-y-1">
                  {opp.healthFlags?.map((flag: string, i: number) => <li key={i}>{flag}</li>)}
                </ul>
              </div>
            ) : opp.dynamicRisk === 'Warning' ? (
              <div className="p-4 bg-yellow-950/30 border border-yellow-900 rounded-lg">
                <p className="font-bold text-yellow-400 mb-2">Warning</p>
                <ul className="list-disc pl-4 text-sm text-yellow-300 space-y-1">
                  {opp.healthFlags?.map((flag: string, i: number) => <li key={i}>{flag}</li>)}
                </ul>
              </div>
            ) : (
              <div className="p-4 bg-green-950/30 border border-green-900 rounded-lg">
                <p className="font-bold text-green-400">Healthy Deal</p>
                <p className="text-xs text-green-300 mt-1">Activity metrics are within standard ranges.</p>
              </div>
            )}
          </div>

          {opp.aiAssessment && (
            <div className="bg-card border border-indigo-900/50 p-6 rounded-lg">
              <h3 className="font-bold mb-2 flex items-center gap-2">
                AI Assessment
                <Badge variant="outline" className="text-[10px] font-mono">
                  {opp.aiAssessment.confidence}% confidence
                </Badge>
              </h3>
              <p className="text-sm text-foreground mb-2">{opp.aiAssessment.summary}</p>
              <p className="text-xs text-muted-foreground mb-3">{opp.aiAssessment.reasoning}</p>
              {opp.aiAssessment.suggestedAction && (
                <div className="text-xs bg-indigo-950/30 border border-indigo-900/50 rounded px-3 py-2 text-indigo-300">
                  Suggested: {opp.aiAssessment.suggestedAction}
                </div>
              )}
            </div>
          )}

          {conversationSummaries.length > 0 && (
            <div className="bg-card border border-border p-6 rounded-lg">
              <h3 className="font-bold mb-3">Call &amp; Meeting Summaries</h3>
              <div className="space-y-3">
                {conversationSummaries.map((s: any) => (
                  <div key={s._id} className="text-sm border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between mb-1">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          s.sentiment === "Positive" ? "border-emerald-900/50 text-emerald-400" :
                          s.sentiment === "Negative" ? "border-red-900/50 text-red-400" : ""
                        }`}
                      >
                        {s.sentiment}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(s.generatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-foreground">{s.summary}</p>
                    {s.actionItems?.length > 0 && (
                      <ul className="list-disc pl-4 text-xs text-muted-foreground mt-1">
                        {s.actionItems.map((a: string, i: number) => <li key={i}>{a}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-card border border-border p-6 rounded-lg">
             <h3 className="font-bold mb-4">Tags</h3>
             <div className="flex flex-wrap gap-2">
               {(!opp.tags || opp.tags.length === 0) ? (
                 <span className="text-sm text-muted-foreground">No tags</span>
               ) : (
                 opp.tags.map((tag: string, i: number) => (
                   <Badge key={i} variant="secondary">{tag}</Badge>
                 ))
               )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OpportunityQuotes({ oppId, accountId }: { oppId: string, accountId: string }) {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);

  const fetchQuotes = async () => {
    const res = await cachedFetch(`/api/crm/quotes?opportunity_id=${oppId}`);
    const d = await res.json();
    if (d.success) setQuotes(d.data.quotes);
  };

  useEffect(() => { fetchQuotes(); }, [oppId]);

  if (showBuilder) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => setShowBuilder(false)}>← Back to Quotes</Button>
        {accountId && <QuoteBuilder oppId={oppId} accountId={accountId} onSaved={() => { setShowBuilder(false); fetchQuotes(); }} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-lg">Quotes & Proposals</h3>
        <Button onClick={() => setShowBuilder(true)}><Plus className="w-4 h-4 mr-2"/> Create Quote</Button>
      </div>
      {quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No quotes generated yet.</p>
      ) : (
        <div className="space-y-2">
          {quotes.map(q => (
            <div key={q._id} className="flex justify-between items-center bg-background p-4 rounded border border-border">
              <div>
                <p className="font-bold">{q.quote_number}</p>
                <p className="text-xs text-muted-foreground">Grand Total: ${q.grand_total.toLocaleString()}</p>
                {q.sent_at && <p className="text-xs text-blue-400">Sent: {new Date(q.sent_at).toLocaleDateString()}</p>}
              </div>
              <div className="flex items-center gap-4">
                <Badge variant={q.status === 'Approved' ? 'default' : q.status === 'Rejected' ? 'destructive' : 'outline'}>{q.status}</Badge>
                <Button variant="outline" size="sm" onClick={() => window.open(`/api/crm/quotes/${q._id}/pdf`, '_blank')}>PDF</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
