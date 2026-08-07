"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const ENTITIES = ["Lead", "Opportunity", "Account", "Quote", "Contract", "Case"];
const TRIGGERS = [
  "record_created",
  "field_changed",
  "stage_changed",
  "date_reached",
  "approval_completed",
  "quote_accepted",
  "quote_rejected",
  "no_activity",
  "task_overdue",
  "sla_breached",
  "contract_expiring",
];
const OPERATORS = ["equals", "not_equals", "contains", "greater_than", "less_than", "exists"];
const ACTION_TYPES = [
  "create_task",
  "send_notification",
  "update_field",
  "change_status",
  "assign_owner",
  "create_related_record",
  "add_tag",
  "trigger_approval",
  "send_email",
  "send_whatsapp",
  "send_sms",
  "create_activity",
];

/**
 * Real, functional rule builder (Phase 4) — replaces the "New Rule" button
 * that previously had no onClick handler at all. This is a form, not a
 * drag-and-drop visual canvas (see app/crm/workflows for the React Flow visual builder — same backend) — a deliberate
 * scope decision: the backend (models/crm/AutomationRule.ts,
 * lib/crm/automationEngine.ts) already supports exactly this
 * trigger+conditions+actions shape, and a real form that actually creates a
 * rule the engine will execute is more valuable than a fancier-looking
 * canvas that doesn't persist anything.
 */
export function NewAutomationRuleModal({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [entity, setEntity] = useState("Lead");
  const [trigger, setTrigger] = useState("record_created");
  const [conditionField, setConditionField] = useState("");
  const [conditionOperator, setConditionOperator] = useState("equals");
  const [conditionValue, setConditionValue] = useState("");
  const [actionType, setActionType] = useState("create_task");
  const [actionPayload, setActionPayload] = useState("");

  const reset = () => {
    setName("");
    setEntity("Lead");
    setTrigger("record_created");
    setConditionField("");
    setConditionOperator("equals");
    setConditionValue("");
    setActionType("create_task");
    setActionPayload("");
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Rule name is required");
      return;
    }

    let payload: any = {};
    if (actionPayload.trim()) {
      try {
        payload = JSON.parse(actionPayload);
      } catch {
        toast.error("Action payload must be valid JSON, e.g. {\"title\": \"Follow up\"}");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/crm/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          entity,
          trigger,
          conditions: conditionField.trim()
            ? [{ field: conditionField.trim(), operator: conditionOperator, value: conditionValue }]
            : [],
          actions: [{ type: actionType, payload }],
          enabled: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Automation rule created");
        reset();
        setOpen(false);
        onCreated();
      } else {
        toast.error(data.message || "Failed to create rule");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary h-8 text-xs">
          <Plus className="w-4 h-4 mr-1" /> New Rule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Automation Rule</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Rule Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Notify manager on stuck deal" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Entity</Label>
              <Select value={entity} onValueChange={setEntity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTITIES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Trigger</Label>
              <Select value={trigger} onValueChange={setTrigger}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Condition (optional)</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="field, e.g. stage" value={conditionField} onChange={(e) => setConditionField(e.target.value)} />
              <Select value={conditionOperator} onValueChange={setConditionOperator}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="value" value={conditionValue} onChange={(e) => setConditionValue(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Action</Label>
            <Select value={actionType} onValueChange={setActionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Action Payload (JSON)</Label>
            <Input
              placeholder='{"title": "Follow up with customer"}'
              value={actionPayload}
              onChange={(e) => setActionPayload(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
