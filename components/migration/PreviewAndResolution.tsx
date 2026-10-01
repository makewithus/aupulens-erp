"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertCircle, ArrowRight } from "lucide-react";

export function PreviewAndResolution({ batchId }: { batchId: string }) {
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/migration/batches/${batchId}/duplicates`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setDuplicates(data.data);
        }
      })
      .finally(() => setLoading(false));
  }, [batchId]);

  const handleAction = async (recordId: string, action: string) => {
    try {
      const res = await fetch(`/api/migration/batches/${batchId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, action }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Action '${action}' applied.`);
        setDuplicates(prev => prev.filter(d => d._id !== recordId));
      } else {
        toast.error(data.message || "Failed to apply resolution.");
      }
    } catch (e) {
      toast.error("Failed to apply resolution.");
    }
  };

  if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin w-8 h-8 mx-auto text-emerald-600" /></div>;
  if (duplicates.length === 0) return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 mt-4">
      <h3 className="text-amber-500 font-semibold mb-2 flex items-center gap-2">
        <AlertCircle className="w-5 h-5" /> Requires Review: Duplicates Detected
      </h3>
      <p className="text-muted-foreground text-sm mb-4">
        The following records match existing data in your workspace. Please choose how to handle them.
      </p>
      
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {duplicates.map(record => (
          <div key={record._id} className="bg-card p-4 rounded-lg border shadow-sm flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0 pr-4">
              <div className="text-sm font-medium text-foreground truncate">
                Entity: {record.entityType.toUpperCase()}
              </div>
              <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-2">
                {Object.entries(record.mappedData)
                  .filter(([k, v]) => v && k !== '_id' && k !== 'tenantId')
                  .map(([k, v]) => (
                    <span key={k} className="bg-secondary/50 border border-secondary px-2 py-0.5 rounded-md">
                      <span className="font-medium opacity-80">{k}:</span> {String(v)}
                    </span>
                  ))}
              </div>
            </div>
            
            <div className="flex gap-2 shrink-0 flex-wrap justify-end">
              <button 
                onClick={() => handleAction(record._id, "skip")}
                className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground rounded transition-colors"
              >
                Skip
              </button>
              {record.duplicateTargetId && (
                <button 
                  onClick={() => handleAction(record._id, "update")}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded transition-colors border border-blue-500/20"
                >
                  Merge / Update
                </button>
              )}
              <button 
                onClick={() => handleAction(record._id, "create")}
                className="px-3 py-1.5 text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded transition-colors border border-red-500/20"
              >
                Force Create
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
