"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search } from "lucide-react";
import { CUSTOM_FIELD_TYPE } from "@/lib/constants/statuses";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const FIELD_TYPES = [
  { value: CUSTOM_FIELD_TYPE.TEXT, label: "Text" },
  { value: CUSTOM_FIELD_TYPE.NUMBER, label: "Number" },
  { value: CUSTOM_FIELD_TYPE.DATE, label: "Date" },
  { value: CUSTOM_FIELD_TYPE.DROPDOWN, label: "Dropdown" },
  { value: CUSTOM_FIELD_TYPE.CHECKBOX, label: "Checkbox" },
];

export function ManageCustomFieldsDrawer({ open, onOpenChange }: Props) {
  const [fields, setFields] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<string>(CUSTOM_FIELD_TYPE.TEXT);
  const [optionsText, setOptionsText] = useState("");
  const [required, setRequired] = useState(false);
  const [showInAllPdfs, setShowInAllPdfs] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sales/payments/custom-fields");
      const data = await res.json();
      if (data.success) setFields(data.data);
    } catch {
      toast.error("Failed to load custom fields");
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const resetForm = () => {
    setLabel("");
    setFieldType(CUSTOM_FIELD_TYPE.TEXT);
    setOptionsText("");
    setRequired(false);
    setShowInAllPdfs(false);
    setCreating(false);
  };

  const handleCreate = async () => {
    if (!label.trim()) {
      toast.error("Field name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sales/payments/custom-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          fieldType,
          options: fieldType === CUSTOM_FIELD_TYPE.DROPDOWN
            ? optionsText.split(",").map((o) => o.trim()).filter(Boolean)
            : [],
          required,
          showInAllPdfs,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to create field");
      toast.success("Custom field created");
      resetForm();
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (field: any) => {
    try {
      const res = await fetch(`/api/sales/payments/custom-fields/${field._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: field.status === "active" ? "inactive" : "active" }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      toast.success("Field updated");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to update field");
    }
  };

  const filtered = fields.filter((f) => f.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Fields</h2>
            <a href="/sales/document-settings" className="text-xs text-blue-600 underline">
              All Preferences
            </a>
          </div>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setCreating((c) => !c)}>
            <Plus className="w-4 h-4 mr-1" /> New
          </Button>
        </div>

        {creating && (
          <div className="border rounded-none p-4 space-y-3 mb-4 bg-muted/30">
            <div className="space-y-1.5">
              <Label>Field Name*</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data Type</Label>
              <Select value={fieldType} onValueChange={setFieldType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fieldType === CUSTOM_FIELD_TYPE.DROPDOWN && (
              <div className="space-y-1.5">
                <Label>Options (comma separated)</Label>
                <Input value={optionsText} onChange={(e) => setOptionsText(e.target.value)} placeholder="Option 1, Option 2" />
              </div>
            )}
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Mandatory
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={showInAllPdfs} onChange={(e) => setShowInAllPdfs(e.target.checked)} /> Show in all PDFs
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={resetForm}>
                Cancel
              </Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleCreate} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}

        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search Field Name" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center max-w-sm mx-auto">
            Do you have information that doesn&apos;t go under any existing field? Go ahead and create a new field.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field Name</TableHead>
                <TableHead>Data Type</TableHead>
                <TableHead>Mandatory</TableHead>
                <TableHead>Show in all PDFs</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f) => (
                <TableRow key={f._id}>
                  <TableCell className="font-medium">{f.label}</TableCell>
                  <TableCell className="capitalize">{f.fieldType}</TableCell>
                  <TableCell>{f.required ? "Yes" : "No"}</TableCell>
                  <TableCell>{f.showInAllPdfs ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <button
                      className={`text-xs px-2 py-0.5 rounded-none border ${
                        f.status === "active"
                          ? "bg-green-100 text-green-700 border-green-200"
                          : "bg-accent text-muted-foreground border-border"
                      }`}
                      onClick={() => toggleStatus(f)}
                    >
                      {f.status}
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SheetContent>
    </Sheet>
  );
}
