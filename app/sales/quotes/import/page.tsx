"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, UploadCloud, Lightbulb, Trash2, ChevronDown } from "lucide-react";

const QUOTE_FIELDS = [
  { key: "quoteNumber", label: "Quote Number" },
  { key: "customerName", label: "Customer Display Name", required: true },
  { key: "quoteDate", label: "Quote Date" },
  { key: "expiryDate", label: "Expiry Date" },
  { key: "subject", label: "Subject" },
  { key: "itemName", label: "Item Name" },
  { key: "quantity", label: "Quantity" },
  { key: "rate", label: "Rate" },
];

function autoMap(columns: string[]) {
  const mapping: Record<string, string> = {};
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  for (const field of QUOTE_FIELDS) {
    const match = columns.find((c) => norm(c) === norm(field.label) || norm(c) === norm(field.key));
    if (match) mapping[field.key] = match;
  }
  return mapping;
}

export default function ImportQuotesPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [encoding, setEncoding] = useState("UTF-8 (Unicode)");
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleFileSelect = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'tsv', 'xls', 'xlsx'].includes(ext || '')) {
      toast.error("Invalid file format. Only CSV, TSV, or XLS(X) are allowed.");
      return;
    }
    setFile(f);
  };

  const handleNextFromConfigure = async () => {
    if (!file) return;
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/sales/quotes/import/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to parse file");
      setColumns(data.columns);
      setMapping(autoMap(data.columns));
      setStep(2);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mapping", JSON.stringify(mapping));
      fd.append("autoGenerateNumbers", String(autoGenerate));
      const res = await fetch("/api/sales/quotes/import/execute", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setResult(data);
      toast.success("Import complete");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImporting(false);
    }
  };

  const missingRequired = QUOTE_FIELDS.filter((f) => f.required && !mapping[f.key]);

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Import Quotes"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Quotes", href: "/sales/quotes" },
        { label: "Import" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Quotes - Select File</h1>
          <button onClick={() => router.push("/sales/quotes")}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-4 text-sm">
          {["Configure", "Map Fields", "Preview"].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className={`h-6 w-6 rounded-full flex items-center justify-center text-xs ${
                  step === i + 1 ? "bg-blue-600 text-white" : step > i + 1 ? "bg-green-600 text-white" : "bg-gray-200 text-gray-500"
                }`}
              >
                {i + 1}
              </span>
              <span className={step === i + 1 ? "font-medium" : "text-muted-foreground"}>{label}</span>
              {i < 2 && <div className="w-8 h-px bg-gray-300" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-5">
            <div className="border-2 border-dashed rounded-none p-10 flex flex-col items-center text-center">
              {file ? (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-16 bg-blue-500 rounded-sm mb-3 relative flex items-center justify-center">
                    <div className="absolute top-0 right-0 border-l-[12px] border-l-blue-600 border-t-[12px] border-t-white" />
                  </div>
                  <p className="font-bold text-sm mb-2">{file.name}</p>
                  <button 
                    className="text-red-500 text-xs flex items-center gap-1 mb-6 hover:text-red-600"
                    onClick={() => setFile(null)}
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>

                  <label className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded flex items-center gap-2 cursor-pointer transition-colors">
                    Replace File
                    <div className="border-l border-blue-400 pl-2 ml-2">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground mt-3">Maximum File Size: 25 MB • File Format: CSV or TSV or XLS</p>
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer w-full h-full">
                  <UploadCloud className="w-8 h-8 text-muted-foreground mb-3" />
                  <p className="font-medium mb-1">Drag and drop file to import</p>
                  <p className="text-xs text-muted-foreground mb-3">Maximum File Size: 25 MB • File Format: CSV or TSV or XLS</p>
                  <span className="text-sm font-medium text-blue-600">Choose File</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Download a{" "}
              <Link href="/api/sales/quotes/import/sample?format=csv" className="text-blue-600 underline">
                sample csv file
              </Link>{" "}
              or{" "}
              <Link href="/api/sales/quotes/import/sample?format=xls" className="text-blue-600 underline">
                sample xls file
              </Link>{" "}
              and compare it to your import file.
            </p>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={autoGenerate} onCheckedChange={(v) => setAutoGenerate(!!v)} className="mt-0.5" />
              <span>
                <span className="font-medium">Auto-Generate Quote Numbers</span> — Quote numbers will be generated
                automatically according to your settings. Any Quote numbers in the import file will be ignored.
              </span>
            </label>

            <div className="max-w-xs space-y-1.5">
              <Label>Character Encoding</Label>
              <Select value={encoding} onValueChange={setEncoding}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTF-8 (Unicode)">UTF-8 (Unicode)</SelectItem>
                  <SelectItem value="ISO-8859-1">ISO-8859-1</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-none p-4 bg-muted/30 flex gap-3">
              <Lightbulb className="w-5 h-5 text-yellow-500 shrink-0" />
              <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
                <li>The sample xls file has details of all the fields you can import.</li>
                <li>If your file is in another format, convert it with any online converter first.</li>
                <li>Your import settings can be saved and reused for future imports.</li>
              </ul>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => router.push("/sales/quotes")}>
                Cancel
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!file || parsing}
                onClick={handleNextFromConfigure}
              >
                {parsing ? "Parsing..." : "Next ›"}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Map each column in your file to a quote field.</p>
            <div className="space-y-2">
              {QUOTE_FIELDS.map((field) => (
                <div key={field.key} className="grid grid-cols-2 gap-4 items-center max-w-xl">
                  <Label>
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </Label>
                  <Select
                    value={mapping[field.key] || "__none__"}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [field.key]: v === "__none__" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Not mapped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not mapped</SelectItem>
                      {columns.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {missingRequired.length > 0 && (
              <p className="text-xs text-red-600">
                Map required fields before continuing: {missingRequired.map((f) => f.label).join(", ")}
              </p>
            )}
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                ← Go Back
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={missingRequired.length > 0}
                onClick={() => setStep(3)}
              >
                Next ›
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {result ? (
              <div className="border rounded-none p-4 bg-green-50 dark:bg-green-950/20 text-sm space-y-1">
                <p>✅ Imported: {result.imported}</p>
                {result.errors?.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-red-600">{result.errors.length} row error(s)</summary>
                    <ul className="list-disc list-inside">
                      {result.errors.map((e: string, i: number) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <Button className="mt-2" onClick={() => router.push("/sales/quotes")}>
                  Done
                </Button>
              </div>
            ) : (
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  ← Go Back
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleImport} disabled={importing}>
                  {importing ? "Importing..." : "Import"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
