"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, XCircle, Save, X, Sparkles } from "lucide-react";

export function InvalidRecordsEditor({
  batchId,
  onResolved,
  showInitialLoader = true,
}: {
  batchId: string;
  onResolved: () => void;
  showInitialLoader?: boolean;
}) {
  const [invalidRecords, setInvalidRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [aiFixing, setAiFixing] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/migration/batches/${batchId}/invalid`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setInvalidRecords(data.data);
        }
      })
      .finally(() => setLoading(false));
  }, [batchId]);

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
        toast.success(data.message || "AI fix applied.");
        if (recordId) {
          setInvalidRecords(prev => prev.filter(r => r._id !== recordId));
        } else {
          setInvalidRecords([]);
        }
        setEditingId(null);
        onResolved();
      } else {
        toast.error(data.message || "AI fix failed.");
      }
    } catch {
      toast.error("AI fix failed.");
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
        <button
          type="button"
          onClick={() => handleAiFix()}
          disabled={!!aiFixing || submitting}
          className="inline-flex items-center gap-1 rounded-md bg-rose-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {aiFixing === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Fix All With AI
        </button>
      </div>
      <p className="text-rose-900 text-sm mb-4">
        The following records have validation errors (missing required fields or unresolved references). Please fix them to proceed.
      </p>
      
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {invalidRecords.map(record => (
          <div key={record._id} className="bg-white p-4 rounded-lg border shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-800">
                Entity: {record.entityType.toUpperCase()}
              </div>
              {editingId !== record._id && (
                <div className="flex flex-wrap justify-end gap-2">
                  <button 
                    onClick={() => handleAiFix(record._id)}
                    disabled={!!aiFixing || submitting}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-rose-700 hover:bg-rose-800 text-white rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {aiFixing === record._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    Fix with AI
                  </button>
                  <button 
                    onClick={() => handleEdit(record)}
                    disabled={!!aiFixing}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Edit Record
                  </button>
                </div>
              )}
            </div>
            
            <div className="text-xs text-rose-600 bg-rose-50/50 p-2 rounded border border-rose-100">
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
                        className="w-full text-sm border rounded px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 outline-none"
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
              <div className="text-xs text-slate-500 font-mono break-all line-clamp-2">
                {JSON.stringify(record.sourceData)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
