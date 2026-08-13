"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { toast } from "sonner";
import { ShieldAlert, Loader2, Mail, Sparkles, TriangleAlert } from "lucide-react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { AiMarkdown } from "@/components/ai/AiMarkdown";

/**
 * Finance AI Copilot (spec module 8) — anomaly detection across invoices plus
 * AI-drafted payment reminders. Rendered inside DashboardLayout so the finance
 * sidebar/header (and the back arrow) stay in place, and the AI explanation is
 * rendered as Markdown (not raw ### / ** ).
 */
const SEV_STYLES: Record<string, string> = {
  high: "text-red-500 bg-red-500/10 border-red-500/20",
  medium: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  low: "text-muted-foreground bg-muted border-border",
};

export default function FinanceAiCopilotPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const [drafting, setDrafting] = useState<string | null>(null);

  const loadScan = () => {
    setLoading(true);
    cachedFetch("/api/finance/ai/anomalies")
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadScan(); }, []);

  const draftReminder = async (invoiceId: string) => {
    setDrafting(invoiceId); setDraft(null);
    try {
      const res = await fetch("/api/finance/ai/draft-correspondence", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId }),
      });
      const d = await res.json();
      if (d.success) setDraft(d.data);
      else toast.error(d.message || "Could not draft reminder");
    } finally { setDrafting(null); }
  };

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      dashboardTitle="Finance"
      pageName="AI Copilot"
      breadcrumbs={[{ label: "Finance", href: "/finance/summary" }, { label: "AI Copilot" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/finance" })}
      onRefresh={loadScan}
    >
      <div className="mx-auto max-w-4xl space-y-6 p-1">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sparkles className="h-6 w-6 text-primary" /> Finance AI Copilot
          </h1>
          <p className="text-sm text-muted-foreground">Anomaly detection across your invoices, plus AI-drafted payment reminders.</p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Scanning invoices…
          </div>
        ) : !data ? (
          <div className="rounded-xl border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">Could not load the anomaly scan.</div>
        ) : (
          <>
            {/* Anomaly scan card */}
            <div className="rounded-xl border border-border/60 bg-card/40">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 px-5 py-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldAlert className="h-4 w-4 text-amber-500" /> Anomaly scan
                  {data.aiUsed && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">AI-explained</span>}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground/70">
                  {data.stats?.count ?? 0} invoices · avg ₹{Math.round(data.stats?.mean ?? 0).toLocaleString("en-IN")}
                </p>
              </div>

              {data.explanation && (
                <div className="border-b border-border/40 px-5 py-4">
                  <AiMarkdown content={data.explanation} />
                </div>
              )}

              <div className="px-5 py-4">
                {(!data.anomalies || data.anomalies.length === 0) ? (
                  <p className="text-sm text-emerald-500">No financial anomalies detected.</p>
                ) : (
                  <div className="space-y-2">
                    {data.anomalies.map((a: any, i: number) => (
                      <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-border/40 bg-background/40 p-3">
                        <div className="min-w-0 space-y-1">
                          <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEV_STYLES[a.severity] || SEV_STYLES.low}`}>
                            <TriangleAlert className="h-2.5 w-2.5" /> {a.severity}
                          </span>
                          <p className="text-xs leading-relaxed text-foreground/80">{a.description}</p>
                        </div>
                        <button
                          onClick={() => draftReminder(a.invoiceId)}
                          disabled={drafting === a.invoiceId}
                          className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] transition-colors hover:bg-muted disabled:opacity-50"
                        >
                          {drafting === a.invoiceId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />} Draft reminder
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Drafted reminder */}
            {draft && (
              <div className="rounded-xl border border-border/60 bg-card/40 p-5">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  Drafted reminder
                  {draft.aiUsed
                    ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">AI</span>
                    : <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">template</span>}
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Subject</p>
                <p className="mb-3 text-sm">{draft.subject}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Body</p>
                <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-sans text-sm">{draft.body}</pre>
                <p className="mt-2 text-[11px] text-muted-foreground">Review and send from your email tool — this drafts, it does not send.</p>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
