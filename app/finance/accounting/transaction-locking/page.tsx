"use client";

import { useEffect, useState } from "react";
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { AccountingSubNav } from "@/components/finance/accounting/AccountingSubNav";
import { FindAccountantsSheet } from "@/components/finance/accounting/FindAccountantsSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lock, Unlock, Users, Info, ShoppingCart, Landmark, Receipt, UserCog, ArrowRight } from "lucide-react";
import { DateField } from "@/components/finance/accounting/DateField";
import { confirmDialog } from "@/components/providers/ConfirmRoot";

const MODULES: { key: string; title: string; icon: any; tooltip: string }[] = [
  { key: "sales", title: "Sales", icon: Receipt, tooltip: "Locks invoices, sales receipts, and credit notes dated on/before the lock date." },
  { key: "purchases", title: "Purchases", icon: ShoppingCart, tooltip: "Locks bills, expenses, and purchase orders dated on/before the lock date." },
  { key: "banking", title: "Banking", icon: Landmark, tooltip: "Locks bank transactions and reconciliations dated on/before the lock date." },
  { key: "accountant", title: "Accountant", icon: UserCog, tooltip: "Locks manual journal entries dated on/before the lock date." },
];

export default function TransactionLockingPage() {
  const { data: session } = useSession();
  const [locks, setLocks] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [accountantsOpen, setAccountantsOpen] = useState(false);

  const [modalModule, setModalModule] = useState<string | null>(null);
  const [lockDate, setLockDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchLocks = async () => {
    setLoading(true);
    try {
      const res = await cachedFetch("/api/finance/accounting/transaction-locks");
      const data = await res.json();
      if (data.success) {
        const map: Record<string, any> = {};
        for (const l of data.data) map[l.module] = l;
        setLocks(map);
      }
    } catch {
      toast.error("Failed to load transaction locks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocks();
  }, []);

  const allLock = locks["all"];
  const isAllLocked = !!allLock?.isLocked;

  const openLockModal = (moduleKey: string) => {
    const existing = locks[moduleKey];
    setLockDate(existing?.lockedUpToDate ? new Date(existing.lockedUpToDate).toISOString().slice(0, 10) : "");
    setReason(existing?.reason || "");
    setModalModule(moduleKey);
  };

  const handleLock = async () => {
    if (!modalModule) return;
    if (!lockDate) return toast.error("Please select a lock date");
    setSaving(true);
    try {
      const res = await cachedFetch("/api/finance/accounting/transaction-locks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: modalModule, isLocked: true, lockedUpToDate: lockDate, reason }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      toast.success(`${modalModule === "all" ? "All transactions" : modalModule} locked up to ${new Date(lockDate).toLocaleDateString()}`);
      setModalModule(null);
      fetchLocks();
    } catch (e: any) {
      toast.error(e.message || "Failed to lock transactions");
    } finally {
      setSaving(false);
    }
  };

  const handleUnlock = async (moduleKey: string) => {
    const ok = await confirmDialog({
      title: "Unlock transactions?",
      description: "Users will be able to edit and delete transactions in this module again.",
    });
    if (!ok) return;
    try {
      const res = await cachedFetch("/api/finance/accounting/transaction-locks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: moduleKey, isLocked: false }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      toast.success("Unlocked");
      fetchLocks();
    } catch (e: any) {
      toast.error(e.message || "Failed to unlock");
    }
  };

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance"
      pageName="Transaction Locking"
      breadcrumbs={[{ label: "Finance", href: "/finance/summary" }, { label: "Accounting" }, { label: "Transaction Locking" }]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <AccountingSubNav />

        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Transaction Locking</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-muted text-muted-foreground px-3 py-1.5 rounded-full">
              Restrict transaction locking with negative stock&nbsp;&nbsp;
              <span className="text-primary font-medium">Configure</span>
            </span>
            <Button variant="outline" size="sm" onClick={() => setAccountantsOpen(true)}>
              <Users className="h-4 w-4 mr-2" /> Find Accountants
            </Button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground max-w-4xl">
          Transaction locking prevents you and your users from making any changes to transactions that might affect your accounts. Once
          transactions are locked, users cannot edit, modify, or delete any transactions that were recorded before the specified date in
          this module.
        </p>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Loading...</div>
        ) : isAllLocked ? (
          <div className="rounded-lg border p-8 bg-card flex flex-col items-center text-center space-y-3">
            <Lock className="h-8 w-8 text-foreground" />
            <h3 className="text-lg font-semibold">All Transactions Locked</h3>
            <p className="text-sm text-muted-foreground">
              Locked up to {allLock?.lockedUpToDate ? new Date(allLock.lockedUpToDate).toLocaleDateString() : "-"}
              {allLock?.reason ? ` — ${allLock.reason}` : ""}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => openLockModal("all")}>
                Edit
              </Button>
              <Button variant="outline" onClick={() => handleUnlock("all")}>
                <Unlock className="h-4 w-4 mr-2" /> Unlock
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MODULES.map((m) => {
              const lock = locks[m.key];
              const locked = !!lock?.isLocked;
              const Icon = m.icon;
              return (
                <div key={m.key} className="rounded-lg border bg-card p-5 flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {locked ? <Lock className="h-5 w-5 text-foreground mt-0.5" /> : <Icon className="h-5 w-5 text-muted-foreground mt-0.5" />}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold">{m.title}</h3>
                        <span title={m.tooltip}>
                          <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {locked
                          ? `Locked up to ${new Date(lock.lockedUpToDate).toLocaleDateString()}${lock.reason ? ` — ${lock.reason}` : ""}`
                          : "You have not locked the transactions in this module."}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 items-end shrink-0">
                    {locked ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openLockModal(m.key)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleUnlock(m.key)}>
                          Unlock
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" onClick={() => openLockModal(m.key)}>
                        Lock
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-lg border bg-muted/30 p-5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Lock All Transactions At Once</h3>
            <p className="text-sm text-muted-foreground mt-1">
              You can freeze all transactions at once instead of locking the Sales, Purchases, Banking and Account transactions
              individually.
            </p>
          </div>
          <Button
            variant="ghost"
            className="text-primary font-medium shrink-0"
            onClick={() => (isAllLocked ? handleUnlock("all") : openLockModal("all"))}
          >
            {isAllLocked ? "Switch to Individual Locking" : "Switch to Lock All Transactions"} <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      <Dialog open={!!modalModule} onOpenChange={(v) => !v && setModalModule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Lock {modalModule === "all" ? "All Transactions" : MODULES.find((m) => m.key === modalModule)?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Lock Date*</label>
              <DateField value={lockDate} onChange={setLockDate} />
              <p className="text-xs text-muted-foreground">Transactions on or before this date cannot be created, edited, or deleted.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason (optional)</label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Books closed for FY 2025-26" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalModule(null)}>
              Cancel
            </Button>
            <Button onClick={handleLock} disabled={saving}>
              {saving ? "Locking..." : "Lock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FindAccountantsSheet open={accountantsOpen} onOpenChange={setAccountantsOpen} />
    </DashboardLayout>
  );
}
