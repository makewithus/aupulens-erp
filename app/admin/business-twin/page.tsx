"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AuthSplash } from "@/components/dashboard/AuthSplash";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Loader2, Network, TrendingDown } from "lucide-react";

/**
 * Digital Business Twin (6.11): a real Customer→Invoice / Vendor→Bill money-flow
 * graph plus ONE genuinely-useful simulation — the cash-flow impact of paying a
 * chosen invoice late. Everything is computed from real tenant data.
 */
const KIND_COLOR: Record<string, string> = {
  customer: "#6366f1", invoice: "#0ea5e9", vendor: "#f59e0b", bill: "#ef4444",
};

export default function BusinessTwinPage() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [invoiceId, setInvoiceId] = useState("");
  const [daysLate, setDaysLate] = useState(30);
  const [sim, setSim] = useState<any>(null);
  const [simBusy, setSimBusy] = useState(false);

  useEffect(() => {
    fetch("/api/twin").then((r) => r.json()).then((d) => {
      if (d.success) { setData(d.data); if (d.data.receivables[0]) setInvoiceId(d.data.receivables[0].id); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [] as Node[], edges: [] as Edge[] };
    const g = data.graph;
    // Simple layered layout: customers/vendors left, their invoices/bills right.
    const columns: Record<string, number> = { customer: 0, vendor: 0, invoice: 1, bill: 1 };
    const counters: Record<string, number> = {};
    const nodes: Node[] = g.nodes.map((n: any) => {
      const col = columns[n.kind] ?? 0;
      counters[n.kind] = (counters[n.kind] ?? 0) + 1;
      return {
        id: n.id,
        position: { x: col * 320 + (n.kind === "vendor" || n.kind === "bill" ? 700 : 0), y: counters[n.kind] * 46 },
        data: { label: `${n.label}${n.value ? ` · ${n.value}` : ""}` },
        style: { fontSize: 10, padding: 4, borderRadius: 6, border: `2px solid ${KIND_COLOR[n.kind]}`, background: "#0a0a0a", color: "#e5e5e5", width: 150 },
      };
    });
    const edges: Edge[] = g.edges.map((e: any, i: number) => ({ id: `e${i}`, source: e.from, target: e.to, animated: false, style: { stroke: "#3f3f46" } }));
    return { nodes, edges };
  }, [data]);

  const runSim = async () => {
    if (!invoiceId) return;
    setSimBusy(true); setSim(null);
    try {
      const res = await fetch("/api/twin/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId, daysLate, weeks: 12 }) });
      const d = await res.json();
      setSim(d.success ? d.data : { error: d.message });
    } finally { setSimBusy(false); }
  };

  if (status === "loading") return <AuthSplash />;

  const layoutProps = {
    sidebarSections: adminSidebarConfig,
    dashboardTitle: "Admin",
    pageName: "Business Twin",
    breadcrumbs: [{ label: "Admin", href: "/admin/dashboard" }, { label: "Business Twin" }],
    userName: session?.user?.name || "",
    userEmail: session?.user?.email || "",
    userRole: (session?.user as any)?.role,
    onSignOut: () => signOut({ callbackUrl: "/auth/admin" }),
  };

  if (loading) return (
    <DashboardLayout {...layoutProps}>
      <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Building the twin…</div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout {...layoutProps}>
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Network className="h-6 w-6 text-indigo-500" /> Digital Business Twin</h1>
        <p className="text-sm text-muted-foreground mt-1">Live money-flow graph + cash-flow simulation, from your real data.</p>
      </div>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[["Customers", data.graph.stats.customers], ["Invoices", data.graph.stats.invoices], ["Receivable", data.graph.stats.totalReceivable], ["Payable", data.graph.stats.totalPayable]].map(([k, v]) => (
            <div key={k as string} className="border-2 rounded-xl p-3"><p className="text-[10px] uppercase tracking-widest text-muted-foreground">{k}</p><p className="text-xl font-bold font-mono">{v as number}</p></div>
          ))}
        </div>
      )}

      <div className="border-2 rounded-xl overflow-hidden" style={{ height: 420 }}>
        <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
          <Background /><Controls /><MiniMap className="!bg-card" />
        </ReactFlow>
      </div>

      {/* Cash-flow simulation */}
      <div className="border-2 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-2"><TrendingDown className="h-4 w-4 text-amber-500" /> Simulate a late payment</p>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">Invoice</span>
            <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className="text-sm border border-border rounded px-2 py-1.5 bg-background text-foreground min-w-[180px] [&>option]:bg-background [&>option]:text-foreground">
              {data?.receivables?.map((r: any) => <option key={r.id} value={r.id}>{r.label || r.id} · {r.amount}</option>)}
            </select>
          </label>
          <label className="text-xs">
            <span className="block text-muted-foreground mb-1">Days late</span>
            <input type="number" value={daysLate} onChange={(e) => setDaysLate(Number(e.target.value))} className="text-sm border rounded px-2 py-1.5 bg-transparent w-24" />
          </label>
          <button onClick={runSim} disabled={simBusy || !invoiceId} className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50">{simBusy ? "Simulating…" : "Simulate"}</button>
        </div>

        {sim && (sim.error ? <p className="text-xs text-red-600">{sim.error}</p> : (
          <div className="space-y-2">
            <p className="text-sm">{sim.summary}</p>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead><tr className="text-muted-foreground text-left"><th className="pr-4 py-1">Week</th><th className="pr-4">Baseline cash</th><th className="pr-4">If late</th><th>Δ</th></tr></thead>
                <tbody>
                  {sim.baseline.map((b: any, i: number) => (
                    <tr key={b.weekStart} className={sim.delta[i].delta < 0 ? "text-amber-500" : ""}>
                      <td className="pr-4 py-0.5 font-mono">{b.weekStart}</td>
                      <td className="pr-4 font-mono">{b.cumulative}</td>
                      <td className="pr-4 font-mono">{sim.simulated[i].cumulative}</td>
                      <td className="font-mono">{sim.delta[i].delta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
    </DashboardLayout>
  );
}
