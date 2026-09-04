'use client';

import { useState } from "react";
import { UploadCloud, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-6 border-b border-border/40">
        <div className="space-y-2">
          <h1 className="text-3xl md:text-[56px] font-black tracking-tighter text-primary leading-none">
            Data Import Center
          </h1>

        </div>
      </div>

      <Card className="bg-background border border-border/40 shadow-none">
        <CardContent className="p-6 pt-2 space-y-6">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-foreground">Target Entity</Label>
            <Select
              value={entity}
              onValueChange={(value) => {
                setEntity(value);
                setResults(null);
              }}
            >
              <SelectTrigger className="w-full h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none border-border/40">
                <SelectItem value="Lead">Leads</SelectItem>
                <SelectItem value="Contact">Contacts</SelectItem>
                <SelectItem value="Account">Accounts</SelectItem>
                <SelectItem value="Opportunity">Opportunities</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground/60 font-mono">Required columns: {REQUIRED_COLUMNS[entity]}</p>
          </div>

          <div className="border border-dashed border-border/40 bg-white/[0.01] hover:bg-white/[0.02] transition-colors p-10 text-center rounded-none group">
            <input
              type="file"
              id="fileUpload"
              accept=".csv,.tsv,.xls,.xlsx"
              className="hidden"
              onChange={handleFileSelect}
            />
            <label htmlFor="fileUpload" className="cursor-pointer flex flex-col items-center justify-center">
              <UploadCloud className="w-12 h-12 text-muted-foreground/60 mb-3 transition-transform group-hover:-translate-y-0.5 duration-300" />
              <span className="text-foreground text-sm font-semibold mb-1">
                {file ? file.name : "Choose CSV, TSV, or Excel file"}
              </span>
              <span className="text-xs text-muted-foreground/60 font-mono">
                {file ? `${(file.size / 1024).toFixed(1)} KB` : "Drag and drop or click to browse"}
              </span>
            </label>
          </div>

          <Button 
            onClick={handleImport} 
            disabled={!file || importing} 
            className="w-full h-10 font-mono text-[11px] uppercase tracking-[0.15em]"
          >
            {importing ? "Processing Data..." : "Run Import & Validate"}
          </Button>
        </CardContent>
      </Card>

      {results && (
        <Card className="bg-background border border-border/40 shadow-none">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-lg font-bold mb-0">Import Results</CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-2 space-y-6">
            <div className="grid grid-cols-3 gap-4 p-4 border border-border/45 bg-muted/5 rounded-none text-center">
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-muted-foreground/60 tracking-wider">Inserted</span>
                <h3 className="text-2xl font-bold font-sans tabular-nums text-[#8AE06C] flex items-center justify-center gap-1.5">
                  <CheckCircle className="w-5 h-5"/> {results.insertedCount || 0}
                </h3>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-muted-foreground/60 tracking-wider">Duplicates Removed</span>
                <h3 className="text-2xl font-bold font-sans tabular-nums text-blue-500">
                  {results.duplicatesRemoved || 0}
                </h3>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-muted-foreground/60 tracking-wider">Validation Errors</span>
                <h3 className="text-2xl font-bold font-sans tabular-nums text-red-500 flex items-center justify-center gap-1.5">
                  <AlertCircle className="w-5 h-5"/> {results.errors?.length || 0}
                </h3>
              </div>
            </div>
            {results.errors?.length > 0 && (
              <details className="group border border-border/30 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-red-400 select-none">
                  View row errors ({results.errors.length})
                </summary>
                <ul className="text-xs text-muted-foreground/80 list-disc list-inside mt-3 space-y-1.5 max-h-64 overflow-y-auto font-mono">
                  {results.errors.map((err: any, i: number) => (
                    <li key={i} className="hover:text-red-400 transition-colors">
                      Row {err.row}: {err.reasons?.join(", ")}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
