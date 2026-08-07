"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { Loader2, Sparkles, Settings, AlertTriangle, CheckCircle2 } from "lucide-react";

function formatPeriod(p: string) {
  // "YYYYMM" -> "Mon YYYY"
  const y = p.slice(0, 4);
  const m = Number(p.slice(4, 6));
  const name = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m] || p;
  return `${name} ${y}`;
}

export default function AiStudioPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Scoped RAG panel state.
  const [ragQuestion, setRagQuestion] = useState("");
  const [ragAnswer, setRagAnswer] = useState<any>(null);
  const [ragBusy, setRagBusy] = useState(false);
  const [indexInfo, setIndexInfo] = useState<any>(null);

  useEffect(() => {
    fetch("/api/admin/ai-usage")
      .then((res) => res.json())
      .then((d) => { if (d.success) setData(d.data); setLoading(false); });
  }, []);

  const buildIndex = async () => {
    setRagBusy(true); setIndexInfo(null);
    try {
      const res = await fetch("/api/admin/ai-studio/rag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "index" }) });
      const d = await res.json();
      setIndexInfo(d.success ? { ok: true, ...d.data } : { ok: false, message: d.message });
    } finally { setRagBusy(false); }
  };

  const askRag = async () => {
    if (!ragQuestion.trim()) return;
    setRagBusy(true); setRagAnswer(null);
    try {
      const res = await fetch("/api/admin/ai-studio/rag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "query", question: ragQuestion }) });
      const d = await res.json();
      setRagAnswer(d.success ? d.data : { error: d.message });
    } finally { setRagBusy(false); }
  };

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Admin"
      pageName="AI Studio"
      breadcrumbs={[{ label: "Dashboard", href: "/admin/dashboard" }, { label: "AI Studio" }]}
    >
      <div className="p-6 max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-indigo-500" /> AI Studio
            </h1>
            <p className="text-sm text-muted-foreground mt-1">AI usage, cost allowance, and monitoring for this workspace.</p>
          </div>
          <Link href="/admin/settings" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <Settings className="h-3.5 w-3.5" /> AI Preferences
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : !data ? (
          <div className="text-sm text-muted-foreground">Could not load AI usage.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border-2 rounded-xl p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">This Month</p>
                <p className="text-3xl font-bold font-mono mt-1">{data.currentUsage}</p>
                <p className="text-xs text-muted-foreground mt-1">of {data.cap} AI calls ({data.tier} plan)</p>
              </div>
              <div className="border-2 rounded-xl p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Remaining</p>
                <p className="text-3xl font-bold font-mono mt-1">{data.remaining}</p>
                <p className="text-xs text-muted-foreground mt-1">{data.percentUsed}% used</p>
              </div>
              <div className="border-2 rounded-xl p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">AI Status</p>
                <p className={`text-xl font-bold mt-2 ${data.aiDisabled ? "text-red-500" : "text-emerald-500"}`}>
                  {data.aiDisabled ? "Disabled" : "Enabled"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Kill-switch in AI Preferences</p>
              </div>
            </div>

            <div className="border-2 rounded-xl p-5">
              <div className="flex justify-between mb-2">
                <p className="text-sm font-semibold">Monthly allowance</p>
                <p className="text-xs text-muted-foreground">{data.percentUsed}%</p>
              </div>
              <div className="w-full bg-muted rounded-full h-3">
                <div
                  className={`h-3 rounded-full ${data.percentUsed >= 90 ? "bg-red-500" : data.percentUsed >= 70 ? "bg-amber-500" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, data.percentUsed)}%` }}
                />
              </div>
            </div>

            {/* Stale/invalid model-override health check — loud, not a silent per-call 400. */}
            {data.modelHealth && (
              data.modelHealth.stale?.length > 0 ? (
                <div className="border-2 border-red-500/40 bg-red-500/5 rounded-xl p-5">
                  <p className="text-sm font-semibold mb-2 flex items-center gap-2 text-red-600">
                    <AlertTriangle className="h-4 w-4" /> Model configuration problem
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    These workspaces pin an AI model that is not a currently-deployed Azure deployment
                    ({data.modelHealth.deployedChatModels?.join(", ") || "none"}). Every AI call for them fails.
                    Clear the override or point it at a deployed model.
                  </p>
                  <div className="space-y-1.5">
                    {data.modelHealth.stale.map((s: any) => (
                      <div key={s.subdomain} className="text-xs flex flex-wrap items-baseline gap-x-2">
                        <span className="font-mono font-semibold">{s.subdomain}</span>
                        <span className="font-mono text-red-600">&quot;{s.model}&quot;</span>
                        <span className="text-muted-foreground">— {s.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="border-2 rounded-xl p-5">
                  <p className="text-sm font-semibold mb-1 flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" /> Model configuration healthy
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.modelHealth.ownOverride
                      ? <>This workspace pins <span className="font-mono">{data.modelHealth.ownOverride.model}</span>, which is a deployed model.</>
                      : <>No stale model overrides. Deployed: <span className="font-mono">{data.modelHealth.deployedChatModels?.join(", ") || "none"}</span>.</>}
                  </p>
                </div>
              )
            )}

            {/* Platform-wide trial-budget ceiling (shared across all workspaces). */}
            {data.globalCeiling && (
              <div className="border-2 rounded-xl p-5">
                <div className="flex justify-between mb-2">
                  <p className="text-sm font-semibold">Platform trial ceiling (shared)</p>
                  <p className="text-xs text-muted-foreground">{data.globalCeiling.used} / {data.globalCeiling.cap}</p>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div
                    className={`h-3 rounded-full ${data.globalCeiling.percentUsed >= 90 ? "bg-red-500" : data.globalCeiling.percentUsed >= 70 ? "bg-amber-500" : "bg-primary"}`}
                    style={{ width: `${Math.min(100, data.globalCeiling.percentUsed)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  A budget safeguard above your plan cap — shared across all workspaces. AI pauses platform-wide if this is reached.
                </p>
              </div>
            )}

            <div className="border-2 rounded-xl p-5">
              <p className="text-sm font-semibold mb-3">Usage History</p>
              {data.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No AI usage recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.history.map((h: any) => (
                    <div key={h.period} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-20">{formatPeriod(h.period)}</span>
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div className="bg-primary/60 h-2 rounded-full" style={{ width: `${Math.min(100, data.cap > 0 ? (h.count / data.cap) * 100 : 0)}%` }} />
                      </div>
                      <span className="text-xs font-mono w-16 text-right">{h.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Scoped RAG — ask questions grounded in THIS workspace's own data. */}
            <div className="border-2 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-semibold">Knowledge base (scoped RAG)</p>
                <button
                  onClick={buildIndex}
                  disabled={ragBusy}
                  className="text-xs border rounded-md px-3 py-1.5 hover:bg-muted disabled:opacity-50"
                >
                  {ragBusy ? "Working…" : "Build / refresh index"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Embeds this workspace&apos;s invoices and CRM notes, then answers questions grounded strictly in them.
              </p>
              {indexInfo && (
                <p className={`text-xs ${indexInfo.ok ? "text-emerald-600" : "text-red-600"}`}>
                  {indexInfo.ok
                    ? `Indexed ${indexInfo.indexed} document(s) (${indexInfo.bySource?.invoice} invoices, ${indexInfo.bySource?.crm_note} notes).`
                    : indexInfo.message}
                </p>
              )}
              <div className="flex gap-2">
                <input
                  value={ragQuestion}
                  onChange={(e) => setRagQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") askRag(); }}
                  placeholder="e.g. Which invoices are unpaid, and what did we discuss with them?"
                  className="flex-1 border rounded-md px-3 py-2 text-sm bg-transparent"
                />
                <button onClick={askRag} disabled={ragBusy || !ragQuestion.trim()} className="text-sm bg-primary text-primary-foreground rounded-md px-4 disabled:opacity-50">
                  Ask
                </button>
              </div>
              {ragAnswer && (
                ragAnswer.error ? (
                  <p className="text-xs text-red-600">{ragAnswer.error}</p>
                ) : (
                  <div className="text-sm space-y-2">
                    <p className="whitespace-pre-wrap">{ragAnswer.answer}</p>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Retrieval: {ragAnswer.method === "vector_search" ? "Atlas Vector Search" : "cosine fallback"} · {ragAnswer.chunks?.length ?? 0} source(s)
                    </p>
                  </div>
                )
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Multi-agent orchestration is a documented future increment (see PROGRESS.md).
              This page covers usage/cost analytics, the model-config health check, the platform
              trial ceiling, and scoped RAG over your workspace&apos;s own data.
            </p>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
