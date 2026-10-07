"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertCircle } from "lucide-react";

type ResolvingState =
  | { scope: "all"; action: string }
  | { scope: "record"; recordId: string; action: string }
  | null;

export function PreviewAndResolution({ batchId, onResolved, expectedCount = 0 }: { batchId: string; onResolved?: () => void; expectedCount?: number }) {
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<ResolvingState>(null);

  const loadDuplicates = useCallback((options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? true;
    if (showLoading) setLoading(true);
    fetch(`/api/migration/batches/${batchId}/duplicates`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setDuplicates(data.data);
        }
      })
      .finally(() => {
        if (showLoading) setLoading(false);
      });
  }, [batchId]);

  useEffect(() => {
    loadDuplicates({ showLoading: true });
  }, [loadDuplicates]);

  const applyResolution = async (payload: Record<string, string>) => {
    const action = payload.action;
    const isBulkAction = payload.scope === "all";
    setResolving(isBulkAction ? { scope: "all", action } : { scope: "record", recordId: payload.recordId, action });
    try {
      const res = await fetch(`/api/migration/batches/${batchId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || `Action '${action}' applied.`);
        if (isBulkAction) {
          loadDuplicates({ showLoading: false });
        } else {
          setDuplicates((current) => current.filter((record) => record._id !== payload.recordId));
          loadDuplicates({ showLoading: false });
        }
        onResolved?.();
      } else {
        toast.error(data.message || "Failed to apply resolution.");
      }
    } catch (e) {
      toast.error("Failed to apply resolution.");
    } finally {
      setResolving(null);
    }
  };

  const handleBulkAction = async (action: string) => {
    await applyResolution({ scope: "all", action });
  };

  const databaseDuplicateCount = duplicates.filter((record) => record.duplicateTargetId).length;
  const resolvingBulkAction = resolving?.scope === "all" ? resolving.action : null;

  const handleAction = async (recordId: string, action: string) => {
    await applyResolution({ recordId, action });
  };

  if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin w-8 h-8 mx-auto text-emerald-600" /></div>;
  if (duplicates.length === 0 && expectedCount <= 0) return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 mt-4">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="text-amber-500 font-semibold mb-2 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" /> Requires Review: Duplicates Detected
          </h3>
          <p className="text-muted-foreground text-sm">
            {Math.max(duplicates.length, expectedCount)} duplicate record{Math.max(duplicates.length, expectedCount) === 1 ? "" : "s"} still need a decision. Products use SKU / Product ID first; employees use email and employee ID.
          </p>
          <p className="mt-1 text-xs text-amber-500">
            Migration stays locked until each duplicate is skipped, merged, or force-created.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => handleBulkAction("update")}
            disabled={!!resolving || databaseDuplicateCount === 0}
            title={databaseDuplicateCount === 0 ? "Merge / Update is available only for duplicates that match existing workspace records" : "Merge all duplicates that matched existing workspace records"}
            className="px-3 py-1.5 text-xs font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded transition-colors border border-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {resolvingBulkAction === "update" ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Saving...</span> : `Merge Existing (${databaseDuplicateCount})`}
          </button>
          <button
            type="button"
            onClick={() => handleBulkAction("create")}
            disabled={!!resolving}
            className="px-3 py-1.5 text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded transition-colors border border-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {resolvingBulkAction === "create" ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Saving...</span> : "Force Create All"}
          </button>
          <button
            type="button"
            onClick={() => handleBulkAction("skip")}
            disabled={!!resolving}
            className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {resolvingBulkAction === "skip" ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Saving...</span> : "Skip All"}
          </button>
        </div>
      </div>
      <p className="text-muted-foreground text-xs mb-4">
        Choose Merge / Update for existing workspace matches, Force Create to keep both records with an import-safe unique code/number, or Skip to exclude the uploaded duplicate.
      </p>

      {duplicates.length === 0 && expectedCount > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-500">
          Duplicate rows are queued for review. Use Force Create All or Skip All to resolve uploaded-row duplicates and unlock migration.
        </div>
      )}
      
      {duplicates.length > 0 && <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
        {duplicates.map((record, index) => {
          const resolvingRecordAction = resolving?.scope === "record" && resolving.recordId === record._id ? resolving.action : null;
          const recordBusy = !!resolvingRecordAction;
          return (
            <div key={record._id} className={`relative grid gap-4 bg-card p-4 rounded-lg border shadow-sm transition-opacity lg:grid-cols-[56px_minmax(0,1fr)_auto] lg:items-start ${recordBusy ? "opacity-80" : ""}`}>
              <div className="flex h-8 w-12 items-center justify-center rounded border bg-secondary/40 text-xs font-semibold text-muted-foreground">
                #{index + 1}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  Entity: {record.entityType.toUpperCase()}
                </div>
                <div className="text-xs text-amber-500 mt-1">
                  Matched {record.duplicateReason === "database" ? "existing workspace data" : "another uploaded row"}
                  {Array.isArray(record.duplicateFields) && record.duplicateFields.length > 0 ? ` using: ${record.duplicateFields.join(", ")}` : ""}.
                </div>
                <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-2">
                  {Object.entries(record.mappedData || {})
                    .filter(([k, v]) => v && k !== '_id' && k !== 'tenantId')
                    .map(([k, v]) => (
                      <span key={k} className="bg-secondary/50 border border-secondary px-2 py-0.5 rounded-md">
                        <span className="font-medium opacity-80">{k}:</span> {String(v)}
                      </span>
                    ))}
                </div>
              </div>
              
              <div className="flex gap-2 shrink-0 flex-wrap justify-start lg:justify-end">
                <button 
                  onClick={() => handleAction(record._id, "skip")}
                  disabled={recordBusy}
                  className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {resolvingRecordAction === "skip" ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Saving...</span> : "Skip"}
                </button>
                <button 
                  onClick={() => handleAction(record._id, "update")}
                  disabled={recordBusy || !record.duplicateTargetId}
                  title={record.duplicateTargetId ? "Update the existing workspace record with this uploaded row" : "Merge / Update is available only when the duplicate matches an existing workspace record"}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded transition-colors border border-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {resolvingRecordAction === "update" ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Saving...</span> : "Merge / Update"}
                </button>
                <button 
                  onClick={() => handleAction(record._id, "create")}
                  disabled={recordBusy}
                  className="px-3 py-1.5 text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded transition-colors border border-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {resolvingRecordAction === "create" ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Saving...</span> : "Force Create"}
                </button>
              </div>
            </div>
          );
        })}
      </div>}
    </div>
  );
}
