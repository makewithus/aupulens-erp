'use client';

import { useState, useEffect } from "react";
import { Sparkles, AlertTriangle, TrendingUp, UserX, Database, Crosshair } from "lucide-react";

import { cachedFetch, getInstantCachedData } from "@/lib/api/cachedFetch";

function AIWidget({ title, value, sub, icon: Icon, alert = false }: any) {
  return (
    <div className={`bg-card border ${alert ? 'border-red-900/50' : 'border-border'} rounded-lg p-5`}>
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
        {Icon && <Icon className={`w-4 h-4 ${alert ? 'text-red-500' : 'text-indigo-400'}`} />}
      </div>
      <div className="text-3xl font-bold font-sans tabular-nums tracking-tight">{value}</div>
      <p className="text-xs text-muted-foreground mt-2">{sub}</p>
    </div>
  );
}

function formatCurrency(n: number) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export default function AIDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    const cachedAi = getInstantCachedData<any>("/api/crm/ai/dashboard", { allowPreHydration: true });
    if (cachedAi?.data) {
      setData(cachedAi.data);
      setLoading(false);
    }

    async function loadData() {
      try {
        const res = await cachedFetch("/api/crm/ai/dashboard");
        if (res.ok && isMounted) {
          const d = await res.json();
          if (d.success && d.data) setData(d.data);
        }
      } catch (err) {
        console.error("Failed to load CRM AI dashboard:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    const handleRevalidated = (e: any) => {
      if (e?.detail?.url?.includes("/api/crm")) {
        loadData();
      }
    };
    window.addEventListener("aup:revalidated", handleRevalidated);
    return () => {
      isMounted = false;
      window.removeEventListener("aup:revalidated", handleRevalidated);
    };
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Sparkles className="w-8 h-8 text-indigo-400" />
          AI Control Center
        </h1>
        <p className="text-muted-foreground mt-1">High-level predictive analytics and system intelligence overview.</p>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading live analytics…</div>
      ) : !data ? (
        <div className="text-muted-foreground text-sm">Could not load analytics.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <AIWidget
              title="At-Risk Deals"
              value={data.atRiskDeals?.count ?? 0}
              sub={`${formatCurrency(data.atRiskDeals?.pipelineValue ?? 0)} Pipeline Risk`}
              icon={AlertTriangle}
              alert={(data.atRiskDeals?.count ?? 0) > 0}
            />
            <AIWidget
              title="High Churn Accounts"
              value={data.highChurnAccounts?.count ?? 0}
              sub={(data.highChurnAccounts?.count ?? 0) > 0 ? "Immediate attention needed" : "No accounts flagged"}
              icon={UserX}
              alert={(data.highChurnAccounts?.count ?? 0) > 0}
            />
            <AIWidget
              title="Forecast Confidence"
              value={`${data.forecast?.confidencePercent ?? 0}%`}
              sub={`${formatCurrency(data.forecast?.weightedPipeline ?? 0)} weighted of ${formatCurrency(data.forecast?.totalPipeline ?? 0)} open pipeline`}
              icon={TrendingUp}
            />
            <AIWidget
              title="Data Health"
              value={`${data.dataHealth?.healthPercent ?? 0}%`}
              sub={`${data.dataHealth?.missingFieldCount ?? 0} Missing Key Fields across ${data.dataHealth?.totalRecords ?? 0} leads`}
              icon={Database}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <Crosshair className="w-4 h-4 text-muted-foreground" />
                <p className="text-foreground text-sm font-semibold">Lead Quality (Last 30 Days)</p>
              </div>
              {data.leadQuality.avgScoreLast30Days === null ? (
                <p className="text-muted-foreground text-sm">No leads created in the last 30 days.</p>
              ) : (
                <>
                  <div className="text-3xl font-bold font-sans tabular-nums">{data.leadQuality.avgScoreLast30Days}</div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Average lead score across {data.leadQuality.sampleSize} lead{data.leadQuality.sampleSize === 1 ? "" : "s"}
                  </p>
                </>
              )}
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-muted-foreground" />
                <p className="text-foreground text-sm font-semibold">Top Recommendations</p>
              </div>
              {data.topRecommendations.length === 0 ? (
                <p className="text-muted-foreground text-sm">No active recommendations. System is optimal.</p>
              ) : (
                <div className="space-y-2">
                  {data.topRecommendations.map((r: any) => (
                    <div key={r._id} className="text-xs bg-accent/50 rounded px-3 py-2">
                      <div className="font-semibold text-foreground">{r.title}</div>
                      <div className="text-muted-foreground mt-0.5">{r.entityType} · {r.confidence}% confidence</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
