"use client";

import { useEffect, useState, useCallback, use, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AuthSplash } from "@/components/dashboard/AuthSplash";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Play, AlertTriangle, DatabaseZap } from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { PreviewAndResolution } from "@/components/migration/PreviewAndResolution";
import { InvalidRecordsEditor } from "@/components/migration/InvalidRecordsEditor";
import { AupulensPreview } from "@/components/migration/AupulensPreview";

const STEPS = [
  "UPLOAD",
  "ANALYSIS",
  "MAPPING",
  "VALIDATION",
  "PREVIEW",
  "CONFIRM",
  "MIGRATION",
  "REPORT"
];

function getStepIndex(status: string) {
  if (status === "analyzing") return 1;
  if (status === "mapping") return 2;
  if (status === "validating") return 3;
  if (status === "preview") return 4;
  if (status === "running") return 6;
  if (status === "completed" || status === "verified") return 7;
  if (status === "failed") return 6;
  return 0;
}

function batchErrorMessage(batch: any) {
  const firstError = Array.isArray(batch?.errors) ? batch.errors[0] : batch?.errors;
  if (typeof firstError === "string") return firstError;
  if (firstError?.message) return firstError.message;
  return "Migration failed. Please review the batch and try again.";
}

export default function MigrationWizardPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const { data: session, status: sessionStatus } = useSession();
  const [batch, setBatch] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingMappings, setFetchingMappings] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const notifiedStatusRef = useRef<string | null>(null);
  const router = useRouter();

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/migration/batches/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.message || "Failed to load migration batch");
        return;
      }

      const nextBatch = json.data.batch;
      setBatch(nextBatch);
      setJobs(json.data.jobs);

      if (nextBatch.status !== notifiedStatusRef.current) {
        if (nextBatch.status === "failed") {
          toast.error(batchErrorMessage(nextBatch));
          notifiedStatusRef.current = nextBatch.status;
        } else if (nextBatch.status === "completed" || nextBatch.status === "verified") {
          toast.success(nextBatch.status === "verified" ? "Migration verified and completed." : "Migration completed.");
          notifiedStatusRef.current = nextBatch.status;
        }
      }
        
      // If it's mapping state and we don't have mappings yet, fetch them
      if (nextBatch.status === "mapping" && mappings.length === 0) {
        fetchMappings();
      }
    } catch {
      toast.error("Failed to load batch");
    } finally {
      setLoading(false);
    }
  }, [id, mappings.length]);

  const fetchMappings = async () => {
    setFetchingMappings(true);
    try {
      const res = await fetch(`/api/migration/batches/${id}/mapping`);
      const json = await res.json();
      if (res.ok && json.success) {
        setMappings(json.data);
      } else {
        toast.error(json.message || "Failed to load suggested mappings");
      }
    } catch {
      toast.error("Failed to load suggested mappings");
    } finally {
      setFetchingMappings(false);
    }
  };

  // Polling for background tasks
  useEffect(() => {
    if (!batch) return;
    if (batch.status === "validating" || batch.status === "running") {
      const interval = setInterval(loadData, 2000); // UI poll
      return () => clearInterval(interval);
    }
  }, [batch?.status, loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleInvalidResolved = async () => {
    // If we resolved invalid records, we should let the worker process them.
    // The easiest way is to restart the worker loop or change batch state
    // But actually, changing record to 'pending' is enough, we just need to restart validation loop
    toast.success("Validation re-running for updated records...");
    await fetch(`/api/migration/batches/${id}/mapping`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobMappings: mappings.map(m => ({ jobId: m.jobId, mapping: m.mapping })) }) });
    loadData();
  };

  const saveMapping = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/migration/batches/${id}/mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobMappings: mappings.map(m => ({ jobId: m.jobId, mapping: m.mapping })) })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Mappings saved. Starting validation...");
        loadData();
      } else {
        toast.error(data.message || "Failed to save mappings.");
      }
    } catch {
      toast.error("Failed to save mappings.");
    } finally {
      setSaving(false);
    }
  };

  const startMigration = () => {
    setShowConfirmModal(true);
  };

  const executeMigration = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/migration/batches/${id}/start`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success("Migration started!");
        await loadData();
      } else {
        toast.error(data.message || "Failed to start migration.");
      }
    } catch {
      toast.error("Failed to start migration.");
    } finally {
      setBusy(false);
      setShowConfirmModal(false);
    }
  };

  if (sessionStatus === "loading" || loading) return <AuthSplash />;
  if (!batch) return <div>Batch not found</div>;

  const currentStep = getStepIndex(batch.status);

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      dashboardTitle="Admin"
      pageName="Migration Center"
      breadcrumbs={[
        { label: "Admin", href: "/admin/dashboard" },
        { label: "Migration Center", href: "/migration" },
        { label: `Batch ${id.slice(-6)}` }
      ]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={(session?.user as any)?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
      onRefresh={loadData}
    >
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Progress Stepper */}
        <div className="flex items-center justify-between border-b pb-4">
          {STEPS.map((step, idx) => (
            <div key={step} className={`flex flex-col items-center gap-1 ${idx <= currentStep ? 'text-emerald-600' : 'text-muted-foreground opacity-50'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${idx < currentStep ? 'bg-emerald-600 text-white' : idx === currentStep ? 'border-2 border-emerald-600 text-emerald-600' : 'border-2 border-muted-foreground'}`}>
                {idx < currentStep ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
              </div>
              <span className="text-xs font-medium">{step}</span>
            </div>
          ))}
        </div>

        {/* Status Header */}
        <div className="bg-card border rounded-xl p-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Batch Migration <span className="text-muted-foreground font-mono">#{id.slice(-6)}</span></h2>
            <p className="text-sm text-muted-foreground mt-1">Source: {batch.sourceSystem.toUpperCase()} • {batch.totalFiles} files • {batch.totalRecords} records</p>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold capitalize text-emerald-600">{batch.status}</div>
            <div className="text-xs text-muted-foreground">Started {format(new Date(batch.createdAt), "PPp")}</div>
          </div>
        </div>

        {/* Dynamic Content based on Status */}
        {batch.status === "mapping" && (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Field Mapping</h3>
            {fetchingMappings && mappings.length === 0 && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/> Generating AI suggestions...</div>}
            
            {mappings.map((m, idx) => {
              const job = jobs.find(j => j._id === m.jobId);
              return (
                <div key={m.jobId} className="border rounded-lg p-4 bg-card">
                  <div className="font-medium flex items-center justify-between mb-3">
                    <span>{job?.fileName} <span className="text-muted-foreground text-sm font-normal">({job?.entityType})</span></span>
                    {m.aiUsed && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">✨ AI Mapped</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm max-h-[300px] overflow-y-auto pr-2">
                    {/* Just displaying raw mappings since schema isn't fully loaded here for brevity. 
                        In a full app we'd load target schema fields and map them to columns like the old page. */}
                    {Object.entries(m.mapping).map(([target, source]) => (
                      <div key={target} className="flex items-center justify-between border-b py-1">
                        <span className="font-medium text-slate-700">{target}</span>
                        <span className="text-slate-500 text-right">{source as string}</span>
                      </div>
                    ))}
                    {Object.keys(m.mapping).length === 0 && <p className="text-muted-foreground col-span-2">No mappings found.</p>}
                  </div>
                </div>
              );
            })}
            
            <div className="flex justify-end pt-2">
              <button onClick={saveMapping} disabled={saving || fetchingMappings || mappings.length === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-md font-medium text-sm flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save & Validate
              </button>
            </div>
          </div>
        )}

        {(batch.status === "validating" || batch.status === "running") && (
          <div className="border rounded-xl p-8 bg-card flex flex-col items-center justify-center space-y-4 text-center">
            <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
            <h3 className="text-xl font-semibold capitalize">{batch.status} records...</h3>
            <div className="w-full max-w-md bg-secondary rounded-full h-3">
              <div className="bg-emerald-500 h-3 rounded-full transition-all duration-500" style={{ width: `${batch.progress || 0}%` }}></div>
            </div>
            <p className="text-sm text-muted-foreground">{batch.progress || 0}% Complete</p>
            <p className="text-xs text-muted-foreground">This is running in the background. You can safely leave this page.</p>
          </div>
        )}

        {batch.status === "failed" && (
          <div className="border border-rose-500/30 rounded-xl p-6 bg-rose-500/10">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-rose-500 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-rose-500">Migration failed</h3>
                <p className="text-sm text-muted-foreground mt-1">{batchErrorMessage(batch)}</p>
              </div>
            </div>
          </div>
        )}

        {batch.status === "preview" && (
          <div className="space-y-6">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5">
              <h3 className="text-blue-500 font-semibold mb-2 flex items-center gap-2"><Play className="w-4 h-4" /> Ready for Migration</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Validation complete. Please review the summary below before executing the migration to the live database.
              </p>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-card p-3 rounded-lg border">
                  <div className="text-sm text-muted-foreground">Valid Records</div>
                  <div className="text-2xl font-bold text-emerald-500">{batch.summary?.valid || 0}</div>
                </div>
                <div className="bg-card p-3 rounded-lg border">
                  <div className="text-sm text-muted-foreground">Duplicates</div>
                  <div className="text-2xl font-bold text-amber-500">{batch.summary?.duplicate || 0}</div>
                </div>
                <div className="bg-card p-3 rounded-lg border">
                  <div className="text-sm text-muted-foreground">Invalid Records</div>
                  <div className="text-2xl font-bold text-red-500">{batch.summary?.invalid || 0}</div>
                </div>
              </div>
            </div>
            
            <InvalidRecordsEditor batchId={id} onResolved={handleInvalidResolved} showInitialLoader={false} />
            <PreviewAndResolution batchId={id} />
            <AupulensPreview batchId={id} showInitialLoader={false} />

            <div className="flex justify-end pt-2">
              <button onClick={startMigration} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-md font-bold shadow flex items-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} START MIGRATION
              </button>
            </div>
          </div>
        )}

        {(batch.status === "completed" || batch.status === "verified") && (
          <div className="space-y-6">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
              <h3 className="text-emerald-800 font-bold text-xl mb-1">
                {batch.status === "verified" ? "Migration Verified & Completed" : "Migration Completed"}
              </h3>
              <p className="text-emerald-900 text-sm">
                The batch was successfully processed.
                {batch.summary?.verification?.status === "FAIL" && " Some post-migration verifications failed. Please check the reports."}
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 max-w-2xl mx-auto">
                <div className="bg-card p-4 rounded-lg border text-center">
                  <div className="text-sm text-muted-foreground">Successfully Migrated</div>
                  <div className="text-3xl font-bold text-emerald-600">{batch.summary?.migrated || 0}</div>
                </div>
                <div className="bg-card p-4 rounded-lg border text-center">
                  <div className="text-sm text-muted-foreground">Failed</div>
                  <div className="text-3xl font-bold text-rose-600">{batch.summary?.failed || 0}</div>
                </div>
            </div>
            
            <div className="flex justify-center mt-6">
              <a 
                href={`/api/migration/batches/${id}/report/download`}
                target="_blank"
                className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-2 rounded-md shadow text-sm font-medium transition-colors"
              >
                Download CSV Report
              </a>
            </div>
          </div>
        )}

      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border shadow-xl rounded-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <DatabaseZap className="w-5 h-5 text-emerald-500" />
                </div>
                <h3 className="text-xl font-bold">Start Migration?</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Are you sure you want to write these records to your workspace? This action will create real data in your live database.
              </p>
              
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  disabled={busy}
                  className="px-4 py-2 rounded-md border bg-transparent hover:bg-accent text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={executeMigration}
                  disabled={busy}
                  className="px-6 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-md text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm & Start
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
