"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, Info } from "lucide-react";

import { PASSWORD_POLICY, PASSWORD_POLICY_HELP_TEXT as PASSWORD_HELP } from "@/lib/sales/passwordPolicy";

interface ExportInvoicePaymentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportInvoicePaymentsDialog({ open, onOpenChange }: ExportInvoicePaymentsDialogProps) {
  const [period, setPeriod] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // No export-template mechanism exists for Payments yet (unlike, say, invoice PDF
  // templates) — this is a cosmetic dropdown so the dialog matches the spec's layout;
  // it doesn't feed into the export request at all.
  const [exportTemplate, setExportTemplate] = useState("standard");
  const [decimalFormat, setDecimalFormat] = useState("1234567.89");
  const [fileFormat, setFileFormat] = useState("csv");
  const [includePii, setIncludePii] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (password && !PASSWORD_POLICY.test(password)) {
      toast.error(PASSWORD_HELP);
      return;
    }
    setExporting(true);
    try {
      const res = await fetch("/api/sales/payments/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "invoice_payments",
          period,
          dateFrom: period !== "all" ? dateFrom : undefined,
          dateTo: period !== "all" ? dateTo : undefined,
          decimalFormat,
          format: fileFormat,
          includePii,
          password: password || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice_payments.${fileFormat}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export started");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <h2 className="text-lg font-semibold mb-1 pr-6">Export Invoice Payments</h2>
        <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 text-xs px-3 py-2 rounded-none mb-4">
          You can export your data in CSV, XLS or XLSX format.
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <Label className="mb-2 block">Which invoice payments?</Label>
            <RadioGroup value={period} onValueChange={setPeriod} className="text-sm">
              <label className="flex items-center gap-2">
                <RadioGroupItem value="all" /> All Invoice Payments
              </label>
              <label className="flex items-center gap-2">
                <RadioGroupItem value="period" /> Specific Period
              </label>
            </RadioGroup>
            {period === "period" && (
              <div className="flex items-center gap-2 mt-2">
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <span className="text-muted-foreground text-xs">to</span>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1">
              Export Template
              <Info className="w-3.5 h-3.5 text-muted-foreground" />
            </Label>
            <Select value={exportTemplate} onValueChange={setExportTemplate}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>
              Decimal Format <span className="text-red-500">*</span>
            </Label>
            <Select value={decimalFormat} onValueChange={setDecimalFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1234567.89">1,234,567.89</SelectItem>
                <SelectItem value="1234567,89">1.234.567,89</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-2 block">
              Export File Format <span className="text-red-500">*</span>
            </Label>
            <RadioGroup value={fileFormat} onValueChange={setFileFormat} className="text-sm">
              <label className="flex items-center gap-2">
                <RadioGroupItem value="csv" /> CSV
              </label>
              <label className="flex items-center gap-2">
                <RadioGroupItem value="xls" /> XLS (Excel 1997-2004 Compatible)
              </label>
              <label className="flex items-center gap-2">
                <RadioGroupItem value="xlsx" /> XLSX (Microsoft Excel)
              </label>
            </RadioGroup>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={includePii} onCheckedChange={(v) => setIncludePii(!!v)} className="mt-0.5" />
            <span>Include Sensitive Personally Identifiable Information (PII) while exporting</span>
          </label>

          <div className="space-y-1.5">
            <Label>File Protection Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{PASSWORD_HELP}</p>
          </div>

          <p className="text-xs text-muted-foreground">
            You can export only the first 25,000 rows via this dialog. For larger exports, use{" "}
            <span className="text-blue-600 underline cursor-pointer">Backup Your Data</span>.
          </p>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="font-mono text-[11px] uppercase tracking-wider" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting..." : "Export"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
