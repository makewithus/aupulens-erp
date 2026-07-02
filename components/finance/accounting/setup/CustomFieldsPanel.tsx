"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { confirmDialog } from "@/components/providers/ConfirmRoot";

const FIELD_TYPES = ["text", "number", "date", "dropdown", "checkbox"];

export function CustomFieldsPanel({ appliesTo }: { appliesTo: "account" | "journal" }) {
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchFields = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/accounting/custom-fields?appliesTo=${appliesTo}`);
      const data = await res.json();
      if (data.success) setFields(data.data);
    } catch {
      toast.error("Failed to load custom fields");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFields();
  }, [appliesTo]);

  const handleAdd = async () => {
    if (!label.trim()) return toast.error("Label is required");
    setSaving(true);
    try {
      const res = await fetch("/api/finance/accounting/custom-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appliesTo,
          label,
          fieldType,
          required,
          options: fieldType === "dropdown" ? options.split(",").map((o) => o.trim()).filter(Boolean) : [],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to add field");
      toast.success("Custom field added");
      setLabel("");
      setOptions("");
      setRequired(false);
      fetchFields();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ title: "Delete custom field?" });
    if (!ok) return;
    const res = await fetch(`/api/finance/accounting/custom-fields/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      toast.success("Deleted");
      fetchFields();
    } else toast.error(data.message);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Label</label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} className="w-48" placeholder="e.g. Cost Center" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Type</label>
          <Select value={fieldType} onValueChange={setFieldType}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {fieldType === "dropdown" && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Options (comma-separated)</label>
            <Input value={options} onChange={(e) => setOptions(e.target.value)} className="w-56" placeholder="Option A, Option B" />
          </div>
        )}
        <div className="flex items-center space-x-2 pb-2">
          <Checkbox id="required" checked={required} onCheckedChange={(v) => setRequired(!!v)} />
          <label htmlFor="required" className="text-sm">
            Required
          </label>
        </div>
        <Button onClick={handleAdd} disabled={saving}>
          <Plus className="h-4 w-4 mr-2" /> Add Field
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>LABEL</TableHead>
            <TableHead>TYPE</TableHead>
            <TableHead>REQUIRED</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-6">
                Loading...
              </TableCell>
            </TableRow>
          ) : fields.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                No custom fields defined.
              </TableCell>
            </TableRow>
          ) : (
            fields.map((f) => (
              <TableRow key={f._id}>
                <TableCell className="font-medium">{f.label}</TableCell>
                <TableCell className="capitalize">{f.fieldType}</TableCell>
                <TableCell>{f.required ? "Yes" : "No"}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(f._id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
