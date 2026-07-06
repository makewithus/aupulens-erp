'use client';

import { useState } from "react";
import { UploadCloud, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const REQUIRED_COLUMNS: Record<string, string> = {
  Lead: "Lead Name, plus Email or Phone",
  Contact: "First Name, Last Name (plus Company/Account Name to link an existing Account)",
  Account: "Company Name",
  Opportunity: "Deal Name, Amount (plus Company/Account Name to link an existing Account)",
};

export default function ImportCenterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [entity, setEntity] = useState("Lead");
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'tsv', 'xls', 'xlsx'].includes(ext || '')) {
      toast.error("Invalid file format. Only CSV, TSV, or XLS(X) are allowed.");
      e.target.value = '';
      return;
    }
    setFile(f);
    setResults(null);
  };

  const handleImport = async () => {
    if (!file) return toast.error("Select a file first");
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entityType", entity);
      fd.append("strict", "false");
      const res = await fetch("/api/crm/import", { method: "POST", body: fd });
      const data = await res.json();
      setResults(data);
      toast(data.insertedCount ? `Imported ${data.insertedCount} record(s)` : (data.message || "Import failed"));
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <UploadCloud className="w-8 h-8 text-indigo-400" /> Data Import Center
      </h1>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-neutral-400">Target Entity</label>
            <select
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value);
                setResults(null);
              }}
              className="w-full bg-neutral-950 border border-neutral-800 p-2 rounded mt-1 text-sm"
            >
              <option value="Lead">Leads</option>
              <option value="Contact">Contacts</option>
              <option value="Account">Accounts</option>
              <option value="Opportunity">Opportunities</option>
            </select>
            <p className="text-xs text-neutral-500 mt-1">Required columns: {REQUIRED_COLUMNS[entity]}</p>
          </div>

          <div className="border-2 border-dashed border-neutral-700 rounded-lg p-10 text-center">
            <input
              type="file"
              id="fileUpload"
              accept=".csv,.tsv,.xls,.xlsx"
              className="hidden"
              onChange={handleFileSelect}
            />
            <label htmlFor="fileUpload" className="cursor-pointer flex flex-col items-center">
              <UploadCloud className="w-10 h-10 text-neutral-500 mb-2" />
              <span className="text-neutral-300 font-medium">{file ? file.name : "Click to select a CSV, TSV, or XLS(X) file"}</span>
            </label>
          </div>

          <Button onClick={handleImport} disabled={!file || importing} className="w-full bg-primary text-white">
            {importing ? "Processing Data..." : "Run Import & Validate"}
          </Button>
        </div>
      </div>

      {results && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 space-y-4">
          <h3 className="font-bold text-lg border-b border-neutral-800 pb-2">Import Results</h3>
          <div className="flex gap-6">
            <div className="flex flex-col"><span className="text-xs text-neutral-500">Inserted</span><span className="text-2xl font-bold text-green-400 flex items-center gap-1"><CheckCircle className="w-5 h-5"/> {results.insertedCount || 0}</span></div>
            <div className="flex flex-col"><span className="text-xs text-neutral-500">Duplicates Removed</span><span className="text-2xl font-bold text-blue-400">{results.duplicatesRemoved || 0}</span></div>
            <div className="flex flex-col"><span className="text-xs text-neutral-500">Validation Errors</span><span className="text-2xl font-bold text-red-400 flex items-center gap-1"><AlertCircle className="w-5 h-5"/> {results.errors?.length || 0}</span></div>
          </div>
          {results.errors?.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm text-red-400">View row errors</summary>
              <ul className="text-xs text-neutral-400 list-disc list-inside mt-2 space-y-1 max-h-64 overflow-y-auto">
                {results.errors.map((err: any, i: number) => (
                  <li key={i}>Row {err.row}: {err.reasons?.join(", ")}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
