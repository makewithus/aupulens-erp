"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

/**
 * Enterprise Organization Management (6.8) — view/build the 8-level hierarchy,
 * see a node's effective (inherited) localization, and pull a consolidated
 * cross-entity report for any subtree. Additive overlay over existing data.
 */
const LEVELS = ["Company", "Region", "Branch", "Office", "Warehouse", "Department", "Team", "Employee"];

function TreeRows({ nodes, depth, onSelect, selectedId }: { nodes: any[]; depth: number; onSelect: (n: any) => void; selectedId?: string }) {
  return (
    <>
      {nodes.map((tn) => (
        <div key={String(tn.node._id)}>
          <button
            onClick={() => onSelect(tn.node)}
            className={`w-full text-left text-sm py-1.5 px-2 rounded hover:bg-muted flex items-center gap-2 ${selectedId === String(tn.node._id) ? "bg-muted" : ""}`}
            style={{ paddingLeft: 8 + depth * 16 }}
          >
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-20 shrink-0">{tn.node.level}</span>
            <span className="truncate">{tn.node.name}</span>
          </button>
          {tn.children?.length > 0 && <TreeRows nodes={tn.children} depth={depth + 1} onSelect={onSelect} selectedId={selectedId} />}
        </div>
      ))}
    </>
  );
}

export default function OrgStructurePage() {
  const [tree, setTree] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [form, setForm] = useState({ name: "", level: "Company", parentId: "", currency: "", language: "", timezone: "", taxRegime: "" });

  const load = () => {
    fetch("/api/org/units").then((r) => r.json()).then((d) => {
      if (d.success) { setTree(d.data.tree); setUnits(d.data.units); }
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(load, []);

  const selectNode = async (n: any) => {
    setSelected(n); setReport(null);
    const res = await fetch(`/api/org/units/${n._id}/consolidated`);
    const d = await res.json();
    if (d.success) setReport(d.data);
  };

  const create = async () => {
    if (!form.name) { toast.error("Name is required"); return; }
    const res = await fetch("/api/org/units", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, level: form.level, parentId: form.parentId || null,
        localization: { currency: form.currency || undefined, language: form.language || undefined, timezone: form.timezone || undefined, taxRegime: form.taxRegime || undefined },
      }),
    });
    const d = await res.json();
    if (d.success) { toast.success(`${form.level} "${form.name}" added`); setForm({ ...form, name: "" }); load(); }
    else toast.error(d.message || "Failed to add unit");
  };

  if (loading) return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-1"><Building2 className="h-6 w-6 text-indigo-500" /> Organization Structure</h1>
      <p className="text-sm text-muted-foreground mb-6">8-level hierarchy with inherited localization and consolidated reporting.</p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Tree + add form */}
        <div className="space-y-4">
          <div className="border-2 rounded-xl p-4">
            <p className="text-sm font-semibold mb-2">Hierarchy</p>
            {tree.length === 0 ? <p className="text-sm text-muted-foreground">No units yet. Add a Company to start.</p> : <TreeRows nodes={tree} depth={0} onSelect={selectNode} selectedId={selected ? String(selected._id) : undefined} />}
          </div>

          <div className="border-2 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold">Add unit</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="text-sm border rounded px-2 py-1.5 bg-transparent col-span-2" />
              <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="text-sm border border-border rounded px-2 py-1.5 bg-background text-foreground">
                {LEVELS.map((l) => <option key={l} value={l} className="bg-background text-foreground">{l}</option>)}
              </select>
              <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} className="text-sm border border-border rounded px-2 py-1.5 bg-background text-foreground">
                <option value="" className="bg-background text-foreground">— No parent (root) —</option>
                {units.map((u) => <option key={String(u._id)} value={String(u._id)} className="bg-background text-foreground">{u.level}: {u.name}</option>)}
              </select>
              <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="Currency (e.g. INR)" className="text-sm border rounded px-2 py-1.5 bg-transparent" />
              <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="Timezone (e.g. Asia/Kolkata)" className="text-sm border rounded px-2 py-1.5 bg-transparent" />
              <input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} placeholder="Language (e.g. en-IN)" className="text-sm border rounded px-2 py-1.5 bg-transparent" />
              <input value={form.taxRegime} onChange={(e) => setForm({ ...form, taxRegime: e.target.value })} placeholder="Tax regime (e.g. GST-IN)" className="text-sm border rounded px-2 py-1.5 bg-transparent" />
            </div>
            <button onClick={create} className="w-full bg-primary text-primary-foreground rounded-md py-1.5 text-sm font-semibold flex items-center justify-center gap-1"><Plus className="h-4 w-4" /> Add unit</button>
          </div>
        </div>

        {/* Consolidated report */}
        <div className="border-2 rounded-xl p-4 h-fit">
          <p className="text-sm font-semibold mb-2">Consolidated report</p>
          {!selected ? <p className="text-sm text-muted-foreground">Select a unit to see its subtree rollup.</p> : !report ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <div className="space-y-3 text-sm">
              <p className="font-semibold">{report.unit.level}: {report.unit.name}</p>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Subtree ({report.subtreeSize} units)</p>
                {Object.entries(report.countsByLevel).map(([lvl, n]) => <div key={lvl} className="flex justify-between text-xs"><span>{lvl}</span><span className="font-mono">{n as number}</span></div>)}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Headcount</p>
                <div className="flex justify-between text-xs"><span>Total (rolled up)</span><span className="font-mono">{report.headcount.total}</span></div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Effective localization (inherited)</p>
                <div className="text-xs space-y-0.5">
                  <div className="flex justify-between"><span>Currency</span><span className="font-mono">{report.effectiveLocalization.currency || "—"}</span></div>
                  <div className="flex justify-between"><span>Language</span><span className="font-mono">{report.effectiveLocalization.language || "—"}</span></div>
                  <div className="flex justify-between"><span>Timezone</span><span className="font-mono">{report.effectiveLocalization.timezone || "—"}</span></div>
                  <div className="flex justify-between"><span>Tax regime</span><span className="font-mono">{report.effectiveLocalization.taxRegime || "—"}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
