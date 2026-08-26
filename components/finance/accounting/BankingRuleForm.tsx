"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Plus, Trash2, Info, Wallet, Landmark, CreditCard, SlidersHorizontal } from "lucide-react";
import { AccountPicker, MultiAccountPicker, type PickerAccount } from "@/components/finance/accounting/AccountPicker";

const RECORD_AS_OPTIONS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
  { value: "credit_card_payment", label: "Credit Card Payment" },
  { value: "owner_drawings", label: "Owner Drawings" },
  { value: "owner_contribution", label: "Owner's Contribution" },
];

const RECORD_AS_DISABLES: Record<string, string[]> = {
  credit_card_payment: ["all_banks"],
  owner_drawings: ["all_cards"],
  owner_contribution: ["all_cards"],
};

const FIELD_OPTIONS = ["Description", "Amount", "Reference Number", "Payee / Payer"];
const OPERATOR_OPTIONS = ["Contains", "Does not contain", "Is exactly", "Starts with", "Ends with"];
const REFERENCE_NUMBER_OPTIONS = ["None", "Auto-generate", "From Bank Reference", "Manual Entry"];

const ASSOCIATE_MODES = [
  { value: "all_accounts", label: "All Accounts", icon: Wallet },
  { value: "all_banks", label: "All Banks", icon: Landmark },
  { value: "all_cards", label: "All Cards", icon: CreditCard },
  { value: "custom", label: "Custom", icon: SlidersHorizontal },
];

interface Criterion {
  field: string;
  operator: string;
  value: string;
}

export function BankingRuleForm({ ruleId }: { ruleId?: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const editId = ruleId;

  const [accounts, setAccounts] = useState<PickerAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);

  const [ruleName, setRuleName] = useState("");
  const [applyTo, setApplyTo] = useState<"deposits" | "withdrawals">("deposits");
  const [transactionHandling, setTransactionHandling] = useState<"recognized" | "categorized">("recognized");
  const [criteriaMatch, setCriteriaMatch] = useState<"any" | "all">("any");
  const [criteria, setCriteria] = useState<Criterion[]>([{ field: FIELD_OPTIONS[0], operator: OPERATOR_OPTIONS[0], value: "" }]);
  const [recordAs, setRecordAs] = useState("expense");
  const [accountId, setAccountId] = useState<string>("");
  const [referenceNumber, setReferenceNumber] = useState("None");
  const [associateAccountsMode, setAssociateAccountsMode] = useState<"all_accounts" | "all_banks" | "all_cards" | "custom">("custom");
  const [associatedAccountIds, setAssociatedAccountIds] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/finance/accounting/accounts?view=active")
      .then((r) => r.json())
      .then((d) => setAccounts((d.accounts || []).map((a: any) => ({ _id: a._id, accountName: a.accountName, accountCode: a.accountCode }))))
      .catch(() => toast.error("Failed to load accounts"));
  }, []);

  useEffect(() => {
    if (!editId) return;
    fetch(`/api/finance/accounting/banking-rules/${editId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.message);
        const rule = d.data;
        setRuleName(rule.ruleName);
        setApplyTo(rule.applyTo);
        setTransactionHandling(rule.transactionHandling);
        setCriteriaMatch(rule.criteriaMatch);
        setCriteria(rule.criteria?.length ? rule.criteria : [{ field: FIELD_OPTIONS[0], operator: OPERATOR_OPTIONS[0], value: "" }]);
        setRecordAs(rule.recordAs);
        setAccountId(rule.accountId?._id || rule.accountId);
        setReferenceNumber(rule.referenceNumber || "None");
        setAssociateAccountsMode(rule.associateAccountsMode);
        setAssociatedAccountIds((rule.associatedAccountIds || []).map((a: any) => a._id || a));
      })
      .catch(() => toast.error("Failed to load rule"))
      .finally(() => setLoading(false));
  }, [editId]);

  const disabledModes = RECORD_AS_DISABLES[recordAs] || [];

  const addCriterion = () => setCriteria([...criteria, { field: FIELD_OPTIONS[0], operator: OPERATOR_OPTIONS[0], value: "" }]);
  const removeCriterion = (idx: number) => setCriteria(criteria.filter((_, i) => i !== idx));
  const updateCriterion = (idx: number, patch: Partial<Criterion>) =>
    setCriteria(criteria.map((c, i) => (i === idx ? { ...c, ...patch } : c)));

  const handleSave = async () => {
    if (!ruleName.trim()) return toast.error("Rule Name is required");
    if (!accountId) return toast.error("Account is required");
    if (criteria.some((c) => !c.value.trim())) return toast.error("All criteria must have a value");

    setSaving(true);
    try {
      const payload = {
        ruleName,
        applyTo,
        transactionHandling,
        criteriaMatch,
        criteria,
        recordAs,
        accountId,
        referenceNumber: referenceNumber === "None" ? undefined : referenceNumber,
        associateAccountsMode,
        associatedAccountIds: associateAccountsMode === "custom" ? associatedAccountIds : [],
      };
      const url = editId ? `/api/finance/accounting/banking-rules/${editId}` : "/api/finance/accounting/banking-rules";
      const res = await fetch(url, {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save rule");
      toast.success(editId ? "Rule updated" : "Rule created");
      router.push("/finance/accounting/banking/rules");
    } catch (e: any) {
      toast.error(e.message || "Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="New Rules"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Accounting" },
        { label: "Banking Rules", href: "/finance/accounting/banking/rules" },
        { label: editId ? "Edit Rule" : "New Rule" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-5xl mx-auto">
        <div className="bg-card text-card-foreground rounded-lg border shadow-sm">
          <div className="flex items-center justify-between px-8 py-5 border-b border-border">
            <h2 className="text-xl font-semibold">New Rules</h2>
            <Button variant="ghost" size="icon" onClick={() => router.push("/finance/accounting/banking/rules")}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {loading ? (
            <div className="p-10 text-center text-muted-foreground">Loading...</div>
          ) : (
            <div className="px-8 py-6 space-y-8">
              {/* Rule Name */}
              <div className="grid grid-cols-[220px_1fr] items-center gap-4">
                <label className="text-sm font-medium">
                  Rule Name<span className="text-red-500">*</span>
                </label>
                <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} className="max-w-md" placeholder="e.g. Office Rent" />
              </div>

              {/* Apply To */}
              <div className="grid grid-cols-[220px_1fr] items-center gap-4">
                <label className="text-sm font-medium">
                  Apply To<span className="text-red-500">*</span>
                </label>
                <div className="flex items-center space-x-6">
                  {(["deposits", "withdrawals"] as const).map((v) => (
                    <label key={v} className="flex items-center space-x-2 text-sm cursor-pointer capitalize">
                      <input type="radio" name="applyTo" className="accent-primary" checked={applyTo === v} onChange={() => setApplyTo(v)} />
                      <span>{v}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Transaction Handling */}
              <div className="grid grid-cols-[220px_1fr] items-start gap-4">
                <label className="text-sm font-medium pt-1">
                  Transaction Handling<span className="text-red-500">*</span>
                </label>
                <div className="flex items-center space-x-6">
                  <label className="flex items-center space-x-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="handling"
                      className="accent-primary"
                      checked={transactionHandling === "recognized"}
                      onChange={() => setTransactionHandling("recognized")}
                    />
                    <span>Recognized Transactions</span>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </label>
                  <label className="flex items-center space-x-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="handling"
                      className="accent-primary"
                      checked={transactionHandling === "categorized"}
                      onChange={() => setTransactionHandling("categorized")}
                    />
                    <span>Categorized Transactions</span>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </label>
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Criteria */}
              <div className="space-y-4">
                <div className="grid grid-cols-[220px_1fr] items-center gap-4">
                  <label className="text-sm font-medium">
                    Categorise the transactions when<span className="text-red-500">*</span>
                  </label>
                  <Select value={criteriaMatch} onValueChange={(v: "any" | "all") => setCriteriaMatch(v)}>
                    <SelectTrigger className="max-w-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any one of the following criteria matches</SelectItem>
                      <SelectItem value="all">All of the following criteria match</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  {criteria.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="w-6 text-sm text-muted-foreground text-center">{idx + 1}</span>
                      <Select value={c.field} onValueChange={(v) => updateCriterion(idx, { field: v })}>
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_OPTIONS.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={c.operator} onValueChange={(v) => updateCriterion(idx, { operator: v })}>
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPERATOR_OPTIONS.map((o) => (
                            <SelectItem key={o} value={o}>
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={c.value}
                        onChange={(e) => updateCriterion(idx, { value: e.target.value })}
                        placeholder="Value"
                        className="max-w-xs"
                      />
                      {criteria.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => removeCriterion(idx)}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <Button variant="ghost" className="text-primary hover:text-primary hover:bg-primary/10 font-medium px-2" onClick={addCriterion}>
                  <div className="bg-primary/20 rounded-full p-0.5 mr-2">
                    <Plus className="h-4 w-4" />
                  </div>
                  Add Criterion
                </Button>
              </div>

              <div className="border-t border-border" />

              {/* Record As / Account / Reference */}
              <div className="grid grid-cols-[220px_1fr] items-center gap-4">
                <label className="text-sm font-medium">
                  Record As<span className="text-red-500">*</span>
                </label>
                <Select value={recordAs} onValueChange={setRecordAs}>
                  <SelectTrigger className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECORD_AS_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-[220px_1fr] items-center gap-4">
                <label className="text-sm font-medium">
                  Account<span className="text-red-500">*</span>
                </label>
                <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} placeholder="Select an account" className="max-w-md" />
              </div>

              <div className="grid grid-cols-[220px_1fr] items-center gap-4">
                <label className="text-sm font-medium">Reference Number</label>
                <Select value={referenceNumber} onValueChange={setReferenceNumber}>
                  <SelectTrigger className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERENCE_NUMBER_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t border-border" />

              {/* Associate Accounts */}
              <div className="space-y-3">
                <label className="text-sm font-medium block">
                  Associate Accounts<span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-4 gap-3 max-w-2xl">
                  {ASSOCIATE_MODES.map((m) => {
                    const Icon = m.icon;
                    const disabled = disabledModes.includes(m.value);
                    const active = associateAccountsMode === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => setAssociateAccountsMode(m.value as any)}
                        className={`flex flex-col items-center justify-center gap-2 rounded-lg border p-4 text-sm transition-colors ${
                          disabled
                            ? "opacity-40 cursor-not-allowed"
                            : active
                              ? "border-foreground bg-foreground/10 text-foreground font-medium"
                              : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        {m.label}
                      </button>
                    );
                  })}
                </div>

                {associateAccountsMode === "custom" && (
                  <MultiAccountPicker
                    accounts={accounts}
                    value={associatedAccountIds}
                    onChange={setAssociatedAccountIds}
                    placeholder="None"
                    className="max-w-md"
                  />
                )}

                <p className="text-xs text-muted-foreground">
                  Depending on the selected Record As, some Associate Account options may be disabled.
                </p>
              </div>
            </div>
          )}

          <div className="px-8 py-4 border-t border-border bg-muted/30 flex space-x-3 rounded-b-lg">
            <Button className="font-medium px-6" onClick={handleSave} disabled={saving || loading}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" className="font-medium px-6 bg-background" onClick={() => router.push("/finance/accounting/banking/rules")}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
