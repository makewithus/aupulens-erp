"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertCircle } from "lucide-react";

export function PreviewAndResolution({ batchId, onResolved }: { batchId: string; onResolved?: () => void }) {
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  const loadDuplicates = useCallback(() => {
    setLoading(true);
    fetch(`/api/migration/batches/${batchId}/duplicates`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setDuplicates(data.data);
        }
      })
      .finally(() => setLoading(false));
  }, [batchId]);

  useEffect(() => {
    loadDuplicates();
  }, [loadDuplicates]);

  const applyResolution = async (payload: Record<string, string>) => {
    const action = payload.action;
    setResolving(payload.scope === "all" ? `all-${action}` : `${payload.recordId}-${action}`);
    try {
      const res = await fetch(`/api/migration/batches/${batchId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || `Action '${action}' applied.`);
        await loadDuplicates();
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

  const handleAction = async (recordId: string, action: string) => {
    await applyResolution({ recordId, action });
  };

  if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin w-8 h-8 mx-auto text-emerald-600" /></div>;
  if (duplicates.length === 0) return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 mt-4">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="text-amber-500 font-semibold mb-2 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" /> Requires Review: Duplicates Detected
          </h3>
          <p className="text-muted-foreground text-sm">
            {duplicates.length} duplicate record{duplicates.length === 1 ? "" : "s"} still need a decision. Products use SKU / Product ID first; employees use email and employee ID.
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
            {resolving === "all-update" ? "Saving..." : `Merge Existing (${databaseDuplicateCount})`}
          </button>
          <button
            type="button"
            onClick={() => handleBulkAction("create")}
            disabled={!!resolving}
            className="px-3 py-1.5 text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded transition-colors border border-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {resolving === "all-create" ? "Saving..." : "Force Create All"}
          </button>
          <button
            type="button"
            onClick={() => handleBulkAction("skip")}
            disabled={!!resolving}
            className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {resolving === "all-skip" ? "Saving..." : "Skip All"}
          </button>
        </div>
      </div>
      <p className="text-muted-foreground text-xs mb-4">
        Force Create will generate an import-safe unique code/number when the target module requires uniqueness.
      </p>
      
      <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
        {duplicates.map((record, index) => (
          <div key={record._id} className="grid gap-4 bg-card p-4 rounded-lg border shadow-sm lg:grid-cols-[56px_minmax(0,1fr)_auto] lg:items-start">
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
                disabled={!!resolving}
                className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                {resolving === `${record._id}-skip` ? "Saving..." : "Skip"}
              </button>
              <button 
                onClick={() => handleAction(record._id, "update")}
                disabled={!!resolving || !record.duplicateTargetId}
                title={record.duplicateTargetId ? "Update the existing workspace record with this uploaded row" : "Merge / Update is available only when the duplicate matches an existing workspace record"}
                className="px-3 py-1.5 text-xs font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded transition-colors border border-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {resolving === `${record._id}-update` ? "Saving..." : "Merge / Update"}
              </button>
              <button 
                onClick={() => handleAction(record._id, "create")}
                disabled={!!resolving}
                className="px-3 py-1.5 text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded transition-colors border border-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {resolving === `${record._id}-create` ? "Saving..." : "Force Create"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
