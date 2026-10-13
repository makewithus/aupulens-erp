"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Loader2, XCircle, Save, X, Sparkles } from "lucide-react";

function recordHasDuplicateError(record: any) {
  return Array.isArray(record?.errors)
    && record.errors.some((error: any) => /duplicate record|duplicate key|E11000|already exists|found while writing data/i.test(String(error?.message || "")));
}

export function InvalidRecordsEditor({
  batchId,
  onResolved,
  showInitialLoader = true,
}: {
  batchId: string;
  onResolved: () => void | Promise<void>;
  showInitialLoader?: boolean;
}) {
  const [invalidRecords, setInvalidRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [aiFixing, setAiFixing] = useState<string | null>(null);

  const loadInvalidRecords = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const res = await fetch(`/api/migration/batches/${batchId}/invalid`);
      const data = await res.json();
      if (data.success) {
        setInvalidRecords(data.data);
        return data.data;
      }
      return [];
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    loadInvalidRecords(true);
  }, [loadInvalidRecords]);

  const handleEdit = (record: any) => {
    setEditingId(record._id);
    setEditData({ ...record.sourceData });
  };

  const handleSave = async (recordId: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/migration/batches/${batchId}/invalid`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, sourceData: editData }),
      });
      if (res.ok) {
        toast.success("Record updated");
        setInvalidRecords(prev => prev.filter(r => r._id !== recordId));
        setEditingId(null);
        onResolved(); // Trigger a re-run of the worker
      } else {
        toast.error("Failed to update record");
      }
    } catch (e) {
      toast.error("An error occurred while updating");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAiFix = async (recordId?: string) => {
    const key = recordId || "all";
    setAiFixing(key);
    try {
      const res = await fetch(`/api/migration/batches/${batchId}/ai-fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recordId ? { recordId } : { scope: "all" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "Fix applied.");
        setEditingId(null);
        if (Array.isArray(data.fixedRecordIds) && data.fixedRecordIds.length > 0) {
          const fixed = new Set(data.fixedRecordIds.map(String));
          setInvalidRecords((current) => current.filter((record) => !fixed.has(String(record._id))));
        }
        await loadInvalidRecords(false);
        await onResolved();
        if (data.unresolvedCount > 0) {
          toast.warning(
            data.unresolvedMessages?.length
              ? data.unresolvedMessages.join(" ")
              : `${data.unresolvedCount} record${data.unresolvedCount === 1 ? "" : "s"} still need manual review.`,
          );
        }
      } else {
        const detail = Array.isArray(data.unresolvedMessages) && data.unresolvedMessages.length > 0
          ? data.unresolvedMessages.join(" ")
          : data.message;
        toast.error(detail || "No automatic fix was available.");
        await loadInvalidRecords(false);
      }
    } catch {
      toast.error("Fix failed.");
    } finally {
      setAiFixing(null);
    }
  };

  if (loading) {
    if (!showInitialLoader) return null;
    return <div className="p-8 text-center"><Loader2 className="animate-spin w-8 h-8 mx-auto text-rose-600" /></div>;
  }
  if (invalidRecords.length === 0) return null;

  return (
    <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 mt-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-rose-800 font-semibold flex items-center gap-2">
          <XCircle className="w-5 h-5" /> Invalid Records Detected
        </h3>
        {invalidRecords.some((record) => !recordHasDuplicateError(record)) && (
          <button
            type="button"
            onClick={() => handleAiFix()}
            disabled={!!aiFixing || submitting}
            className="inline-flex items-center gap-1 rounded-md bg-rose-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiFixing === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Fix All
          </button>
        )}
      </div>
      <p className="text-rose-900 text-sm mb-4">
        The following records have validation errors (missing required fields or unresolved references). Please fix them to proceed.
      </p>
      
      <div
        className="space-y-3 overflow-y-auto overscroll-contain rounded-md border border-rose-200 bg-white/35 p-3 pr-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-rose-100/50 [&::-webkit-scrollbar-thumb]:bg-rose-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-rose-400"
        style={{ maxHeight: "min(55vh, 560px)", minHeight: "240px", scrollbarGutter: "stable" }}
        tabIndex={0}
      >
        {invalidRecords.map(record => {
          const rowFixing = aiFixing === record._id;
          const bulkFixing = aiFixing === "all";
          const duplicateError = recordHasDuplicateError(record);
          return (
          <div key={record._id} className={`bg-white p-4 rounded-lg border shadow-sm flex flex-col gap-3 transition-opacity ${rowFixing ? "opacity-80" : ""}`}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-800">
                Entity: {record.entityType.toUpperCase()}
              </div>
              {editingId !== record._id && (
                <div className="flex flex-wrap justify-end gap-2">
                  {!duplicateError && (
                    <button 
                      onClick={() => handleAiFix(record._id)}
                      disabled={rowFixing || bulkFixing || submitting}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-rose-700 hover:bg-rose-800 text-white rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {rowFixing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Fix
                    </button>
                  )}
                  <button 
                    onClick={() => handleEdit(record)}
                    disabled={rowFixing || bulkFixing}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Edit Record
                  </button>
                </div>
              )}
            </div>

            {duplicateError && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  This is not a field repair. It is a duplicate decision. Refreshing this review will move it to the duplicate-resolution panel where you can merge, force create, or skip it.
                </div>
              </div>
            )}
            
            <div className="max-h-24 overflow-y-auto overscroll-contain text-xs text-rose-600 bg-rose-50/50 p-2 rounded border border-rose-100">
              {record.errors?.map((err: any, i: number) => (
                <div key={i}>• {err.message}</div>
              ))}
            </div>

            {editingId === record._id ? (
              <div className="bg-slate-50 p-3 rounded border">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {Object.entries(editData).map(([key, value]) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-slate-500 mb-1">{key}</label>
                      <input 
                        type="text" 
                        value={(value as string) || ""} 
                        onChange={(e) => setEditData({...editData, [key]: e.target.value})}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 caret-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:caret-slate-100"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <button 
                    onClick={() => setEditingId(null)}
                    disabled={submitting}
                    className="px-3 py-1.5 text-xs font-medium bg-white border shadow-sm hover:bg-slate-50 text-slate-700 rounded transition-colors flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                  <button 
                    onClick={() => handleSave(record._id)}
                    disabled={submitting}
                    className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors flex items-center gap-1"
                  >
                    {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Changes
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-h-20 overflow-y-auto rounded border border-slate-100 bg-slate-50/70 p-2 text-xs text-slate-500 font-mono break-all">
                {JSON.stringify(record.sourceData)}
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
