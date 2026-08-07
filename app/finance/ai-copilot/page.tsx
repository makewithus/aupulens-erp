"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, Loader2, Mail, Sparkles } from "lucide-react";

/**
 * Finance AI Copilot (spec module 8) — surfaces the anomaly-detection and
 * draft-correspondence features (previously API-only) in a reachable page:
 * scan invoices for anomalies with an AI explanation, and draft a payment
 * reminder for any flagged/overdue invoice.
 */
const SEV_COLOR: Record<string, string> = { high: "text-red-500", medium: "text-amber-500", low: "text-muted-foreground" };

export default function FinanceAiCopilotPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const [drafting, setDrafting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/finance/ai/anomalies")
      .then((r) => r.json())
      .then((d) => { if (d.success) setData(d.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

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
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="h-6 w-6 text-indigo-500" /> Finance AI Copilot</h1>
        <p className="text-sm text-muted-foreground mt-1">Anomaly detection across your invoices, plus AI-drafted payment reminders.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Scanning invoices…</div>
      ) : !data ? (
        <div className="text-sm text-muted-foreground">Could not load anomaly scan.</div>
      ) : (
        <>
          <div className="border-2 rounded-xl p-5">
            <p className="text-sm font-semibold flex items-center gap-2 mb-2"><ShieldAlert className="h-4 w-4 text-amber-500" /> Anomaly scan {data.aiUsed && <span className="text-[10px] uppercase tracking-wide text-indigo-400">AI-explained</span>}</p>
            <p className="text-xs text-muted-foreground mb-3">Scanned {data.stats?.count ?? 0} invoices (avg {Math.round(data.stats?.mean ?? 0)}).</p>
            {data.explanation && <p className="text-sm whitespace-pre-wrap mb-3">{data.explanation}</p>}
            {data.anomalies?.length === 0 ? (
              <p className="text-sm text-emerald-500">No financial anomalies detected.</p>
            ) : (
              <div className="space-y-2">
                {data.anomalies.map((a: any, i: number) => (
                  <div key={i} className="flex items-start justify-between gap-3 text-xs border-t pt-2">
                    <div>
                      <span className={`font-semibold uppercase ${SEV_COLOR[a.severity] || ""}`}>{a.severity}</span>
                      <span className="ml-2">{a.description}</span>
                    </div>
                    <button onClick={() => draftReminder(a.invoiceId)} disabled={drafting === a.invoiceId} className="shrink-0 text-[11px] border rounded px-2 py-1 hover:bg-muted flex items-center gap-1 disabled:opacity-50">
                      {drafting === a.invoiceId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />} Draft reminder
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {draft && (
            <div className="border-2 rounded-xl p-5">
              <p className="text-sm font-semibold mb-2">Drafted reminder {draft.aiUsed ? <span className="text-[10px] uppercase tracking-wide text-indigo-400">AI</span> : <span className="text-[10px] uppercase tracking-wide text-muted-foreground">template</span>}</p>
              <p className="text-xs font-semibold">Subject</p>
              <p className="text-sm mb-2">{draft.subject}</p>
              <p className="text-xs font-semibold">Body</p>
              <pre className="text-sm whitespace-pre-wrap font-sans bg-muted/40 rounded p-3 mt-1">{draft.body}</pre>
              <p className="text-[11px] text-muted-foreground mt-2">Review and send from your email tool — this drafts, it does not send.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
