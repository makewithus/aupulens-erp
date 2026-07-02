"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { MultiAccountPicker, type PickerAccount } from "@/components/finance/accounting/AccountPicker";
import { classifyBudgetSegment, getFiscalYearOptions, getCurrentFiscalYear, getPeriodLabels } from "@/lib/accounting/budgetSegments";
import type { BudgetSegment } from "@/lib/constants/statuses";

interface AccountWithSegment extends PickerAccount {
  segment: BudgetSegment;
}

type AmountsMap = Record<string, Record<string, number>>;

function SegmentSection({
  title,
  segment,
  allAccounts,
  selectedIds,
  setSelectedIds,
  periods,
  amounts,
  setAmounts,
}: {
  title: string;
  segment: BudgetSegment;
  allAccounts: AccountWithSegment[];
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  periods: string[];
  amounts: AmountsMap;
  setAmounts: (a: AmountsMap) => void;
}) {
  const options = allAccounts.filter((a) => a.segment === segment);
  const selectedAccounts = options.filter((a) => selectedIds.includes(a._id));

  const setAmount = (accountId: string, periodLabel: string, value: number) => {
    setAmounts({
      ...amounts,
      [accountId]: { ...(amounts[accountId] || {}), [periodLabel]: value },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{title}</label>
        <MultiAccountPicker accounts={options} value={selectedIds} onChange={setSelectedIds} placeholder="Add Accounts" className="w-64" />
      </div>

      {selectedAccounts.length > 0 && (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b text-xs text-muted-foreground">
              <tr>
                <th className="text-left py-2 px-3 font-medium sticky left-0 bg-muted/50">Account</th>
                {periods.map((p) => (
                  <th key={p} className="text-right py-2 px-3 font-medium whitespace-nowrap">
                    {p}
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {selectedAccounts.map((a) => (
                <tr key={a._id} className="border-b last:border-0">
                  <td className="py-1.5 px-3 sticky left-0 bg-card">{a.accountName}</td>
                  {periods.map((p) => (
                    <td key={p} className="py-1 px-1">
                      <Input
                        type="number"
                        className="text-right h-8 w-24 border-0 shadow-none focus-visible:ring-1"
                        value={amounts[a._id]?.[p] ?? ""}
                        onChange={(e) => setAmount(a._id, p, Number(e.target.value) || 0)}
                        placeholder="0.00"
                      />
                    </td>
                  ))}
                  <td className="px-2">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedIds(selectedIds.filter((id) => id !== a._id))}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function BudgetForm({ budgetId }: { budgetId?: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const editId = budgetId;

  const [accounts, setAccounts] = useState<AccountWithSegment[]>([]);
  const [loading, setLoading] = useState(!!editId);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [fiscalYear, setFiscalYear] = useState(getCurrentFiscalYear());
  const [period, setPeriod] = useState<"monthly" | "quarterly" | "yearly">("monthly");
  const [showBalanceSheet, setShowBalanceSheet] = useState(false);

  const [incomeIds, setIncomeIds] = useState<string[]>([]);
  const [expenseIds, setExpenseIds] = useState<string[]>([]);
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [liabilityIds, setLiabilityIds] = useState<string[]>([]);
  const [equityIds, setEquityIds] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<AmountsMap>({});

  const fiscalYearOptions = useMemo(() => getFiscalYearOptions(), []);
  const periods = useMemo(() => getPeriodLabels(fiscalYear, period), [fiscalYear, period]);

  useEffect(() => {
    fetch("/api/finance/accounting/accounts?view=active")
      .then((r) => r.json())
      .then((d) =>
        setAccounts(
          (d.accounts || []).map((a: any) => ({
            _id: a._id,
            accountName: a.accountName,
            accountCode: a.accountCode,
            segment: classifyBudgetSegment(a.accountType?.segment),
          })),
        ),
      )
      .catch(() => toast.error("Failed to load accounts"));
  }, []);

  useEffect(() => {
    if (!editId) return;
    fetch(`/api/finance/accounting/budgets/${editId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.message);
        const b = d.data;
        setName(b.name);
        setFiscalYear(b.fiscalYear);
        setPeriod(b.period);
        setShowBalanceSheet(!!b.includeBalanceSheetAccounts);
        const byId = { income: [] as string[], expense: [] as string[], asset: [] as string[], liability: [] as string[], equity: [] as string[] };
        const amt: AmountsMap = {};
        for (const line of b.lines || []) {
          const accId = line.accountId?._id || line.accountId;
          (byId as any)[line.segment]?.push(accId);
          amt[accId] = {};
          for (const a of line.amounts || []) amt[accId][a.periodLabel] = a.amount;
        }
        setIncomeIds(byId.income);
        setExpenseIds(byId.expense);
        setAssetIds(byId.asset);
        setLiabilityIds(byId.liability);
        setEquityIds(byId.equity);
        setAmounts(amt);
      })
      .catch(() => toast.error("Failed to load budget"))
      .finally(() => setLoading(false));
  }, [editId]);

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Name is required");

    const lines = [
      ...incomeIds.map((id) => ({ accountId: id, segment: "income", amounts: periods.map((p) => ({ periodLabel: p, amount: amounts[id]?.[p] || 0 })) })),
      ...expenseIds.map((id) => ({ accountId: id, segment: "expense", amounts: periods.map((p) => ({ periodLabel: p, amount: amounts[id]?.[p] || 0 })) })),
      ...assetIds.map((id) => ({ accountId: id, segment: "asset", amounts: periods.map((p) => ({ periodLabel: p, amount: amounts[id]?.[p] || 0 })) })),
      ...liabilityIds.map((id) => ({ accountId: id, segment: "liability", amounts: periods.map((p) => ({ periodLabel: p, amount: amounts[id]?.[p] || 0 })) })),
      ...equityIds.map((id) => ({ accountId: id, segment: "equity", amounts: periods.map((p) => ({ periodLabel: p, amount: amounts[id]?.[p] || 0 })) })),
    ];

    if (lines.length === 0) return toast.error("Add at least one account to the budget");

    setSaving(true);
    try {
      const payload = { name, fiscalYear, period, lines, includeBalanceSheetAccounts: showBalanceSheet };
      const url = editId ? `/api/finance/accounting/budgets/${editId}` : "/api/finance/accounting/budgets";
      const res = await fetch(url, {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save budget");
      toast.success(editId ? "Budget updated" : "Budget created");
      router.push("/finance/accounting/budgets");
    } catch (e: any) {
      toast.error(e.message || "Failed to save budget");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="New Budget"
      breadcrumbs={[
        { label: "Finance", href: "/finance/summary" },
        { label: "Accounting" },
        { label: "Budgets", href: "/finance/accounting/budgets" },
        { label: editId ? "Edit Budget" : "New Budget" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-5xl mx-auto">
        <div className="bg-card text-card-foreground rounded-lg border shadow-sm">
          <div className="flex items-center justify-between px-8 py-5 border-b border-border">
            <h2 className="text-xl font-semibold">{editId ? "Edit Budget" : "New Budget"}</h2>
            <Button variant="ghost" size="icon" onClick={() => router.push("/finance/accounting/budgets")}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {loading ? (
            <div className="p-10 text-center text-muted-foreground">Loading...</div>
          ) : (
            <div className="px-8 py-6 space-y-8">
              <div className="grid grid-cols-[220px_1fr] items-center gap-4">
                <label className="text-sm font-medium">
                  Name<span className="text-red-500">*</span>
                </label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-md" placeholder="e.g. FY 2026-27 Budget" />
              </div>

              <div className="grid grid-cols-[220px_1fr] items-center gap-4">
                <label className="text-sm font-medium">
                  Fiscal Year<span className="text-red-500">*</span>
                </label>
                <Select value={fiscalYear} onValueChange={setFiscalYear}>
                  <SelectTrigger className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fiscalYearOptions.map((fy) => (
                      <SelectItem key={fy} value={fy}>
                        {fy}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-[220px_1fr] items-center gap-4">
                <label className="text-sm font-medium">
                  Budget Period<span className="text-red-500">*</span>
                </label>
                <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
                  <SelectTrigger className="max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t border-border pt-6 space-y-6">
                <p className="text-xs font-semibold tracking-wider text-muted-foreground">INCOME AND EXPENSE ACCOUNTS</p>

                <SegmentSection
                  title="Income Accounts"
                  segment="income"
                  allAccounts={accounts}
                  selectedIds={incomeIds}
                  setSelectedIds={setIncomeIds}
                  periods={periods}
                  amounts={amounts}
                  setAmounts={setAmounts}
                />

                <SegmentSection
                  title="Expense Accounts"
                  segment="expense"
                  allAccounts={accounts}
                  selectedIds={expenseIds}
                  setSelectedIds={setExpenseIds}
                  periods={periods}
                  amounts={amounts}
                  setAmounts={setAmounts}
                />
              </div>

              <div>
                <button
                  type="button"
                  className="flex items-center gap-1 text-primary text-sm font-medium"
                  onClick={() => setShowBalanceSheet(!showBalanceSheet)}
                >
                  {showBalanceSheet ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Include Asset, Liability, and Equity Accounts in Budget
                </button>

                {showBalanceSheet && (
                  <div className="mt-4 space-y-6">
                    <SegmentSection
                      title="Asset Accounts"
                      segment="asset"
                      allAccounts={accounts}
                      selectedIds={assetIds}
                      setSelectedIds={setAssetIds}
                      periods={periods}
                      amounts={amounts}
                      setAmounts={setAmounts}
                    />
                    <SegmentSection
                      title="Liability Accounts"
                      segment="liability"
                      allAccounts={accounts}
                      selectedIds={liabilityIds}
                      setSelectedIds={setLiabilityIds}
                      periods={periods}
                      amounts={amounts}
                      setAmounts={setAmounts}
                    />
                    <SegmentSection
                      title="Equity Accounts"
                      segment="equity"
                      allAccounts={accounts}
                      selectedIds={equityIds}
                      setSelectedIds={setEquityIds}
                      periods={periods}
                      amounts={amounts}
                      setAmounts={setAmounts}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="px-8 py-4 border-t border-border bg-muted/30 flex space-x-3 rounded-b-lg">
            <Button className="font-medium px-6" onClick={handleSave} disabled={saving || loading}>
              {saving ? "Saving..." : "Create Budget"}
            </Button>
            <Button variant="outline" className="font-medium px-6 bg-background" onClick={() => router.push("/finance/accounting/budgets")}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
