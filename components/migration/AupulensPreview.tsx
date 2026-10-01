"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export function AupulensPreview({
  batchId,
  showInitialLoader = true,
}: {
  batchId: string;
  showInitialLoader?: boolean;
}) {
  const [entities, setEntities] = useState<{ _id: string, count: number }[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/migration/batches/${batchId}/preview`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data.length > 0) {
          setEntities(data.data);
          setActiveTab(data.data[0]._id);
        }
      })
      .finally(() => setLoading(false));
  }, [batchId]);

  useEffect(() => {
    if (!activeTab) return;
    setRecordsLoading(true);
    fetch(`/api/migration/batches/${batchId}/preview?entityType=${activeTab}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setRecords(data.data);
        }
      })
      .finally(() => setRecordsLoading(false));
  }, [batchId, activeTab]);

  if (loading) {
    if (!showInitialLoader) return null;
    return <div className="p-8 text-center"><Loader2 className="animate-spin w-8 h-8 mx-auto text-emerald-600" /></div>;
  }
  if (entities.length === 0) return null;

  return (
    <div className="bg-white border rounded-xl shadow-sm mt-6">
      <div className="border-b px-5 py-4">
        <h3 className="text-lg font-bold text-slate-800">Aupulens Data Preview</h3>
        <p className="text-sm text-slate-500">Previewing how your valid records will appear in the system.</p>
      </div>
      
      <div className="flex border-b overflow-x-auto">
        {entities.map(e => (
          <button
            key={e._id}
            onClick={() => setActiveTab(e._id)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === e._id ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {e._id} <span className="ml-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs">{e.count}</span>
          </button>
        ))}
      </div>

      <div className="p-0 overflow-x-auto">
        {recordsLoading ? (
          <div className="p-8 text-center"><Loader2 className="animate-spin w-6 h-6 mx-auto text-emerald-600" /></div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No sample records found.</div>
        ) : (
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b">
              <tr>
                {Object.keys(records[0].mappedData).slice(0, 7).map(k => (
                  <th key={k} className="px-6 py-3 font-semibold">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i} className="bg-white border-b hover:bg-slate-50 transition-colors">
                  {Object.keys(records[0].mappedData).slice(0, 7).map(k => (
                    <td key={k} className="px-6 py-3 truncate max-w-[200px]">
                      {String(r.mappedData[k] || "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="p-4 text-center text-xs text-slate-400 bg-slate-50/50">
          Showing up to 10 sample records
        </div>
      </div>
    </div>
  );
}
