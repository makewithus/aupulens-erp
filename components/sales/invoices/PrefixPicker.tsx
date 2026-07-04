"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Check, X } from "lucide-react";

export interface PrefixRow {
  _id: string;
  value: string;
  isDefault: boolean;
}

const ADD_NEW = "__add_new__";

export function PrefixPicker({
  prefixes,
  value,
  onChange,
  onCreated,
}: {
  prefixes: PrefixRow[];
  value: string;
  onChange: (value: string) => void;
  onCreated: (row: PrefixRow) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  const submitNew = async () => {
    if (!newValue.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/sales/document-prefixes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType: "invoice", kind: "prefix", value: newValue.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        onCreated(data.data);
        onChange(data.data.value);
        setAdding(false);
        setNewValue("");
      }
    } finally {
      setSaving(false);
    }
  };

  if (adding) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="e.g. TAX-"
          className="h-8 w-24 text-sm"
          onKeyDown={(e) => e.key === "Enter" && submitNew()}
        />
        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={saving} onClick={submitNew}>
          <Check className="h-4 w-4 text-green-600" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setAdding(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v === ADD_NEW) {
          setAdding(true);
          return;
        }
        onChange(v);
      }}
    >
      <SelectTrigger className="border-0 bg-transparent h-8 w-28 rounded-none focus:ring-0 text-sm font-medium">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {prefixes.map((p) => (
          <SelectItem key={p._id} value={p.value}>
            {p.value}
          </SelectItem>
        ))}
        <SelectItem value={ADD_NEW} className="text-blue-600 font-medium">
          <span className="flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" /> Add custom prefix
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
