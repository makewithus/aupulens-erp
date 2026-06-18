'use client';

import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import ActivityTimeline from "@/components/crm/ActivityTimeline";
import DocumentManager from "@/components/crm/DocumentManager";
import {
  FileText, ShieldAlert, HeartPulse, RefreshCw, Calendar, FileCheck, ArrowRight, CheckCircle2
} from "lucide-react";
import Link from "next/link";

const STATUS_COLOR: Record<string, string> = {
  Draft: "bg-neutral-700 text-neutral-100",
  "Pending Signature": "bg-blue-700 text-blue-100",
  Active: "bg-green-700 text-green-100",
  "Renewal Due": "bg-yellow-700 text-yellow-100",
  Expiring: "bg-orange-700 text-orange-100",
  Renewed: "bg-teal-700 text-teal-100",
  Expired: "bg-red-800 text-red-100",
  Cancelled: "bg-neutral-800 text-neutral-400",
};

const CHURN_COLOR: Record<string, string> = {
  Low: "text-green-400 border-green-900/50 bg-green-900/20",
  Medium: "text-yellow-400 border-yellow-900/50 bg-yellow-900/20",
  High: "text-orange-400 border-orange-900/50 bg-orange-900/20",
  Critical: "text-red-400 border-red-900/50 bg-red-900/20",
};

const HEALTH_COLOR: Record<string, string> = {
  Healthy: "text-green-400 border-green-900/50 bg-green-900/20",
  Warning: "text-yellow-400 border-yellow-900/50 bg-yellow-900/20",
  "At Risk": "text-orange-400 border-orange-900/50 bg-orange-900/20",
  Critical: "text-red-400 border-red-900/50 bg-red-900/20",
};

export default function ContractDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"details" | "documents" | "renewals">("details");

  const fetchContract = async () => {
    const res = await fetch(`/api/crm/contracts/${params.id}`);
    const d = await res.json();
    if (d.success) setData(d.data);
    setLoading(false);
  };

  useEffect(() => { fetchContract(); }, [params.id]);

  const updateStatus = async (status: string) => {
    const res = await fetch(`/api/crm/contracts/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    const d = await res.json();
    if (d.success) {
      toast.success(`Status updated to ${status}`);
      fetchContract();
    } else {
      toast.error(d.message || "Failed to update status");
    }
  };

  const initiateRenewal = async () => {
    const res = await fetch(`/api/crm/contracts/${params.id}/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ probability: 50, renewal_value: data.contract_value })
    });
    const d = await res.json();
    if (d.success) {
      toast.success("Renewal Opportunity created!");
      fetchContract();
    } else {
      toast.error(d.message);
    }
  };

  if (loading) return <div className="p-6 text-neutral-400">Loading Contract...</div>;
  if (!data) return <div className="p-6 text-red-400">Contract not found</div>;

  const healthCategory = data.account_id?.account_health_score >= 75 ? "Healthy"
    : data.account_id?.account_health_score >= 50 ? "Warning"
    : data.account_id?.account_health_score >= 25 ? "At Risk"
    : "Critical";

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header Panel */}
      <div className="bg-neutral-900 p-6 rounded-lg border border-neutral-800 flex flex-col gap-4 shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <FileCheck className="w-8 h-8 text-blue-500" />
              <h1 className="text-3xl font-bold font-mono tracking-tight">{data.contract_number}</h1>
              <Badge className={STATUS_COLOR[data.status]}>{data.status}</Badge>
              {data.renewal_status !== "Not Started" && (
                <Badge variant="outline" className="border-blue-700/50 text-blue-400 bg-blue-900/10">
                  {data.renewal_status}
                </Badge>
              )}
            </div>
            <div className="text-lg text-neutral-300">
              <Link href={`/crm/accounts/${data.account_id?._id}`} className="hover:text-primary transition-colors">
                {data.account_id?.company_name}
              </Link>
              <span className="mx-2 text-neutral-600">•</span>
              <span className="font-mono text-green-400 font-semibold">${data.contract_value?.toLocaleString()}</span>
              <span className="text-sm text-neutral-500 ml-1">/ {data.billing_frequency}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
             <div className="flex gap-2">
                {data.status === "Draft" && (
                  <Button variant="outline" onClick={() => updateStatus("Pending Signature")}>Request Signature</Button>
                )}
                {data.status === "Pending Signature" && (
                  <Button className="bg-green-600 hover:bg-green-700" onClick={() => updateStatus("Active")}>Mark Active</Button>
                )}
                {["Active", "Renewal Due", "Expiring"].includes(data.status) && (
                  <Button variant="destructive" onClick={() => updateStatus("Cancelled")}>Cancel Contract</Button>
                )}
             </div>
             {["Active", "Renewal Due", "Expiring"].includes(data.status) && data.renewal_status === "Not Started" && (
               <Button className="bg-blue-600 hover:bg-blue-700 w-full" onClick={initiateRenewal}>
                 <RefreshCw className="w-4 h-4 mr-2" /> Start Renewal Process
               </Button>
             )}
          </div>
        </div>

        {/* Risk & Health Indicators */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
          <div className={`p-3 rounded-md border ${CHURN_COLOR[data.churn_risk] || 'border-neutral-800 bg-neutral-950'}`}>
            <div className="flex items-center gap-1.5 mb-1 opacity-80 text-xs uppercase font-bold">
              <ShieldAlert className="w-3.5 h-3.5" /> Churn Risk
            </div>
            <div className="text-xl font-bold">{data.churn_risk}</div>
          </div>
          <div className={`p-3 rounded-md border ${HEALTH_COLOR[healthCategory] || 'border-neutral-800 bg-neutral-950'}`}>
            <div className="flex items-center gap-1.5 mb-1 opacity-80 text-xs uppercase font-bold">
              <HeartPulse className="w-3.5 h-3.5" /> Account Health
            </div>
            <div className="text-xl font-bold">{data.account_id?.account_health_score || 0} <span className="text-sm font-normal opacity-70">/ 100</span></div>
          </div>
          <div className="p-3 rounded-md border border-neutral-800 bg-neutral-950">
            <div className="flex items-center gap-1.5 mb-1 text-neutral-500 text-xs uppercase font-bold">
              <Calendar className="w-3.5 h-3.5" /> End Date
            </div>
            <div className={`text-xl font-bold ${new Date(data.end_date) < new Date() ? 'text-red-400' : 'text-neutral-200'}`}>
              {new Date(data.end_date).toLocaleDateString()}
            </div>
          </div>
          <div className="p-3 rounded-md border border-neutral-800 bg-neutral-950">
            <div className="flex items-center gap-1.5 mb-1 text-neutral-500 text-xs uppercase font-bold">
              <RefreshCw className="w-3.5 h-3.5" /> Auto-Renew
            </div>
            <div className="text-xl font-bold text-neutral-200">{data.auto_renew ? "Enabled" : "Disabled"}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-neutral-800">
        <button className={`pb-2 px-1 text-sm font-medium ${tab === 'details' ? 'text-primary border-b-2 border-primary' : 'text-neutral-500 hover:text-neutral-300'}`} onClick={() => setTab('details')}>Details & Terms</button>
        <button className={`pb-2 px-1 text-sm font-medium ${tab === 'documents' ? 'text-primary border-b-2 border-primary' : 'text-neutral-500 hover:text-neutral-300'}`} onClick={() => setTab('documents')}>Documents</button>
        <button className={`pb-2 px-1 text-sm font-medium ${tab === 'renewals' ? 'text-primary border-b-2 border-primary' : 'text-neutral-500 hover:text-neutral-300'}`} onClick={() => setTab('renewals')}>Renewal Activity</button>
      </div>

      {/* Tab Content */}
      {tab === 'details' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-lg space-y-4">
            <h2 className="text-lg font-bold border-b border-neutral-800 pb-2">Contract Information</h2>
            <div className="grid grid-cols-2 gap-y-4 text-sm">
              <div><p className="text-neutral-500 mb-1">Start Date</p><p className="font-medium">{new Date(data.start_date).toLocaleDateString()}</p></div>
              <div><p className="text-neutral-500 mb-1">End Date</p><p className="font-medium">{new Date(data.end_date).toLocaleDateString()}</p></div>
              <div><p className="text-neutral-500 mb-1">Billing Frequency</p><p className="font-medium">{data.billing_frequency}</p></div>
              <div><p className="text-neutral-500 mb-1">Value</p><p className="font-medium font-mono">${data.contract_value?.toLocaleString()}</p></div>
              <div><p className="text-neutral-500 mb-1">Owner</p><p className="font-medium">{data.owner_id?.name || "—"}</p></div>
              <div><p className="text-neutral-500 mb-1">Created</p><p className="font-medium">{new Date(data.createdAt).toLocaleDateString()}</p></div>
            </div>

            <h2 className="text-lg font-bold border-b border-neutral-800 pb-2 mt-6">Linked Records</h2>
            <div className="space-y-3">
              {data.opportunity_id && (
                <div className="bg-neutral-950 p-3 rounded border border-neutral-800 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-neutral-500">Originating Opportunity</p>
                    <p className="text-sm font-medium">{data.opportunity_id.deal_name}</p>
                  </div>
                  <Link href={`/crm/opportunities/${data.opportunity_id._id}`}><Button variant="ghost" size="sm" className="h-6 w-6 p-0"><ArrowRight className="w-4 h-4" /></Button></Link>
                </div>
              )}
              {data.quote_id && (
                <div className="bg-neutral-950 p-3 rounded border border-neutral-800 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-neutral-500">Signed Quote</p>
                    <p className="text-sm font-medium font-mono">{data.quote_id.quote_number}</p>
                  </div>
                  <Link href={`/crm/quotes/${data.quote_id._id}`}><Button variant="ghost" size="sm" className="h-6 w-6 p-0"><ArrowRight className="w-4 h-4" /></Button></Link>
                </div>
              )}
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-lg flex flex-col">
            <h2 className="text-lg font-bold border-b border-neutral-800 pb-2 mb-4">Terms & Conditions</h2>
            <div className="flex-1 bg-neutral-950 border border-neutral-800 rounded p-4 text-sm text-neutral-300 whitespace-pre-wrap overflow-y-auto max-h-[400px]">
              {data.terms || <span className="text-neutral-600 italic">No terms specified. Standard terms apply.</span>}
            </div>
            
            {data.notes && (
              <>
                <h2 className="text-lg font-bold border-b border-neutral-800 pb-2 mt-6 mb-4">Internal Notes</h2>
                <div className="bg-neutral-950 border border-neutral-800 rounded p-4 text-sm text-neutral-300 whitespace-pre-wrap">
                  {data.notes}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-lg">
          <DocumentManager linkedRecordType="Contract" linkedRecordId={params.id} />
        </div>
      )}

      {tab === 'renewals' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-lg">
            <h2 className="text-lg font-bold mb-4 border-b border-neutral-800 pb-2">Renewal Status</h2>
            
            {data.renewal_opportunity_id ? (
              <div className="bg-blue-900/10 border border-blue-900/50 p-4 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-blue-400">Active Renewal Opportunity</h3>
                  <Badge variant="outline" className="border-blue-700 text-blue-300">{data.renewal_opportunity_id.stage}</Badge>
                </div>
                <p className="text-sm text-neutral-300">{data.renewal_opportunity_id.deal_name}</p>
                <div className="mt-3 flex justify-between items-center text-sm font-mono">
                  <span className="text-green-400">${data.renewal_opportunity_id.amount?.toLocaleString()}</span>
                  <span className="text-neutral-400">{data.renewal_opportunity_id.probability}% Prob</span>
                </div>
                <Button className="w-full mt-4 bg-neutral-800 hover:bg-neutral-700 text-sm h-8" asChild>
                  <Link href={`/crm/opportunities/${data.renewal_opportunity_id._id}`}>View Opportunity</Link>
                </Button>
              </div>
            ) : (
              <div className="text-center py-10 bg-neutral-950 border border-neutral-800 rounded-lg">
                <RefreshCw className="w-8 h-8 text-neutral-600 mx-auto mb-3" />
                <p className="text-neutral-400 text-sm">No renewal opportunity active.</p>
                {data.renewal_status === 'Not Started' && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={initiateRenewal}>
                    Start Renewal Process
                  </Button>
                )}
              </div>
            )}

            <div className="mt-6 space-y-2">
              <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide">Automated Reminders</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className={`p-2 rounded border ${data.reminder_90_sent ? 'border-green-900/50 bg-green-900/10 text-green-400' : 'border-neutral-800 bg-neutral-950 text-neutral-600'}`}>
                  <div className="flex justify-between"><span>90 Days</span> {data.reminder_90_sent && <CheckCircle2 className="w-4 h-4" />}</div>
                </div>
                <div className={`p-2 rounded border ${data.reminder_60_sent ? 'border-green-900/50 bg-green-900/10 text-green-400' : 'border-neutral-800 bg-neutral-950 text-neutral-600'}`}>
                  <div className="flex justify-between"><span>60 Days</span> {data.reminder_60_sent && <CheckCircle2 className="w-4 h-4" />}</div>
                </div>
                <div className={`p-2 rounded border ${data.reminder_30_sent ? 'border-orange-900/50 bg-orange-900/10 text-orange-400' : 'border-neutral-800 bg-neutral-950 text-neutral-600'}`}>
                  <div className="flex justify-between"><span>30 Days</span> {data.reminder_30_sent && <CheckCircle2 className="w-4 h-4" />}</div>
                </div>
                <div className={`p-2 rounded border ${data.reminder_7_sent ? 'border-red-900/50 bg-red-900/10 text-red-400' : 'border-neutral-800 bg-neutral-950 text-neutral-600'}`}>
                  <div className="flex justify-between"><span>7 Days</span> {data.reminder_7_sent && <CheckCircle2 className="w-4 h-4" />}</div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-lg">
            <h2 className="text-lg font-bold mb-4 border-b border-neutral-800 pb-2">Activity Trail</h2>
            {/* Using account_id to pull activities, but filtering by contract context would be better in a real app */}
            <ActivityTimeline linkedRecordId={data.account_id?._id} />
          </div>
        </div>
      )}
    </div>
  );
}
