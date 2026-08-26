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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { X, UploadCloud, Trash2, ChevronDown } from "lucide-react";

const SALES_ORDER_FIELDS = [
  { key: "customerName", label: "Customer Name", required: true },
  { key: "salesOrderNumber", label: "Sales Order Number" },
  { key: "reference", label: "Reference#" },
  { key: "orderDate", label: "Order Date" },
  { key: "expectedShipmentDate", label: "Expected Shipment Date" },
  { key: "paymentTerms", label: "Payment Terms" },
  { key: "deliveryMethod", label: "Delivery Method" },
  { key: "itemName", label: "Item Name", required: true },
  { key: "quantity", label: "Quantity" },
  { key: "rate", label: "Rate" },
];

function autoMap(columns: string[]) {
  const mapping: Record<string, string> = {};
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  for (const field of SALES_ORDER_FIELDS) {
    const match = columns.find((c) => norm(c) === norm(field.label) || norm(c) === norm(field.key));
    if (match) mapping[field.key] = match;
  }
  return mapping;
}

export default function ImportSalesOrdersPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [encoding, setEncoding] = useState("UTF-8 (Unicode)");
  const [autoGenerateNumbers, setAutoGenerateNumbers] = useState(true);
  const [columns, setColumns] = useState<string[]>([]);
  const [preview, setPreview] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState(0);
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
      const res = await fetch("/api/sales/sales-orders/import/parse", { method: "POST", body: fd });
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
      fd.append("autoGenerateNumbers", String(autoGenerateNumbers));
      const res = await fetch("/api/sales/sales-orders/import/execute", { method: "POST", body: fd });
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

  const missingRequired = SALES_ORDER_FIELDS.filter((f) => f.required && !mapping[f.key]);

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Import Sales Orders"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Sales Orders", href: "/sales/sales-orders" },
        { label: "Import" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">Sales Orders - Select File</h1>
          <button onClick={() => router.push("/sales/sales-orders")} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-wider">
          {["Configure", "Map Fields", "Preview"].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className={`h-6 w-6 rounded-none flex items-center justify-center text-xs ${
                  step === i + 1 ? "bg-primary text-primary-foreground" : step > i + 1 ? "bg-emerald-600 text-white" : "bg-accent text-muted-foreground"
                }`}
              >
                {i + 1}
              </span>
              <span className={step === i + 1 ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
              {i < 2 && <div className="w-8 h-px bg-border/40" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-5">
            <div className="border-2 border-dashed border-border/40 rounded-none p-10 flex flex-col items-center text-center">
              {file ? (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-16 bg-accent rounded-none mb-3 relative flex items-center justify-center">
                    <div className="absolute top-0 right-0 border-l-[12px] border-l-primary border-t-[12px] border-t-background" />
                  </div>
                  <p className="font-bold text-sm mb-2">{file.name}</p>
                  <button 
                    className="text-red-500 text-xs flex items-center gap-1 mb-6 hover:text-red-600"
                    onClick={() => setFile(null)}
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>

                  <label className="none-xl bg-tertiary border-secondary border-1 hover:bg-muted text-primary font-mono text-[11px] uppercase tracking-wider px-4 py-2 rounded-none flex items-center gap-2 cursor-pointer transition-all">
                    Replace File
                    <div className="border-l border-border/40 pl-2 ml-2">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                    <input
                      type="file"
                      accept=".csv,.tsv,.xls,.xlsx"
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
                  <span className="font-mono text-[11px] uppercase tracking-wider text-primary">Choose File</span>
                  <input
                    type="file"
                    accept=".csv,.tsv,.xls,.xlsx"
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
              <Link href="/api/sales/sales-orders/import/sample?format=csv" className="text-primary underline">
                sample file
              </Link>{" "}
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

            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={autoGenerateNumbers} onCheckedChange={(v) => setAutoGenerateNumbers(!!v)} className="mt-0.5" />
              <span>
                <span className="font-medium">Auto-Generate Sales Order Numbers</span>
                <br />
                <span className="text-xs text-muted-foreground">
                  Sales order numbers will be generated automatically according to your settings. Any numbers in the
                  import file will be ignored.
                </span>
              </span>
            </label>

            <div className="flex justify-between pt-2">
              <Button variant="outline" className="rounded-none border-border/40 font-mono text-[11px] uppercase tracking-wider" onClick={() => router.push("/sales/sales-orders")}>
                Cancel
              </Button>
              <Button className="font-mono text-[11px] uppercase tracking-wider" disabled={!file || parsing} onClick={handleNextFromConfigure}>
                {parsing ? "Parsing..." : "Next ›"}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Map each column in your file to a sales order field.</p>
            <div className="space-y-2">
              {SALES_ORDER_FIELDS.map((field) => (
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
              <Button variant="outline" className="rounded-none border-border/40 font-mono text-[11px] uppercase tracking-wider" onClick={() => setStep(1)}>
                ← Go Back
              </Button>
              <Button className="font-mono text-[11px] uppercase tracking-wider" disabled={missingRequired.length > 0} onClick={() => setStep(3)}>
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
            <div className="overflow-x-auto border border-border/40 rounded-none">
              <Table>
                <TableHeader>
                  <TableRow>
                    {SALES_ORDER_FIELDS.filter((f) => mapping[f.key]).map((f) => (
                      <TableHead key={f.key}>{f.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((row: any[], i: number) => (
                    <TableRow key={i}>
                      {SALES_ORDER_FIELDS.filter((f) => mapping[f.key]).map((f) => (
                        <TableCell key={f.key}>{row[columns.indexOf(mapping[f.key])] ?? ""}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {result ? (
              <div className="border border-emerald-500/30 rounded-none p-4 bg-card text-sm space-y-1">
                <p>✅ Imported: {result.imported}</p>
                <p>⏭️ Skipped: {result.skipped}</p>
                {result.errors?.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-red-500">{result.errors.length} row error(s)</summary>
                    <ul className="list-disc list-inside">
                      {result.errors.map((e: string, i: number) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <Button className="mt-2 font-mono text-[11px] uppercase tracking-wider" onClick={() => router.push("/sales/sales-orders")}>
                  Done
                </Button>
              </div>
            ) : (
              <div className="flex justify-between pt-2">
                <Button variant="outline" className="rounded-none border-border/40 font-mono text-[11px] uppercase tracking-wider" onClick={() => setStep(2)}>
                  ← Go Back
                </Button>
                <Button className="font-mono text-[11px] uppercase tracking-wider" onClick={handleImport} disabled={importing}>
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
