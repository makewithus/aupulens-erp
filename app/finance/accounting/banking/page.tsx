"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { AccountingSubNav } from "@/components/finance/accounting/AccountingSubNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Landmark, CreditCard, Wallet, ArrowLeft, ChevronRight } from "lucide-react";
import { MultiAccountPicker } from "@/components/finance/accounting/AccountPicker";

type View = "loading" | "empty" | "connect" | "manual" | "list";

const PROVIDER_ICON = (type: string) => (type === "aggregator" ? Wallet : Landmark);

export default function BankingLandingPage() {
  const { data: session } = useSession();
  const [view, setView] = useState<View>("loading");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [providers, setProviders] = useState<{ partnerBanks: any[]; aggregatorBanks: any[]; isLiveConfigured: boolean }>({
    partnerBanks: [],
    aggregatorBanks: [],
    isLiveConfigured: false,
  });
  const [currencies, setCurrencies] = useState<{ code: string; symbol: string; name: string }[]>([{ code: "INR", symbol: "₹", name: "Indian Rupee" }]);
  const [users, setUsers] = useState<{ _id: string; name: string }[]>([]);

  const [form, setForm] = useState({
    accountType: "bank",
    accountName: "",
    accountCode: "",
    currency: "INR",
    accountNumber: "",
    bankName: "",
    ifsc: "",
    userIds: [] as string[],
    description: "",
    isPrimary: false,
  });
  const [saving, setSaving] = useState(false);

  const fetchAccounts = async () => {
    const res = await fetch("/api/finance/accounting/bank-accounts");
    const data = await res.json();
    if (data.success) {
      setAccounts(data.data);
      return data.data.length > 0;
    }
    return false;
  };

  useEffect(() => {
    (async () => {
      const hasAccounts = await fetchAccounts();
      setView(hasAccounts ? "list" : "empty");
    })();

    fetch("/api/finance/accounting/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.currency?.enabledCurrencies?.length) setCurrencies(d.data.currency.enabledCurrencies);
      })
      .catch(() => {});

    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers((d.users || []).map((u: any) => ({ _id: u._id, name: u.name }))))
      .catch(() => {});
  }, []);

  const openConnect = () => {
    fetch("/api/finance/accounting/bank-feed-providers")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setProviders(d.data);
      })
      .catch(() => toast.error("Failed to load bank providers"));
    setView("connect");
  };

  const handleConnectNow = async (providerId: string, providerName: string) => {
    const res = await fetch("/api/finance/accounting/bank-feed-providers/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId }),
    });
    const data = await res.json();
    if (data.success) {
      toast.success(`Connecting to ${providerName}...`);
    } else if (data.code === "PROVIDER_NOT_CONFIGURED") {
      toast.info(data.message);
    } else {
      toast.error(data.message || "Failed to connect");
    }
  };

  const resetForm = () =>
    setForm({
      accountType: "bank",
      accountName: "",
      accountCode: "",
      currency: currencies[0]?.code || "INR",
      accountNumber: "",
      bankName: "",
      ifsc: "",
      userIds: [],
      description: "",
      isPrimary: false,
    });

  const handleSaveManual = async () => {
    if (!form.accountName.trim()) return toast.error("Account Name is required");
    setSaving(true);
    try {
      const res = await fetch("/api/finance/accounting/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to add account");
      toast.success("Bank account added");
      resetForm();
      await fetchAccounts();
      setView("list");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Banking"
      breadcrumbs={[{ label: "Finance", href: "/finance/summary" }, { label: "Accounting" }, { label: "Banking" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <AccountingSubNav />

        {view === "loading" && <div className="text-center py-24 text-muted-foreground">Loading...</div>}

        {view === "empty" && (
          <div className="flex flex-col items-center justify-center text-center py-24 space-y-4">
            <h2 className="text-2xl font-semibold">Stay on top of your money</h2>
            <p className="text-sm text-muted-foreground max-w-lg">
              Connect your bank and credit cards to fetch all your transactions. Create, categorize and match these transactions to those
              you have in Aupulens ERP.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={openConnect}>Connect Bank / Credit Card</Button>
              <Button
                variant="outline"
                onClick={() => {
                  resetForm();
                  setView("manual");
                }}
              >
                Add Manually
              </Button>
            </div>
            <button type="button" className="text-sm pt-2" onClick={() => setView("list")}>
              <span className="text-muted-foreground">Don&apos;t use banking for your business? </span>
              <span className="text-primary font-medium">Skip</span>
            </button>
          </div>
        )}

        {view === "connect" && (
          <div className="space-y-6">
            <Button variant="ghost" size="sm" onClick={() => setView(accounts.length ? "list" : "empty")}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>

            <div className="rounded-lg border p-5">
              <h3 className="font-semibold flex items-center gap-1.5">✨ Connect and Add Your Bank Accounts or Credit Cards</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Connect your bank accounts to fetch the bank feeds using one of our third-party bank feeds service providers. Or, you can
                add your bank accounts manually and import bank feeds.
              </p>
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-3">Partner Banks Fetch feeds directly</p>
                <div className="flex flex-wrap gap-3">
                  {providers.partnerBanks.map((p) => (
                    <button
                      key={p._id}
                      onClick={() => handleConnectNow(p._id, p.name)}
                      className="flex items-center gap-2 border rounded-md px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <Landmark className="h-4 w-4 text-muted-foreground" /> {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Automatic Bank Feeds Supported Banks</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Connect your bank accounts and fetch the bank feeds using one of our third-party bank feeds service providers.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                {providers.aggregatorBanks.map((p) => {
                  const Icon = PROVIDER_ICON(p.type);
                  return (
                    <button
                      key={p._id}
                      onClick={() => handleConnectNow(p._id, p.name)}
                      className="flex items-center gap-2 border rounded-md px-3 py-2.5 text-sm hover:bg-muted/50 text-left"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1">{p.name}</span>
                      {p.supportsCreditCard && <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  );
                })}
              </div>
              {!providers.isLiveConfigured && (
                <p className="text-xs text-amber-500 mt-4">
                  Live bank feeds aren&apos;t configured for this environment yet — connecting will let you know once that&apos;s set
                  up. Add your account manually below in the meantime.
                </p>
              )}
            </div>

            <div className="rounded-lg border p-5 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Add bank or credit card account manually</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Unable to connect your bank or credit card account using our Service Provider? Add the accounts manually using your
                  account details.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  resetForm();
                  setView("manual");
                }}
              >
                Add Account
              </Button>
            </div>
          </div>
        )}

        {view === "manual" && (
          <div className="space-y-6 max-w-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Add Bank or Credit Card</h2>
              <Button variant="ghost" size="sm" onClick={() => setView(accounts.length ? "list" : "empty")}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
            </div>

            <div className="grid grid-cols-[160px_1fr] items-center gap-4">
              <label className="text-sm font-medium text-red-500">Select Account Type*</label>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    className="accent-primary"
                    checked={form.accountType === "bank"}
                    onChange={() => setForm({ ...form, accountType: "bank" })}
                  />
                  Bank
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    className="accent-primary"
                    checked={form.accountType === "credit_card"}
                    onChange={() => setForm({ ...form, accountType: "credit_card" })}
                  />
                  Credit Card
                </label>
              </div>

              <label className="text-sm font-medium text-red-500">Account Name*</label>
              <Input value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} />

              <label className="text-sm font-medium">Account Code</label>
              <Input value={form.accountCode} onChange={(e) => setForm({ ...form, accountCode: e.target.value })} />

              <label className="text-sm font-medium text-red-500">Currency*</label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <label className="text-sm font-medium">Account Number</label>
              <Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />

              <label className="text-sm font-medium">Bank Name</label>
              <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />

              <label className="text-sm font-medium">IFSC</label>
              <Input value={form.ifsc} onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} />

              <label className="text-sm font-medium">Users</label>
              <div>
                <MultiAccountPicker
                  accounts={users.map((u) => ({ _id: u._id, accountName: u.name }))}
                  value={form.userIds}
                  onChange={(ids) => setForm({ ...form, userIds: ids })}
                  placeholder="Select Users"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Note: Only users associated with this bank can access this bank account.
                </p>
              </div>

              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Max. 500 characters"
                maxLength={500}
                className="h-24 resize-none"
              />

              <div />
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isPrimary"
                  checked={form.isPrimary}
                  onCheckedChange={(v) => setForm({ ...form, isPrimary: !!v })}
                />
                <label htmlFor="isPrimary" className="text-sm">
                  Make this primary
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button onClick={handleSaveManual} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setView(accounts.length ? "list" : "empty")}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {view === "list" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold">Banking</h1>
              <div className="flex items-center gap-2">
                <Link href="/finance/accounting/banking/rules">
                  <Button variant="outline">Manage Banking Rules</Button>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button>+ Add Account</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={openConnect}>Connect Bank / Credit Card</DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        resetForm();
                        setView("manual");
                      }}
                    >
                      Add Manually
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>ACCOUNT NAME</TableHead>
                    <TableHead>TYPE</TableHead>
                    <TableHead>CURRENCY</TableHead>
                    <TableHead>BANK NAME</TableHead>
                    <TableHead>STATUS</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No bank or card accounts yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    accounts.map((a) => (
                      <TableRow key={a._id}>
                        <TableCell>
                          {a.accountType === "credit_card" ? (
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Landmark className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-blue-600 dark:text-blue-400">
                          {a.accountName} {a.isPrimary && <span className="text-xs text-muted-foreground">(Primary)</span>}
                        </TableCell>
                        <TableCell className="capitalize">{a.accountType.replace("_", " ")}</TableCell>
                        <TableCell>{a.currency}</TableCell>
                        <TableCell>{a.bankName || "-"}</TableCell>
                        <TableCell className="capitalize">{a.connectionStatus}</TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
