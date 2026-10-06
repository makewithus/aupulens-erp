"use client";

import { useEffect, useState, useCallback, use, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { AuthSplash } from "@/components/dashboard/AuthSplash";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Play, AlertTriangle, DatabaseZap, Download, FileText } from "lucide-react";
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
  if (status === "verifying") return 6;
  if (status === "completed" || status === "verified") return 7;
  if (status === "failed") return 6;
  return 0;
}

function batchStatusCopy(status: string) {
  if (status === "analyzing") {
    return {
      label: "Analyzing upload",
      description: "Reading files and preparing field mapping.",
    };
  }
  if (status === "mapping") {
    return {
      label: "Mapping required",
      description: "Review the detected fields and save mapping to validate records.",
    };
  }
  if (status === "validating") {
    return {
      label: "Validating records",
      description: "Checking required fields, relationships, and duplicates before preview.",
    };
  }
  if (status === "preview") {
    return {
      label: "Ready for migration",
      description: "Validation is complete. Review the preview before writing live data.",
    };
  }
  if (status === "running") {
    return {
      label: "Migrating data",
      description: "Writing approved records to the live workspace in the background.",
    };
  }
  if (status === "verifying") {
    return {
      label: "Verifying migrated data",
      description: "Records have been written. Aupulens is checking source and target counts before the final report.",
    };
  }
  if (status === "verified") {
    return {
      label: "Verified and completed",
      description: "Migration finished and post-migration verification passed.",
    };
  }
  if (status === "completed") {
    return {
      label: "Migration completed",
      description: "Migration finished. Review the report for verification details.",
    };
  }
  if (status === "failed") {
    return {
      label: "Migration failed",
      description: "The batch stopped before completion. Review the error below.",
    };
  }
  return {
    label: status || "Pending",
    description: "Preparing the migration batch.",
  };
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
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);
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

  const tickWorker = useCallback(async () => {
    try {
      await fetch(`/api/migration/batches/${id}/worker`, { method: "POST" });
    } catch {
      // The next poll will surface any persisted worker failure from the batch.
    }
  }, [id]);

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
    if (batch.status === "validating" || batch.status === "running" || batch.status === "verifying") {
      const poll = async () => {
        if (batch.status === "validating" || batch.status === "running") {
          await tickWorker();
        }
        await loadData();
      };
      poll();
      const interval = setInterval(poll, 2000); // UI poll + production-safe worker tick
      return () => clearInterval(interval);
    }
  }, [batch?.status, loadData, tickWorker]);

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
        await tickWorker();
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
        await tickWorker();
        await loadData();
      } else {
        toast.error(data.message || "Failed to start migration.");
        setReviewRefreshKey((current) => current + 1);
        await loadData();
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
  const statusCopy = batchStatusCopy(batch.status);

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
      <div className="max-w-7xl mx-auto space-y-6">
        
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
            <p className="text-xs text-muted-foreground mt-2">{statusCopy.description}</p>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-emerald-600">{statusCopy.label}</div>
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

        {(batch.status === "validating" || batch.status === "running" || batch.status === "verifying") && (
          <div className="border rounded-xl p-8 bg-card flex flex-col items-center justify-center space-y-4 text-center">
            <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
            <h3 className="text-xl font-semibold">{statusCopy.label}</h3>
            <div className="w-full max-w-md bg-secondary rounded-full h-3">
              <div className="bg-emerald-500 h-3 rounded-full transition-all duration-500" style={{ width: `${batch.progress || 0}%` }}></div>
            </div>
            <p className="text-sm text-muted-foreground">{batch.progress || 0}% Complete</p>
            <p className="text-xs text-muted-foreground max-w-lg">{statusCopy.description} This is running in the background. You can safely leave this page.</p>
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
            
            <InvalidRecordsEditor key={`invalid-${reviewRefreshKey}`} batchId={id} onResolved={handleInvalidResolved} showInitialLoader={false} />
            <PreviewAndResolution key={`duplicates-${reviewRefreshKey}`} batchId={id} onResolved={loadData} />
            <AupulensPreview key={`preview-${reviewRefreshKey}`} batchId={id} showInitialLoader={false} />

            <div className="flex justify-end pt-2">
              <button onClick={startMigration} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-md font-bold shadow flex items-center gap-2">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} START MIGRATION
              </button>
            </div>
          </div>
        )}

        {(batch.status === "completed" || batch.status === "verified") && (
          <div className="space-y-6">
            <div className={`${batch.summary?.failed > 0 ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200"} border rounded-xl p-5 text-center`}>
              {batch.summary?.failed > 0 ? (
                <AlertTriangle className="w-12 h-12 text-rose-600 mx-auto mb-3" />
              ) : (
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
              )}
              <h3 className={`${batch.summary?.failed > 0 ? "text-rose-800" : "text-emerald-800"} font-bold text-xl mb-1`}>
                {batch.summary?.failed > 0 ? "Migration Completed With Failures" : batch.status === "verified" ? "Migration Verified & Completed" : "Migration Completed"}
              </h3>
              <p className={`${batch.summary?.failed > 0 ? "text-rose-900" : "text-emerald-900"} text-sm`}>
                {batch.summary?.failed > 0
                  ? "Some records failed during migration. Download the report and resolve the failed rows before treating this import as complete."
                  : "The batch was successfully processed."}
                {batch.summary?.failed === 0 && batch.summary?.verification?.status === "FAIL" && " Some post-migration verifications failed. Please check the reports."}
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

            <div className="bg-card border rounded-xl overflow-hidden">
              <div className="border-b p-5">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <FileText className="h-5 w-5 text-emerald-600" /> Migration Report
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Final import summary, source-to-target verification, and downloadable audit files.
                </p>
              </div>

              <div className="grid gap-4 p-5 md:grid-cols-4">
                <div className="rounded-lg border bg-background p-4">
                  <div className="text-xs uppercase text-muted-foreground">Total Records</div>
                  <div className="mt-1 text-2xl font-bold">{batch.totalRecords || 0}</div>
                </div>
                <div className="rounded-lg border bg-background p-4">
                  <div className="text-xs uppercase text-muted-foreground">Valid</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-600">{batch.summary?.valid || 0}</div>
                </div>
                <div className="rounded-lg border bg-background p-4">
                  <div className="text-xs uppercase text-muted-foreground">Migrated</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-600">{batch.summary?.migrated || 0}</div>
                </div>
                <div className="rounded-lg border bg-background p-4">
                  <div className="text-xs uppercase text-muted-foreground">Failed</div>
                  <div className="mt-1 text-2xl font-bold text-rose-600">{batch.summary?.failed || 0}</div>
                </div>
              </div>

              {Array.isArray(batch.summary?.verification?.sourceVsTarget) && batch.summary.verification.sourceVsTarget.length > 0 && (
                <div className="px-5 pb-5">
                  <div className="max-h-[360px] overflow-auto rounded-lg border">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="sticky top-0 bg-secondary text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Entity</th>
                          <th className="px-4 py-3 font-semibold">Source</th>
                          <th className="px-4 py-3 font-semibold">Target</th>
                          <th className="px-4 py-3 font-semibold">Failed</th>
                          <th className="px-4 py-3 font-semibold">Orphans</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batch.summary.verification.sourceVsTarget.map((row: any) => (
                          <tr key={row.entity} className="border-t">
                            <td className="px-4 py-3 font-medium">{row.entity}</td>
                            <td className="px-4 py-3">{row.sourceCount || 0}</td>
                            <td className="px-4 py-3">{row.targetCount || 0}</td>
                            <td className="px-4 py-3">{row.failedCount || 0}</td>
                            <td className="px-4 py-3">{row.orphanCount || 0}</td>
                            <td className={`px-4 py-3 font-semibold ${row.status === "PASS" ? "text-emerald-600" : "text-rose-600"}`}>
                              {row.status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            
              <div className="flex flex-wrap justify-center gap-3 border-t p-5">
                <a 
                  href={`/api/migration/batches/${id}/report/download`}
                  target="_blank"
                  className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-6 py-2 text-sm font-medium text-white shadow transition-colors hover:bg-slate-900"
                >
                  <Download className="h-4 w-4" /> Download CSV Report
                </a>
                <a
                  href={`/api/migration/batches/${id}/report`}
                  target="_blank"
                  className="inline-flex items-center gap-2 rounded-md border bg-background px-6 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <FileText className="h-4 w-4" /> Download Text Report
                </a>
              </div>
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
