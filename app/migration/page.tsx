"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AuthSplash } from "@/components/dashboard/AuthSplash";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { toast } from "sonner";
import {
  DatabaseZap,
  Upload,
  Wand2,
  ShieldCheck,
  Eye,
  Rocket,
  Undo2,
  Loader2,
  Trash2,
  ChevronRight,
} from "lucide-react";

/**
 * Universal ERP Migration Platform (vNext Expansion Module 1).
 *
 * A guided wizard: upload a legacy export (Tally/Zoho/SAP/Excel/CSV/JSON/XML),
 * let AI map its columns to Aupulens fields, validate integrity, sandbox-preview
 * the outcome, import, and roll back if wrong. All operations are tenant-scoped
 * server-side by /api/migration/*.
 */

const SOURCE_SYSTEMS: { value: string; label: string }[] = [
  { value: "tally", label: "Tally Prime" },
  { value: "zoho", label: "Zoho" },
  { value: "sap_b1", label: "SAP Business One" },
  { value: "netsuite", label: "Oracle NetSuite" },
  { value: "dynamics", label: "MS Dynamics" },
  { value: "erpnext", label: "ERPNext" },
  { value: "odoo", label: "Odoo" },
  { value: "busy", label: "Busy" },
  { value: "marg", label: "Marg ERP" },
  { value: "quickbooks", label: "QuickBooks" },
  { value: "excel", label: "Excel / CSV" },
  { value: "json", label: "JSON" },
  { value: "xml", label: "XML" },
  { value: "other", label: "Other" },
];

const ENTITIES = [
  { value: "customer", label: "Customers" },
  { value: "vendor", label: "Vendors" },
  { value: "product", label: "Products" },
];

const STATUS_LABEL: Record<string, string> = {
  created: "Uploaded",
  mapped: "Mapped",
  validated: "Validated",
  previewed: "Previewed",
  imported: "Imported",
  rolled_back: "Rolled back",
  failed: "Failed",
};

interface JobSummary {
  _id: string;
  name: string;
  sourceSystem: string;
  entityType: string;
  status: string;
  fileName: string;
  totalRows: number;
  createdAt: string;
}

interface TargetField {
  key: string;
  label: string;
  required: boolean;
}

interface JobDetail extends JobSummary {
  columns: string[];
  mapping: Record<string, string>;
  targetFields: TargetField[];
  rowSample: Record<string, unknown>[];
  aiMappingUsed?: boolean;
  validation?: { errorCount: number; warningCount: number; duplicateCount: number };
  preview?: { willCreate: number; willSkip: number };
  result?: { created: number; failed: number };
}

export default function MigrationPage() {
  const { data: session, status } = useSession();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<JobDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // New-job form
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [sourceSystem, setSourceSystem] = useState("tally");
  const [entityType, setEntityType] = useState("customer");

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/migration/jobs");
      const json = await res.json();
      if (json.success) setJobs(json.data);
    } catch {
      toast.error("Failed to load migration jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const openJob = async (id: string) => {
    try {
      const res = await fetch(`/api/migration/jobs/${id}`);
      const json = await res.json();
      if (json.success) setSelected(json.data);
      else toast.error("Failed to open job");
    } catch {
      toast.error("Failed to open job");
    }
  };

  const createJob = async () => {
    if (!file) return toast.error("Choose a file to upload");
    if (!name.trim()) return toast.error("Give this migration a name");
    setBusy("create");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name.trim());
      fd.append("sourceSystem", sourceSystem);
      fd.append("entityType", entityType);
      const res = await fetch("/api/migration/jobs", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.success) return toast.error(json.message || "Upload failed");
      toast.success(`Parsed ${json.data.totalRows} rows`);
      setFile(null);
      setName("");
      await loadJobs();
      await openJob(json.data._id);
    } catch {
      toast.error("Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const suggest = async () => {
    if (!selected) return;
    setBusy("suggest");
    try {
      const res = await fetch(`/api/migration/jobs/${selected._id}/suggest-mapping`, { method: "POST" });
      const json = await res.json();
      if (!json.success) return toast.error(json.message || "Mapping failed");
      toast.success(json.data.aiUsed ? "AI-assisted mapping applied" : "Auto-mapping applied");
      await openJob(selected._id);
    } finally {
      setBusy(null);
    }
  };

  const setMap = (fieldKey: string, column: string) => {
    if (!selected) return;
    const mapping = { ...selected.mapping };
    if (column) mapping[fieldKey] = column;
    else delete mapping[fieldKey];
    setSelected({ ...selected, mapping });
  };

  const saveMapping = async () => {
    if (!selected) return;
    setBusy("save");
    try {
      const res = await fetch(`/api/migration/jobs/${selected._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping: selected.mapping }),
      });
      const json = await res.json();
      if (!json.success) return toast.error(json.message || "Save failed");
      toast.success("Mapping saved");
      await openJob(selected._id);
      await loadJobs();
    } finally {
      setBusy(null);
    }
  };

  const runAction = async (action: "validate" | "preview" | "execute" | "rollback") => {
    if (!selected) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/migration/jobs/${selected._id}/${action}`, { method: "POST" });
      const json = await res.json();
      if (!json.success) return toast.error(json.message || `${action} failed`);
      if (action === "validate") toast.success(`${json.data.errorCount} errors, ${json.data.warningCount} warnings`);
      if (action === "preview") toast.success(`Will create ${json.data.willCreate}, skip ${json.data.willSkip}`);
      if (action === "execute") toast.success(`Imported ${json.data.created}, skipped ${json.data.failed}`);
      if (action === "rollback") toast.success(`Rolled back ${json.data.deleted} records`);
      await openJob(selected._id);
      await loadJobs();
    } finally {
      setBusy(null);
    }
  };

  const deleteJob = async (id: string) => {
    if (!confirm("Delete this migration job? (Imported records are not affected unless you roll back first.)")) return;
    const res = await fetch(`/api/migration/jobs/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.success) return toast.error(json.message || "Delete failed");
    if (selected?._id === id) setSelected(null);
    await loadJobs();
  };

  const requiredUnmapped =
    selected?.targetFields.filter((f) => f.required && !selected.mapping[f.key]) ?? [];

  if (status === "loading") return <AuthSplash />;

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      dashboardTitle="Admin"
      pageName="Data Migration"
      breadcrumbs={[{ label: "Admin", href: "/admin/dashboard" }, { label: "Data Migration" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={(session?.user as any)?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
      onRefresh={loadJobs}
    >
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <DatabaseZap className="h-6 w-6 text-emerald-500" /> Data Migration
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Move data in from Tally, Zoho, SAP, Excel and more — AI maps the fields, you preview before anything is written, and every import is reversible.
        </p>
      </div>

      {/* New migration */}
      <div className="rounded-xl border bg-card p-4 mb-6">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Upload className="h-4 w-4" /> New migration
        </h2>
        <div className="grid gap-3 md:grid-cols-4">
          <input
            className="border rounded-md px-3 py-2 bg-background text-sm md:col-span-1"
            placeholder="Migration name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select className="border rounded-md px-3 py-2 bg-background text-sm" value={sourceSystem} onChange={(e) => setSourceSystem(e.target.value)}>
            {SOURCE_SYSTEMS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select className="border rounded-md px-3 py-2 bg-background text-sm" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            {ENTITIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <input
            type="file"
            accept=".csv,.tsv,.xls,.xlsx,.json,.xml"
            className="text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <button
          onClick={createJob}
          disabled={busy === "create"}
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload & parse
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-[320px_1fr]">
        {/* Jobs list */}
        <div className="rounded-xl border bg-card p-3">
          <h2 className="font-semibold mb-2 px-1">Migrations</h2>
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : jobs.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No migrations yet. Upload a file above to begin.</p>
          ) : (
            <ul className="space-y-1">
              {jobs.map((j) => (
                <li key={j._id}>
                  <button
                    onClick={() => openJob(j._id)}
                    className={`w-full text-left rounded-md px-3 py-2 text-sm hover:bg-accent flex items-center justify-between gap-2 ${selected?._id === j._id ? "bg-accent" : ""}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{j.name}</span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {j.entityType} · {j.totalRows} rows · {STATUS_LABEL[j.status] ?? j.status}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Selected job wizard */}
        <div className="rounded-xl border bg-card p-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Select a migration to map fields, validate, preview and import.</p>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-lg">{selected.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {selected.fileName} · {selected.totalRows} rows · status: {STATUS_LABEL[selected.status] ?? selected.status}
                  </p>
                </div>
                <button onClick={() => deleteJob(selected._id)} className="text-muted-foreground hover:text-red-500" title="Delete job">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Step 1: mapping */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-sm">1 · Map fields</h3>
                  <button onClick={suggest} disabled={!!busy} className="inline-flex items-center gap-1 text-xs rounded-md border px-2 py-1 hover:bg-accent disabled:opacity-50">
                    {busy === "suggest" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} Auto-map with AI
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-1 pr-4">Aupulens field</th>
                        <th className="py-1">Source column</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.targetFields.map((f) => (
                        <tr key={f.key} className="border-t">
                          <td className="py-1.5 pr-4">
                            {f.label} {f.required && <span className="text-red-500">*</span>}
                          </td>
                          <td className="py-1.5">
                            <select
                              className="border rounded-md px-2 py-1 bg-background text-sm w-full max-w-xs"
                              value={selected.mapping[f.key] ?? ""}
                              onChange={(e) => setMap(f.key, e.target.value)}
                            >
                              <option value="">— not mapped —</option>
                              {selected.columns.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {requiredUnmapped.length > 0 && (
                  <p className="text-xs text-amber-600 mt-2">
                    Map required field(s): {requiredUnmapped.map((f) => f.label).join(", ")}
                  </p>
                )}
                <button onClick={saveMapping} disabled={!!busy} className="mt-3 inline-flex items-center gap-1 text-sm rounded-md border px-3 py-1.5 hover:bg-accent disabled:opacity-50">
                  {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save mapping
                </button>
              </section>

              {/* Step 2-5: actions */}
              <section className="grid gap-3 sm:grid-cols-2">
                <ActionCard
                  icon={<ShieldCheck className="h-4 w-4" />}
                  title="2 · Validate"
                  desc="Check required fields, GSTIN/state codes, duplicates."
                  onClick={() => runAction("validate")}
                  busy={busy === "validate"}
                  disabled={!!busy || requiredUnmapped.length > 0}
                  result={selected.validation && `${selected.validation.errorCount} errors · ${selected.validation.warningCount} warnings · ${selected.validation.duplicateCount} dup`}
                />
                <ActionCard
                  icon={<Eye className="h-4 w-4" />}
                  title="3 · Preview (sandbox)"
                  desc="Dry run — counts create vs skip, writes nothing."
                  onClick={() => runAction("preview")}
                  busy={busy === "preview"}
                  disabled={!!busy || requiredUnmapped.length > 0}
                  result={selected.preview && `will create ${selected.preview.willCreate} · skip ${selected.preview.willSkip}`}
                />
                <ActionCard
                  icon={<Rocket className="h-4 w-4" />}
                  title="4 · Import"
                  desc="Write records to your workspace."
                  onClick={() => runAction("execute")}
                  busy={busy === "execute"}
                  disabled={!!busy || requiredUnmapped.length > 0 || selected.status === "imported"}
                  result={selected.result && `created ${selected.result.created} · failed ${selected.result.failed}`}
                  primary
                />
                <ActionCard
                  icon={<Undo2 className="h-4 w-4" />}
                  title="5 · Rollback"
                  desc="Delete exactly what this job imported."
                  onClick={() => runAction("rollback")}
                  busy={busy === "rollback"}
                  disabled={!!busy || selected.status !== "imported"}
                />
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}

function ActionCard({ icon, title, desc, onClick, busy, disabled, result, primary }: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
  result?: string | false;
  primary?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 font-medium text-sm">{icon} {title}</div>
      <p className="text-xs text-muted-foreground flex-1">{desc}</p>
      {result && <p className="text-xs font-medium text-emerald-600">{result}</p>}
      <button
        onClick={onClick}
        disabled={disabled}
        className={`inline-flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${primary ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "border hover:bg-accent"}`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run"}
      </button>
    </div>
  );
}
