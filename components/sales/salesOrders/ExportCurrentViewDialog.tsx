"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff } from "lucide-react";

import { PASSWORD_POLICY, PASSWORD_POLICY_HELP_TEXT as PASSWORD_HELP } from "@/lib/sales/passwordPolicy";

interface ExportCurrentViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewId: string;
  viewName?: string;
}

export function ExportCurrentViewDialog({ open, onOpenChange, viewId, viewName }: ExportCurrentViewDialogProps) {
  const [decimalFormat, setDecimalFormat] = useState("1234567.89");
  const [fileFormat, setFileFormat] = useState("csv");
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
      const res = await fetch("/api/sales/sales-orders/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "current_view", viewId, decimalFormat, format: fileFormat, password: password || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sales_orders_current_view.${fileFormat}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export started");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <h2 className="text-lg font-semibold mb-1">Export Current View</h2>
        <div className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 text-xs px-3 py-2 rounded-none mb-4">
          Only the current view ({viewName || "All"}) with its visible columns will be exported, in CSV or XLS format.
        </div>

        <div className="space-y-4">
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

          <div className="space-y-1.5">
            <Label>File Protection Password</Label>
            <div className="relative">
              <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{PASSWORD_HELP}</p>
          </div>

          <p className="text-xs text-muted-foreground">
            You can export only the first 10,000 rows via this dialog. For larger exports, use{" "}
            <span className="text-blue-600 underline cursor-pointer">Backup Your Data</span>.
          </p>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting..." : "Export"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
