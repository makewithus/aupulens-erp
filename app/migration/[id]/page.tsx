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
import { productionMigrationError } from "@/lib/migration/errors";

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
  if (typeof firstError === "string") return productionMigrationError(firstError);
  if (firstError?.message) return productionMigrationError(firstError.message);
  return "Migration failed. Please review the batch and try again.";
}

export default function MigrationWizardPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const { data: session, status: sessionStatus } = useSession();
  const [batch, setBatch] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [failedRecords, setFailedRecords] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingMappings, setFetchingMappings] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);
  const notifiedStatusRef = useRef<string | null>(null);
  const workerTickInFlightRef = useRef(false);
  const router = useRouter();

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/migration/batches/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        const message = json.message || "Failed to load migration batch.";
        setLoadError(message);
        toast.error(message);
        return;
      }

      setLoadError(null);
      const nextBatch = json.data.batch;
      setBatch(nextBatch);
      setJobs(json.data.jobs);
      setFailedRecords(Array.isArray(json.data.failedRecords) ? json.data.failedRecords : []);

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
      const message = "Failed to load migration batch. Please refresh and try again.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [id, mappings.length]);

  const tickWorker = useCallback(async () => {
    if (workerTickInFlightRef.current) return;
    workerTickInFlightRef.current = true;
    try {
      await fetch(`/api/migration/batches/${id}/worker`, { method: "POST" });
    } catch {
      // The next poll will surface any persisted worker failure from the batch.
    } finally {
      workerTickInFlightRef.current = false;
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
          void tickWorker();
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
    setBatch((current: any) => current ? { ...current, status: "validating", progress: Math.max(Number(current.progress || 0), 1) } : current);
    setReviewRefreshKey((current) => current + 1);
    toast.success("Validation started for updated records.");
    void tickWorker().then(loadData).catch(() => loadData());
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
        setBatch((current: any) => current ? { ...current, status: "validating", progress: 1 } : current);
        toast.success("Mappings saved. Validation started.");
        void tickWorker().then(loadData).catch(() => loadData());
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
      if (res.ok && data.success !== false) {
        setBatch((current: any) => current ? { ...current, status: "running", progress: 1 } : current);
        toast.success("Migration started!");
        void tickWorker().then(loadData).catch(() => loadData());
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

  const recoverFailedRecords = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/migration/batches/${id}/recover-failed`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Failed records reopened for review.");
        setReviewRefreshKey((current) => current + 1);
        await loadData();
      } else {
        toast.error(data.message || "Failed to reopen records.");
      }
    } catch {
      toast.error("Failed to reopen records.");
    } finally {
      setBusy(false);
    }
  };

  if (sessionStatus === "loading" || loading) return <AuthSplash />;
  if (!batch) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
          <h1 className="text-lg font-semibold">Migration batch unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {loadError || "This migration batch could not be loaded."}
          </p>
          <button
            type="button"
            onClick={() => router.push("/migration")}
            className="mt-5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            Back to migrations
          </button>
        </div>
      </div>
    );
  }

  const currentStep = getStepIndex(batch.status);
  const statusCopy = batchStatusCopy(batch.status);
  const activeProgress = Math.min(100, Math.max(Number(batch.progress || 0), (batch.status === "validating" || batch.status === "running" || batch.status === "verifying") ? 1 : 0));
  const processedEstimate = Math.min(Number(batch.totalRecords || 0), Math.floor((Number(batch.totalRecords || 0) * activeProgress) / 100));
  const unresolvedDuplicateCount = Number(batch.summary?.duplicate || 0);
  const invalidRecordCount = Number(batch.summary?.invalid || 0);
  const isMigrationClean = batch.status === "preview" && invalidRecordCount === 0 && unresolvedDuplicateCount === 0;

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
            {fetchingMappings && mappings.length === 0 && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/> Preparing field mappings...</div>}
            
            {mappings.map((m, idx) => {
              const job = jobs.find(j => j._id === m.jobId);
              return (
                <div key={m.jobId} className="border rounded-lg p-4 bg-card">
                  <div className="font-medium flex items-center justify-between mb-3">
                    <span>{job?.fileName} <span className="text-muted-foreground text-sm font-normal">({job?.entityType})</span></span>
                    {m.aiUsed && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">AI Mapped</span>}
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
              <div className="bg-emerald-500 h-3 rounded-full transition-all duration-500" style={{ width: `${activeProgress}%` }}></div>
            </div>
            <p className="text-sm text-muted-foreground">{activeProgress}% Complete</p>
            {Number(batch.totalRecords || 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                Processed about {processedEstimate} of {batch.totalRecords} records.
              </p>
            )}
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
              <h3 className="text-blue-500 font-semibold mb-2 flex items-center gap-2"><Play className="w-4 h-4" /> {isMigrationClean ? "Ready for Migration" : "Review Required"}</h3>
              <p className="text-muted-foreground text-sm mb-4">
                {isMigrationClean
                  ? "Validation complete. The batch is clean and ready to migrate."
                  : "Resolve every invalid and duplicate record before executing the migration to the live database."}
              </p>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-card p-3 rounded-lg border">
                  <div className="text-sm text-muted-foreground">Valid Records</div>
                  <div className="text-2xl font-bold text-emerald-500">{batch.summary?.valid || 0}</div>
                </div>
                <div className={`bg-card p-3 rounded-lg border ${unresolvedDuplicateCount > 0 ? "border-amber-500/50" : ""}`}>
                  <div className="text-sm text-muted-foreground">Duplicates</div>
                  <div className={`text-2xl font-bold ${unresolvedDuplicateCount > 0 ? "text-amber-500" : "text-emerald-500"}`}>{unresolvedDuplicateCount}</div>
                </div>
                <div className={`bg-card p-3 rounded-lg border ${invalidRecordCount > 0 ? "border-red-500/50" : ""}`}>
                  <div className="text-sm text-muted-foreground">Invalid Records</div>
                  <div className={`text-2xl font-bold ${invalidRecordCount > 0 ? "text-red-500" : "text-emerald-500"}`}>{invalidRecordCount}</div>
                </div>
              </div>
            </div>
            
            <InvalidRecordsEditor key={`invalid-${reviewRefreshKey}`} batchId={id} onResolved={handleInvalidResolved} showInitialLoader={false} />
            <PreviewAndResolution key={`duplicates-${reviewRefreshKey}`} batchId={id} onResolved={loadData} expectedCount={unresolvedDuplicateCount} />
            <AupulensPreview key={`preview-${reviewRefreshKey}`} batchId={id} showInitialLoader={false} />

            <div className="flex flex-col items-end gap-2 pt-2">
              {!isMigrationClean && (
                <p className="text-sm text-amber-500">
                  Migration is locked until duplicates and invalid records are resolved.
                </p>
              )}
              <button
                onClick={startMigration}
                disabled={busy || !isMigrationClean}
                title={!isMigrationClean ? "Resolve all duplicates and invalid records before migration." : "Start migration"}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-md font-bold shadow flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
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
              {batch.summary?.failed > 0 && (
                <button
                  type="button"
                  onClick={recoverFailedRecords}
                  disabled={busy}
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-rose-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Review Failed Rows
                </button>
              )}
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

              {failedRecords.length > 0 && (
                <div className="px-5 pb-5">
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
                    <h4 className="mb-1 text-sm font-semibold text-rose-600">Rows That Need Attention</h4>
                    <p className="mb-3 text-xs text-muted-foreground">
                      These rows were not saved. Review the reason and choose the suggested action before treating this migration as complete.
                    </p>
                    <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
                      {failedRecords.map((record, index) => (
                        <div key={record._id || index} className="rounded-md border bg-background p-4 text-sm">
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span className="rounded bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-600">
                              Row {index + 1}
                            </span>
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {record.entityType || "record"}
                            </span>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <div className="text-xs font-semibold uppercase text-muted-foreground">What went wrong</div>
                              <div className="mt-1 font-medium text-foreground">
                                {record.friendlyError?.title || "This row could not be migrated"}
                              </div>
                              <div className="mt-1 text-rose-600">
                                {record.friendlyError?.message || "The system could not save this row safely."}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase text-muted-foreground">What to do</div>
                              <div className="mt-1 text-muted-foreground">
                                {record.friendlyError?.action || "Review this row, fix the data if needed, then retry the migration."}
                              </div>
                            </div>
                            {Array.isArray(record.rowSummary) && record.rowSummary.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {record.rowSummary.map((item: any, itemIndex: number) => (
                                  <span key={`${item.label}-${itemIndex}`} className="rounded border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">{item.label}:</span> {item.value}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
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
