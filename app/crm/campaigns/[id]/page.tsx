'use client';

import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Megaphone, DollarSign, Target, TrendingUp, Users, Activity, ExternalLink, Loader2
} from "lucide-react";
import Link from "next/link";

const STATUS_COLOR: Record<string, string> = {
  Draft: "bg-accent text-foreground",
  Planned: "bg-blue-700 text-blue-100",
  Active: "bg-green-700 text-green-100",
  Paused: "bg-yellow-700 text-yellow-100",
  Completed: "bg-purple-700 text-purple-100",
  Archived: "bg-accent text-muted-foreground",
};

export default function CampaignDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const [data, setData] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchCampaign = async () => {
    const res = await fetch(`/api/crm/campaigns/${params.id}`);
    const d = await res.json();
    if (d.success) setData(d.data);
  };

  const fetchMetrics = async () => {
    const res = await fetch(`/api/crm/reports/roi?campaign_id=${params.id}`);
    const d = await res.json();
    if (d.success) setMetrics(d.data);
  };

  const init = async () => {
    setLoading(true);
    await Promise.all([fetchCampaign(), fetchMetrics()]);
    setLoading(false);
  };

  useEffect(() => { init(); }, [params.id]);

  const updateStatus = async (status: string) => {
    const res = await fetch(`/api/crm/campaigns/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    const d = await res.json();
    if (d.success) {
      toast.success(`Status updated to ${status}`);
      fetchCampaign();
    } else {
      toast.error(d.message || "Failed to update status");
    }
  };

  const recalculateROI = async () => {
    const res = await fetch(`/api/crm/reports/roi?campaign_id=${params.id}`, { method: "POST" });
    const d = await res.json();
    if (d.success) {
      toast.success("ROI recalculated and saved.");
      setMetrics(d.data);
      fetchCampaign();
    } else {
      toast.error("ROI calculation failed");
    }
  };

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data) return <div className="p-6 text-red-400">Campaign not found</div>;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-card p-6 rounded-lg border border-border flex flex-col gap-4 shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Megaphone className="w-8 h-8 text-purple-500" />
              <h1 className="text-3xl font-bold tracking-tight">{data.campaign_name}</h1>
              <Badge className={STATUS_COLOR[data.status]}>{data.status}</Badge>
              <Badge variant="outline" className="font-mono text-muted-foreground border-border bg-background">
                {data.campaign_code}
              </Badge>
            </div>
            <div className="text-lg text-foreground">
              <span>{data.channel}</span>
              <span className="mx-2 text-muted-foreground">â¢</span>
              <span className="text-sm text-muted-foreground">
                {new Date(data.start_date).toLocaleDateString()} â {data.end_date ? new Date(data.end_date).toLocaleDateString() : "Ongoing"}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
             <div className="flex gap-2">
                {data.status === "Draft" && (
                  <Button variant="outline" onClick={() => updateStatus("Planned")}>Mark Planned</Button>
                )}
                {["Draft", "Planned", "Paused"].includes(data.status) && (
                  <Button className="bg-green-600 hover:bg-green-700" onClick={() => updateStatus("Active")}>Launch Campaign</Button>
                )}
                {data.status === "Active" && (
                  <Button variant="outline" className="text-yellow-500 border-yellow-900/50" onClick={() => updateStatus("Paused")}>Pause</Button>
                )}
                {data.status === "Active" && (
                  <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => updateStatus("Completed")}>Complete</Button>
                )}
             </div>
             <Button variant="outline" className="w-full text-xs h-8" onClick={recalculateROI}>
               Recalculate ROI
             </Button>
          </div>
        </div>

        {/* ROI Key Metrics */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="p-4 rounded-md border border-border bg-background">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs uppercase font-bold text-muted-foreground">Budget Spent</span>
                <DollarSign className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold font-mono">₹{(metrics.budget || 0).toLocaleString()}</div>
            </div>
            <div className="p-4 rounded-md border border-green-900/30 bg-green-900/10">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs uppercase font-bold text-green-500/70">Attributed Revenue</span>
                <TrendingUp className="w-4 h-4 text-green-500/70" />
              </div>
              <div className="text-2xl font-bold font-mono text-green-400">₹{(metrics.attributedRevenue || 0).toLocaleString()}</div>
            </div>
            <div className={`p-4 rounded-md border ${metrics.roiPercentage >= 0 ? 'border-green-900/50 bg-green-900/20' : 'border-red-900/50 bg-red-900/20'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs uppercase font-bold ${metrics.roiPercentage >= 0 ? 'text-green-500/70' : 'text-red-500/70'}`}>ROI %</span>
                <Activity className={`w-4 h-4 ${metrics.roiPercentage >= 0 ? 'text-green-500/70' : 'text-red-500/70'}`} />
              </div>
              <div className={`text-2xl font-bold font-mono ${metrics.roiPercentage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {metrics.roiPercentage >= 0 ? "+" : ""}{metrics.roiPercentage?.toFixed(1)}%
              </div>
            </div>
            <div className="p-4 rounded-md border border-blue-900/30 bg-blue-900/10">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs uppercase font-bold text-blue-500/70">Conversion Rate</span>
                <Target className="w-4 h-4 text-blue-500/70" />
              </div>
              <div className="text-2xl font-bold font-mono text-blue-400">
                {metrics.conversionRate?.toFixed(1)}%
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Details */}
          <div className="bg-card border border-border p-6 rounded-lg space-y-4">
            <h2 className="text-lg font-bold border-b border-border pb-2">Campaign Details</h2>
            <div className="grid grid-cols-2 gap-y-4 text-sm">
              <div><p className="text-muted-foreground mb-1">Target Audience</p><p className="font-medium">{data.target_audience || "â"}</p></div>
              <div><p className="text-muted-foreground mb-1">Owner</p><p className="font-medium">{data.owner_id?.name || "â"}</p></div>
              <div><p className="text-muted-foreground mb-1">Expected Leads</p><p className="font-medium">{data.expected_leads?.toLocaleString()}</p></div>
              <div><p className="text-muted-foreground mb-1">Expected Revenue</p><p className="font-medium font-mono">₹{data.expected_revenue?.toLocaleString()}</p></div>
            </div>
            {data.notes && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-muted-foreground mb-1 text-sm">Notes</p>
                <div className="bg-background p-3 rounded border border-border text-sm whitespace-pre-wrap text-foreground">
                  {data.notes}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1 space-y-6">
          {/* Funnel Stats */}
          {metrics && (
             <div className="bg-card border border-border p-6 rounded-lg space-y-4">
               <h2 className="text-lg font-bold border-b border-border pb-2">Attribution Funnel</h2>
               <div className="space-y-3">
                 <div className="flex justify-between items-center p-2 rounded bg-background border border-border">
                   <div className="flex items-center gap-2 text-sm text-foreground"><Users className="w-4 h-4 text-muted-foreground"/> Total Leads</div>
                   <div className="font-bold">{metrics.totalLeads}</div>
                 </div>
                 <div className="flex justify-between items-center p-2 rounded bg-background border border-border">
                   <div className="flex items-center gap-2 text-sm text-foreground"><Target className="w-4 h-4 text-muted-foreground"/> Qualified Leads</div>
                   <div className="font-bold">{metrics.qualifiedLeads}</div>
                 </div>
                 <div className="flex justify-between items-center p-2 rounded bg-background border border-border">
                   <div className="flex items-center gap-2 text-sm text-foreground"><Activity className="w-4 h-4 text-yellow-500"/> Opportunities</div>
                   <div className="font-bold">{metrics.totalOpportunities}</div>
                 </div>
                 <div className="flex justify-between items-center p-2 rounded bg-background border border-border">
                   <div className="flex items-center gap-2 text-sm text-foreground"><TrendingUp className="w-4 h-4 text-green-500"/> Closed Won</div>
                   <div className="font-bold">{metrics.closedWonOpportunities}</div>
                 </div>
               </div>

               <div className="pt-4 mt-4 border-t border-border space-y-3">
                 <div className="flex justify-between text-sm">
                   <span className="text-muted-foreground">Cost per Lead</span>
                   <span className="font-mono font-medium">₹{metrics.costPerLead?.toFixed(2)}</span>
                 </div>
                 <div className="flex justify-between text-sm">
                   <span className="text-muted-foreground">Cost per Opportunity</span>
                   <span className="font-mono font-medium">₹{metrics.costPerOpportunity?.toFixed(2)}</span>
                 </div>
               </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
