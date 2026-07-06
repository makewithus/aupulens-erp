"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { X, UploadCloud, Trash2, ChevronDown } from "lucide-react";

const EXCESS_PAYMENT_FIELDS = [
  { key: "customerName", label: "Customer Name", required: false },
  { key: "paymentNumber", label: "Payment Number", required: false },
  { key: "invoiceNumber", label: "Invoice Number", required: true },
  { key: "amount", label: "Amount to Apply", required: true },
];

function autoMap(columns: string[]) {
  const mapping: Record<string, string> = {};
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  for (const field of EXCESS_PAYMENT_FIELDS) {
    const match = columns.find((c) => norm(c) === norm(field.label) || norm(c) === norm(field.key));
    if (match) mapping[field.key] = match;
  }
  return mapping;
}

export default function ImportAppliedExcessPaymentsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [encoding, setEncoding] = useState("UTF-8 (Unicode)");
  const [columns, setColumns] = useState<string[]>([]);
  const [preview, setPreview] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleFileSelect = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["csv", "tsv", "xls", "xlsx"].includes(ext || "")) {
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
      // Reuses the generic Import Payments parse route — parsing a
      // spreadsheet into rows has no business logic, so there's no need
      // for a dedicated parse endpoint here.
      const res = await fetch("/api/sales/payments/import/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to parse file");
      setColumns(data.columns);
      setPreview(data.preview);
      setTotalRows(data.totalRows);
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
      const res = await fetch("/api/sales/payments/import-excess/execute", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.message || "Import failed");
      setResult(data);
      toast.success("Import complete");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImporting(false);
    }
  };

  const missingHardRequired = EXCESS_PAYMENT_FIELDS.filter((f) => f.required && !mapping[f.key]);
  const missingIdentifier = !mapping.customerName && !mapping.paymentNumber;
  const canProceedFromMapping = missingHardRequired.length === 0 && !missingIdentifier;

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Import Applied Excess Payments"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Payments", href: "/sales/payments" },
        { label: "Import Applied Excess Payments" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Applied Excess Payments - Select File</h1>
          <button onClick={() => router.push("/sales/payments")}>
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
                      accept=".csv,.tsv,.xls,.xlsx"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                        e.target.value = "";
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
                    accept=".csv,.tsv,.xls,.xlsx"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Download a{" "}
              <a href="/api/sales/payments/import-excess/sample?format=csv" className="text-blue-600 underline">
                sample file
              </a>{" "}
              and compare it to your import file to ensure you have the file perfect for the import.
            </p>

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

            <div className="border rounded-none p-4 bg-muted/30 text-sm space-y-1">
              <p className="font-medium">NOTES:</p>
              <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                <li>
                  When you import applied excess payments, the excess payment amount will be added to the existing
                  invoice amount if you've already applied payment to it.
                </li>
                <li>Invoice payments will not be imported for invoices in the Draft or the Paid status.</li>
              </ul>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => router.push("/sales/payments")}>
                Cancel
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" disabled={!file || parsing} onClick={handleNextFromConfigure}>
                {parsing ? "Parsing..." : "Next ›"}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Map each column in your file to a field. Provide either Customer Name or Payment Number to identify the
              source payment.
            </p>
            <div className="space-y-2">
              {EXCESS_PAYMENT_FIELDS.map((field) => (
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
            {missingHardRequired.length > 0 && (
              <p className="text-xs text-red-600">
                Map required fields before continuing: {missingHardRequired.map((f) => f.label).join(", ")}
              </p>
            )}
            {missingIdentifier && (
              <p className="text-xs text-red-600">Map either Customer Name or Payment Number to identify the source payment.</p>
            )}
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                ← Go Back
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" disabled={!canProceedFromMapping} onClick={() => setStep(3)}>
                Next ›
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Previewing the first 5 of {totalRows} row(s). Review the mapped columns below, then import.
            </p>
            <div className="overflow-x-auto border rounded-none">
              <Table>
                <TableHeader>
                  <TableRow>
                    {EXCESS_PAYMENT_FIELDS.filter((f) => mapping[f.key]).map((f) => (
                      <TableHead key={f.key}>{f.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((row: any[], i: number) => (
                    <TableRow key={i}>
                      {EXCESS_PAYMENT_FIELDS.filter((f) => mapping[f.key]).map((f) => (
                        <TableCell key={f.key}>{row[columns.indexOf(mapping[f.key])] ?? ""}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {result ? (
              <div className="border rounded-none p-4 bg-green-50 dark:bg-green-950/20 text-sm space-y-1">
                <p>Imported: {result.imported}</p>
                <p>Skipped: {result.skipped}</p>
                {result.errors?.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-red-600">{result.errors.length} row skipped</summary>
                    <ul className="list-disc list-inside">
                      {result.errors.map((e: { row: number; reason: string }, i: number) => (
                        <li key={i}>
                          Row {e.row}: {e.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <Button className="mt-2" onClick={() => router.push("/sales/payments")}>
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
