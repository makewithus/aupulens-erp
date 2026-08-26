"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { EmailTemplateEditorDialog } from "@/components/sales/subscriptions/EmailTemplateEditorDialog";
import {
  DUNNING_FINAL_SUBSCRIPTION_ACTION,
  DUNNING_FINAL_INVOICE_ACTION,
} from "@/lib/constants/statuses";

interface Criterion {
  field: string;
  comparator: string;
  value: string;
}

interface RetryStep {
  afterDays: number;
  action: string;
}

interface ChannelConfig {
  onSuccessAction: string;
  onFailureAction: string;
  retries: RetryStep[];
  finalSubscriptionAction: string;
  finalInvoiceAction: string;
}

const DEFAULT_CHANNEL: ChannelConfig = {
  onSuccessAction: "send_thank_you_email",
  onFailureAction: "send_payment_failure_email",
  retries: [
    { afterDays: 3, action: "send_payment_failure_email" },
    { afterDays: 3, action: "send_payment_failure_email" },
    { afterDays: 3, action: "send_payment_failure_email" },
  ],
  finalSubscriptionAction: DUNNING_FINAL_SUBSCRIPTION_ACTION.DO_NOTHING,
  finalInvoiceAction: DUNNING_FINAL_INVOICE_ACTION.DO_NOTHING,
};

export interface DunningRuleFormValue {
  name: string;
  criteria: Criterion[];
  paymentMethod: "cards" | "upi_mandates";
  autocharge: ChannelConfig;
  manual: ChannelConfig;
}

export const EMPTY_DUNNING_RULE: DunningRuleFormValue = {
  name: "",
  criteria: [],
  paymentMethod: "cards",
  autocharge: DEFAULT_CHANNEL,
  manual: { ...DEFAULT_CHANNEL, retries: [{ afterDays: 7, action: "send_overdue_email" }] },
};

function ChannelEditor({
  channel,
  onChange,
  ruleId,
  channelKey,
}: {
  channel: ChannelConfig;
  onChange: (c: ChannelConfig) => void;
  ruleId?: string;
  channelKey: string;
}) {
  const [templateOpen, setTemplateOpen] = useState<string | null>(null);
  const update = (patch: Partial<ChannelConfig>) => onChange({ ...channel, ...patch });

  const addRetry = () => update({ retries: [...channel.retries, { afterDays: 3, action: "send_payment_failure_email" }] });
  const removeRetry = (i: number) => update({ retries: channel.retries.filter((_, idx) => idx !== i) });
  const updateRetry = (i: number, patch: Partial<RetryStep>) =>
    update({ retries: channel.retries.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });

  const templateLink = (label: string, key: string) => (
    <button
      type="button"
      className="font-mono text-[11px] uppercase tracking-wider text-primary underline"
      disabled={!ruleId}
      onClick={() => setTemplateOpen(key)}
      title={ruleId ? undefined : "Save the rule first to edit its templates"}
    >
      {label} ▾
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="border border-border/40 rounded-none p-4 space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">On Payment Success</p>
          <p className="text-sm">Send Thank-you Email along with the Invoice</p>
          {templateLink("Default", `${channelKey}:on-success`)}
        </div>
        <div className="border border-border/40 rounded-none p-4 space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">On Payment Failure</p>
          <p className="text-sm">Send Payment Failure Email Notification &amp; Retry Payment</p>
          {templateLink("Default", `${channelKey}:on-failure`)}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Retry Preferences</h3>
        <div className="space-y-3 border-l-2 border-dashed border-border/40 pl-4">
          {channel.retries.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-xs text-muted-foreground w-20">
                {["First", "Second", "Third", "Fourth", "Fifth"][i] || `#${i + 1}`} Retry
              </span>
              <Input
                type="number"
                className="w-16 h-8"
                min={0}
                value={r.afterDays}
                onChange={(e) => updateRetry(i, { afterDays: Number(e.target.value) })}
              />
              <span className="text-xs text-muted-foreground">days after. If it fails:</span>
              <span className="text-xs">Send Payment Failure Email Notification</span>
              {templateLink("Default", `${channelKey}:retry-${i}`)}
              <button onClick={() => removeRetry(i)}>
                <Trash2 className="w-3.5 h-3.5 text-red-600" />
              </button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="mt-2" onClick={addRetry}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Retry
        </Button>
      </div>

      <div>
        <p className="text-sm mb-2">If the payment fails, then select the final action for:</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Subscriptions</Label>
            <Select
              value={channel.finalSubscriptionAction}
              onValueChange={(v) => update({ finalSubscriptionAction: v })}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DUNNING_FINAL_SUBSCRIPTION_ACTION.DO_NOTHING}>Do Nothing</SelectItem>
                <SelectItem value={DUNNING_FINAL_SUBSCRIPTION_ACTION.MARK_UNPAID}>Mark as Unpaid</SelectItem>
                <SelectItem value={DUNNING_FINAL_SUBSCRIPTION_ACTION.CANCEL_SUBSCRIPTION}>Cancel Subscription</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Invoices</Label>
            <Select value={channel.finalInvoiceAction} onValueChange={(v) => update({ finalInvoiceAction: v })}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DUNNING_FINAL_INVOICE_ACTION.DO_NOTHING}>Do Nothing</SelectItem>
                <SelectItem value={DUNNING_FINAL_INVOICE_ACTION.WRITE_OFF}>Write Off</SelectItem>
                <SelectItem value={DUNNING_FINAL_INVOICE_ACTION.MARK_VOID}>Mark as Void</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {templateOpen && (
        <EmailTemplateEditorDialog
          open={!!templateOpen}
          onOpenChange={(open) => !open && setTemplateOpen(null)}
          templateKey={`dunning:${ruleId}:${templateOpen.split(":").slice(1).join(":")}`}
          title="Edit Email Template"
        />
      )}
    </div>
  );
}

export function DunningRuleForm({
  initialValue,
  ruleId,
}: {
  initialValue?: DunningRuleFormValue;
  ruleId?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState<DunningRuleFormValue>(initialValue || EMPTY_DUNNING_RULE);
  const [tab, setTab] = useState<"autocharge" | "manual">("autocharge");
  const [saving, setSaving] = useState(false);

  const addCriterion = () => setValue((v) => ({ ...v, criteria: [...v.criteria, { field: "status", comparator: "equals", value: "" }] }));
  const removeCriterion = (i: number) => setValue((v) => ({ ...v, criteria: v.criteria.filter((_, idx) => idx !== i) }));
  const updateCriterion = (i: number, patch: Partial<Criterion>) =>
    setValue((v) => ({ ...v, criteria: v.criteria.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));

  const handleSave = async () => {
    if (!value.name.trim()) {
      toast.error("Rule Name is required");
      return;
    }
    setSaving(true);
    try {
      const url = ruleId ? `/api/sales/dunning-rules/${ruleId}` : "/api/sales/dunning-rules";
      const method = ruleId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save dunning rule");
      toast.success("Dunning rule saved");
      router.push("/sales/subscriptions/settings/dunning");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10">
      <div className="space-y-1.5 max-w-md">
        <Label>
          Rule Name <span className="text-red-500">*</span>
        </Label>
        <Input value={value.name} onChange={(e) => setValue((v) => ({ ...v, name: e.target.value }))} />
      </div>

      <div>
        <h2 className="font-semibold mb-3">Define the Criteria</h2>
        <div className="space-y-2">
          {value.criteria.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
              <Input
                className="w-48"
                placeholder="Field"
                value={c.field}
                onChange={(e) => updateCriterion(i, { field: e.target.value })}
              />
              <Input
                className="w-40"
                placeholder="Comparator"
                value={c.comparator}
                onChange={(e) => updateCriterion(i, { comparator: e.target.value })}
              />
              <Input className="w-56" value={c.value} onChange={(e) => updateCriterion(i, { value: e.target.value })} />
              <button onClick={() => removeCriterion(i)}>
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="mt-3" onClick={addCriterion}>
          <Plus className="w-4 h-4 mr-1" /> Add Criterion
        </Button>
      </div>

      <div className="flex items-center gap-4 border-b border-border/40">
        <button
          className={`pb-2 px-1 font-mono text-[11px] uppercase tracking-wider ${tab === "autocharge" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
          onClick={() => setTab("autocharge")}
        >
          Subscriptions with autocharge
        </button>
        <button
          className={`pb-2 px-1 font-mono text-[11px] uppercase tracking-wider ${tab === "manual" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
          onClick={() => setTab("manual")}
        >
          Subscriptions without autocharge
        </button>
      </div>

      {tab === "autocharge" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="inline-flex border border-border/40 rounded-none overflow-hidden text-sm">
              {(["cards", "upi_mandates"] as const).map((m) => (
                <button
                  key={m}
                  className={`px-3 py-1.5 ${value.paymentMethod === m ? "bg-primary text-primary-foreground" : "bg-background"}`}
                  onClick={() => setValue((v) => ({ ...v, paymentMethod: m }))}
                >
                  {m === "cards" ? "Cards" : "UPI Mandates"}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Configure dunning management for payment methods that support autocharge, such as credit or debit cards.
          </p>
          <ChannelEditor
            channel={value.autocharge}
            onChange={(c) => setValue((v) => ({ ...v, autocharge: c }))}
            ruleId={ruleId}
            channelKey="autocharge"
          />
        </div>
      )}

      {tab === "manual" && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Configure the email schedule for subscriptions paid manually (no autocharge) that fall overdue.
          </p>
          <ChannelEditor
            channel={value.manual}
            onChange={(c) => setValue((v) => ({ ...v, manual: c }))}
            ruleId={ruleId}
            channelKey="manual"
          />
        </div>
      )}

      <div className="flex items-center gap-3 pt-4 border-t border-border/40">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/sales/subscriptions/settings/dunning")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
