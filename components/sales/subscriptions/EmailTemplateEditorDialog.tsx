"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface EmailTemplateEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateKey: string;
  title?: string;
  defaultName?: string;
  defaultSubject?: string;
  defaultBody?: string;
}

// Shared by Reminders, Dunning Management, and Email Notifications — one
// generic "edit this email template" dialog backed by models/EmailTemplate.ts
// instead of three separate ad-hoc editors.
export function EmailTemplateEditorDialog({
  open,
  onOpenChange,
  templateKey,
  title = "Edit Email Template",
  defaultName,
  defaultSubject,
  defaultBody,
}: EmailTemplateEditorDialogProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (defaultName) params.set("name", defaultName);
    if (defaultSubject) params.set("subject", defaultSubject);
    if (defaultBody) params.set("body", defaultBody);
    fetch(`/api/sales/email-templates/${encodeURIComponent(templateKey)}?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setSubject(d.data.subject);
          setBody(d.data.body);
        }
      })
      .finally(() => setLoading(false));
  }, [open, templateKey, defaultName, defaultSubject, defaultBody]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/sales/email-templates/${encodeURIComponent(templateKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save template");
      toast.success("Template saved");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <h2 className="text-lg font-semibold mb-4">{title}</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Body</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
              <p className="text-xs text-muted-foreground">
                Supports placeholders like {"{{customerName}}"}, {"{{companyName}}"}, {"{{amount}}"}.
              </p>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="font-mono text-[11px] uppercase tracking-wider" onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
