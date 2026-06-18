'use client';

import { useState } from "react";
import { UploadCloud, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function ImportCenterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [entity, setEntity] = useState("Lead");
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleImport = async () => {
    if (!file) return toast.error("Select a CSV file first");
    setImporting(true);

    // Mock parsing for CSV assuming structure. In real app, use PapaParse.
    const mockRecords = [
      { email: "test1@example.com", lead_name: "Test 1" },
      { email: "test2@example.com", lead_name: "Test 2" },
      { email: "invalid", lead_name: "Test 3" }
    ];

    const res = await fetch("/api/crm/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType: entity, records: mockRecords, strict: false })
    });

    const data = await res.json();
    setResults(data);
    setImporting(false);
    toast(data.success ? "Import partial/success" : "Import failed");
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
            <select value={entity} onChange={e => setEntity(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 p-2 rounded mt-1 text-sm">
              <option value="Lead">Leads</option>
              <option value="Contact">Contacts</option>
              <option value="Account">Accounts</option>
              <option value="Opportunity">Opportunities</option>
            </select>
          </div>
          
          <div className="border-2 border-dashed border-neutral-700 rounded-lg p-10 text-center">
            <input type="file" id="fileUpload" className="hidden" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)} />
            <label htmlFor="fileUpload" className="cursor-pointer flex flex-col items-center">
              <UploadCloud className="w-10 h-10 text-neutral-500 mb-2" />
              <span className="text-neutral-300 font-medium">{file ? file.name : "Click to select CSV file"}</span>
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
        </div>
      )}
    </div>
  );
}
