"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { Loader2, Sparkles, Settings } from "lucide-react";

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

  useEffect(() => {
    fetch("/api/admin/ai-usage")
      .then((res) => res.json())
      .then((d) => { if (d.success) setData(d.data); setLoading(false); });
  }, []);

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

            <p className="text-xs text-muted-foreground">
              RAG knowledge bases and multi-agent orchestration are a documented future increment (see PROGRESS.md) —
              this covers usage/cost analytics and the model/kill-switch controls (in AI Preferences).
            </p>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
