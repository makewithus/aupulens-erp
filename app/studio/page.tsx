"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AuthSplash } from "@/components/dashboard/AuthSplash";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { toast } from "sonner";
import {
  Workflow as WorkflowIcon,
  Plus,
  Play,
  Loader2,
  Trash2,
  Power,
  History,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from "lucide-react";

/**
 * Aupulens Studio (vNext Expansion Module 5 — Visual ERP Builder).
 * Build cross-module automations: pick a trigger, add conditions, chain action
 * steps, test-run with a sample payload, and inspect run history. All backed by
 * a real execution engine (/api/studio/*), tenant-scoped server-side.
 */

interface Condition { field: string; operator: string; value?: string }
interface Step { type: string; params: Record<string, string> }
interface WF {
  _id: string; name: string; description?: string; triggerType: string; eventKey?: string;
  conditions: Condition[]; steps: Step[]; enabled: boolean; version: number; lastRunAt?: string;
}
interface ActionSpec { type: string; label: string; description: string; params: { key: string; label: string; required: boolean; placeholder?: string }[] }
interface Catalog { triggerTypes: string[]; events: { key: string; label: string }[]; operators: string[]; actions: ActionSpec[] }
interface RunRow { _id: string; status: string; trigger: string; conditionsMet: boolean; stepResults: { index: number; type: string; status: string; message?: string }[]; createdAt: string; error?: string }

const RUN_ICON: Record<string, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  partial: <MinusCircle className="h-4 w-4 text-amber-500" />,
  skipped: <MinusCircle className="h-4 w-4 text-muted-foreground" />,
};

const blankWF = (): WF => ({ _id: "", name: "", description: "", triggerType: "manual", eventKey: "", conditions: [], steps: [], enabled: false, version: 1 });

export default function StudioPage() {
  const { data: session, status } = useSession();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [list, setList] = useState<WF[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<WF | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [samplePayload, setSamplePayload] = useState('{\n  "name": "Acme Corp",\n  "amount": 50000\n}');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, wfs] = await Promise.all([
        fetch("/api/studio/catalog").then((r) => r.json()),
        fetch("/api/studio/workflows").then((r) => r.json()),
      ]);
      if (cat.success) setCatalog(cat.data);
      if (wfs.success) setList(wfs.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openRuns = async (id: string) => {
    const res = await fetch(`/api/studio/workflows/${id}/runs`);
    const json = await res.json();
    if (json.success) setRuns(json.data);
  };

  const edit = (wf: WF) => {
    setDraft(JSON.parse(JSON.stringify(wf)));
    openRuns(wf._id);
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return toast.error("Name is required");
    setBusy("save");
    try {
      const isNew = !draft._id;
      const res = await fetch(isNew ? "/api/studio/workflows" : `/api/studio/workflows/${draft._id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!json.success) return toast.error(json.message || "Save failed");
      toast.success(isNew ? "Workflow created" : `Saved (v${json.data.version})`);
      setDraft(json.data);
      await load();
    } finally { setBusy(null); }
  };

  const toggle = async (wf: WF) => {
    const res = await fetch(`/api/studio/workflows/${wf._id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !wf.enabled }),
    });
    const json = await res.json();
    if (json.success) { toast.success(json.data.enabled ? "Enabled" : "Disabled"); await load(); if (draft?._id === wf._id) setDraft(json.data); }
  };

  const del = async (id: string) => {
    if (!window.confirm("Delete this workflow and its run history?")) return;
    await fetch(`/api/studio/workflows/${id}`, { method: "DELETE" });
    if (draft?._id === id) setDraft(null);
    await load();
  };

  const testRun = async () => {
    if (!draft?._id) return toast.error("Save the workflow first");
    let payload = {};
    try { payload = JSON.parse(samplePayload); } catch { return toast.error("Sample payload is not valid JSON"); }
    setBusy("run");
    try {
      const res = await fetch(`/api/studio/workflows/${draft._id}/run`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload }),
      });
      const json = await res.json();
      if (!json.success) return toast.error(json.message || "Run failed");
      toast.success(`Run: ${json.data.status}`);
      await openRuns(draft._id);
    } finally { setBusy(null); }
  };

  // draft mutation helpers
  const setD = (patch: Partial<WF>) => draft && setDraft({ ...draft, ...patch });
  const addCondition = () => draft && setDraft({ ...draft, conditions: [...draft.conditions, { field: "payload.", operator: "equals", value: "" }] });
  const setCondition = (i: number, patch: Partial<Condition>) => draft && setDraft({ ...draft, conditions: draft.conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c) });
  const rmCondition = (i: number) => draft && setDraft({ ...draft, conditions: draft.conditions.filter((_, idx) => idx !== i) });
  const addStep = (type: string) => { if (!draft) return; setDraft({ ...draft, steps: [...draft.steps, { type, params: {} }] }); };
  const setStepParam = (i: number, key: string, val: string) => draft && setDraft({ ...draft, steps: draft.steps.map((s, idx) => idx === i ? { ...s, params: { ...s.params, [key]: val } } : s) });
  const rmStep = (i: number) => draft && setDraft({ ...draft, steps: draft.steps.filter((_, idx) => idx !== i) });

  if (status === "loading") return <AuthSplash />;

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      dashboardTitle="Admin"
      pageName="Aupulens Studio"
      breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Aupulens Studio" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={(session?.user as any)?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
      onRefresh={load}
    >
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><WorkflowIcon className="h-6 w-6 text-fuchsia-500" /> Aupulens Studio</h1>
          <p className="text-sm text-muted-foreground mt-1">Build automations: trigger → conditions → actions. Test them, then enable to run on live events.</p>
        </div>
        <button onClick={() => setDraft(blankWF())} className="inline-flex items-center gap-1 rounded-md bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-3 py-2 text-sm font-medium">
          <Plus className="h-4 w-4" /> New workflow
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        {/* List */}
        <div className="rounded-xl border bg-card p-3">
          <h2 className="font-semibold mb-2 px-1">Workflows</h2>
          {loading ? <div className="p-3 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          : list.length === 0 ? <p className="p-3 text-sm text-muted-foreground">None yet.</p>
          : (
            <ul className="space-y-1">
              {list.map((w) => (
                <li key={w._id} className="flex items-center gap-1">
                  <button onClick={() => edit(w)} className={`flex-1 text-left rounded-md px-3 py-2 text-sm hover:bg-accent ${draft?._id === w._id ? "bg-accent" : ""}`}>
                    <span className="block font-medium truncate">{w.name}</span>
                    <span className="block text-xs text-muted-foreground">{w.triggerType}{w.eventKey ? `:${w.eventKey}` : ""} · v{w.version} · {w.enabled ? "on" : "off"}</span>
                  </button>
                  <button onClick={() => toggle(w)} className={`px-1 ${w.enabled ? "text-emerald-500" : "text-muted-foreground"}`} title="Enable/disable"><Power className="h-3.5 w-3.5" /></button>
                  <button onClick={() => del(w._id)} className="px-1 text-muted-foreground hover:text-red-500" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Builder */}
        <div className="rounded-xl border bg-card p-4">
          {!draft ? <p className="text-sm text-muted-foreground">Select or create a workflow.</p> : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Name</label>
                  <input className="w-full border rounded-md px-3 py-2 bg-background text-sm" value={draft.name} onChange={(e) => setD({ name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Trigger</label>
                  <select className="w-full border rounded-md px-3 py-2 bg-background text-sm" value={draft.triggerType} onChange={(e) => setD({ triggerType: e.target.value })}>
                    <option value="manual">Manual / test</option>
                    <option value="event">On event</option>
                  </select>
                </div>
                {draft.triggerType === "event" && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium mb-1">Event key</label>
                    <input list="event-keys" className="w-full border rounded-md px-3 py-2 bg-background text-sm" value={draft.eventKey || ""} onChange={(e) => setD({ eventKey: e.target.value })} placeholder="e.g. customer.created" />
                    <datalist id="event-keys">{catalog?.events.map((ev) => <option key={ev.key} value={ev.key}>{ev.label}</option>)}</datalist>
                  </div>
                )}
              </div>

              {/* Conditions */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-sm">Conditions (all must pass)</h3>
                  <button onClick={addCondition} className="text-xs rounded-md border px-2 py-1 hover:bg-accent">+ Condition</button>
                </div>
                {draft.conditions.length === 0 && <p className="text-xs text-muted-foreground">No conditions — runs on every trigger.</p>}
                {draft.conditions.map((c, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 mb-2">
                    <input className="border rounded-md px-2 py-1 bg-background text-sm flex-1 min-w-[140px]" value={c.field} onChange={(e) => setCondition(i, { field: e.target.value })} placeholder="payload.field" />
                    <select className="border rounded-md px-2 py-1 bg-background text-sm" value={c.operator} onChange={(e) => setCondition(i, { operator: e.target.value })}>
                      {catalog?.operators.map((op) => <option key={op} value={op}>{op}</option>)}
                    </select>
                    <input className="border rounded-md px-2 py-1 bg-background text-sm flex-1 min-w-[100px]" value={c.value ?? ""} onChange={(e) => setCondition(i, { value: e.target.value })} placeholder="value" />
                    <button onClick={() => rmCondition(i)} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </section>

              {/* Steps */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-sm">Actions (run in order)</h3>
                  <select className="text-xs border rounded-md px-2 py-1 bg-background" value="" onChange={(e) => e.target.value && addStep(e.target.value)}>
                    <option value="">+ Add action…</option>
                    {catalog?.actions.map((a) => <option key={a.type} value={a.type}>{a.label}</option>)}
                  </select>
                </div>
                {draft.steps.length === 0 && <p className="text-xs text-muted-foreground">No actions yet.</p>}
                <div className="space-y-3">
                  {draft.steps.map((s, i) => {
                    const spec = catalog?.actions.find((a) => a.type === s.type);
                    return (
                      <div key={i} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">{i + 1}. {spec?.label || s.type}</span>
                          <button onClick={() => rmStep(i)} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{spec?.description}</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {spec?.params.map((p) => (
                            <div key={p.key}>
                              <label className="block text-xs mb-1">{p.label}{p.required && <span className="text-red-500">*</span>}</label>
                              <input className="w-full border rounded-md px-2 py-1 bg-background text-sm" value={s.params[p.key] ?? ""} placeholder={p.placeholder} onChange={(e) => setStepParam(i, p.key, e.target.value)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <div className="flex flex-wrap gap-2">
                <button onClick={save} disabled={!!busy} className="rounded-md bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-4 py-1.5 text-sm font-medium disabled:opacity-50">
                  {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : draft._id ? "Save changes" : "Create"}
                </button>
                {draft._id && (
                  <button onClick={() => toggle(draft)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">{draft.enabled ? "Disable" : "Enable"}</button>
                )}
              </div>

              {/* Test run */}
              {draft._id && (
                <section className="border-t pt-4">
                  <h3 className="font-medium text-sm mb-2">Test run</h3>
                  <textarea className="w-full border rounded-md px-3 py-2 bg-background text-xs font-mono" rows={4} value={samplePayload} onChange={(e) => setSamplePayload(e.target.value)} />
                  <button onClick={testRun} disabled={!!busy} className="mt-2 inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50">
                    {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run with sample
                  </button>
                </section>
              )}

              {/* Run history */}
              {draft._id && (
                <section className="border-t pt-4">
                  <h3 className="font-medium text-sm mb-2 flex items-center gap-1"><History className="h-4 w-4" /> Run history</h3>
                  {runs.length === 0 ? <p className="text-xs text-muted-foreground">No runs yet.</p> : (
                    <div className="space-y-2">
                      {runs.map((r) => (
                        <div key={r._id} className="rounded-lg border p-2 text-xs">
                          <div className="flex items-center gap-2">
                            {RUN_ICON[r.status]}
                            <span className="font-medium">{r.status}</span>
                            <span className="text-muted-foreground">{r.trigger}</span>
                            {!r.conditionsMet && <span className="text-muted-foreground">(conditions not met)</span>}
                            <span className="ml-auto text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
                          </div>
                          {r.stepResults.length > 0 && (
                            <ul className="mt-1 ml-6 list-disc text-muted-foreground">
                              {r.stepResults.map((sr) => <li key={sr.index}>{sr.type}: {sr.status}{sr.message ? ` — ${sr.message}` : ""}</li>)}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}
