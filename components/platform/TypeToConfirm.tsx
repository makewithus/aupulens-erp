"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Phase 11 Part 1.6: "type-to-confirm plus a stated consequence, not a bare
 * 'are you sure'" — the plan editor's own confirmation pattern (a dedicated
 * confirm section, disabled submit until satisfied), extended with an
 * exact-text match for the three privileged actions the brief names
 * (manage global admins, security configuration — delete-organisation is
 * deliberately not built, see docs/admin/OPEN_QUESTIONS.md).
 *
 * `confirmText` is the exact string the operator must type — e.g. the
 * admin's email for suspending them, "CONFIRM" for a lower-stakes change.
 * The reason field is always required and audited by the caller, matching
 * the plan editor's own convention.
 */
export function TypeToConfirm({
  open,
  onOpenChange,
  title,
  consequence,
  confirmText,
  reason,
  onReasonChange,
  onConfirm,
  submitting,
  confirmLabel = "Confirm",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  consequence: string;
  confirmText: string;
  reason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  submitting: boolean;
  confirmLabel?: string;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed === confirmText;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setTyped("");
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-amber-700 dark:text-amber-300 border border-amber-300 bg-amber-50 dark:bg-amber-950 rounded-md p-3">
            {consequence}
          </p>
          <div className="space-y-1">
            <Label>
              Type <span className="font-mono font-semibold">{confirmText}</span> to confirm
            </Label>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1">
            <Label>Reason (required, audited)</Label>
            <Textarea value={reason} onChange={(e) => onReasonChange(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!matches || !reason.trim() || submitting} onClick={onConfirm}>
            {submitting ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
