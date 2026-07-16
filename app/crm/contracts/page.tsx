'use client';

import { useState, useEffect, useCallback } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus, Search, AlertTriangle, CheckCircle2, Clock, XCircle,
  RefreshCw, TrendingUp,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  Draft: "bg-neutral-700 text-neutral-100",
  "Pending Signature": "bg-blue-700 text-blue-100",
  Active: "bg-green-700 text-green-100",
  "Renewal Due": "bg-yellow-700 text-yellow-100",
  Expiring: "bg-orange-700 text-orange-100",
  Renewed: "bg-teal-700 text-teal-100",
  Expired: "bg-red-800 text-red-100",
  Cancelled: "bg-neutral-800 text-neutral-400",
};

const CHURN_COLOR: Record<string, string> = {
  Low: "text-green-400",
  Medium: "text-yellow-400",
  High: "text-orange-400",
  Critical: "text-red-400",
};

function daysUntil(date: string | Date) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

function SummaryCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: React.ComponentType<any>;
}) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className={`w-4 h-4 ${color || "text-neutral-400"}`} />}
        <p className="text-xs text-neutral-400">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${color || ""}`}>{value}</p>
      {sub && <p className="text-xs text-neutral-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── New Contract Modal (inline) ──────────────────────────────────────────────

function NewContractModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    contract_number: `CTR-${Date.now().toString(36).toUpperCase().slice(-6)}`,
    account_id: "",
    start_date: "",
    end_date: "",
    contract_value: "",
    billing_frequency: "Annual",
    terms: "",
    notes: "",
    auto_renew: false,
  });
  const [saving, setSaving] = useState(false);

  const field = (name: keyof typeof form, value: any) =>
    setForm((p) => ({ ...p, [name]: value }));

  const submit = async () => {
    if (!form.account_id) { toast.error("Account ID is required."); return; }
    if (!form.start_date || !form.end_date) { toast.error("Start and end dates required."); return; }
    setSaving(true);
    const res = await fetch("/api/crm/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        contract_value: parseFloat(form.contract_value) || 0,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success("Contract created!");
      onCreated();
    } else {
      toast.error(data.message || "Failed to create contract");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Contract</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-neutral-400 block mb-0.5">Contract Number</label>
            <Input value={form.contract_number} onChange={(e) => field("contract_number", e.target.value)}
              className="bg-neutral-950 border-neutral-700 h-8 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-neutral-400 block mb-0.5">Account ID <span className="text-red-400">*</span></label>
            <Input value={form.account_id} onChange={(e) => field("account_id", e.target.value)}
              placeholder="MongoDB ObjectId of the account"
              className="bg-neutral-950 border-neutral-700 h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs text-neutral-400 block mb-0.5">Start Date *</label>
            <Input type="date" value={form.start_date} onChange={(e) => field("start_date", e.target.value)}
              className="bg-neutral-950 border-neutral-700 h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs text-neutral-400 block mb-0.5">End Date *</label>
            <Input type="date" value={form.end_date} onChange={(e) => field("end_date", e.target.value)}
              className="bg-neutral-950 border-neutral-700 h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs text-neutral-400 block mb-0.5">Contract Value</label>
            <Input type="number" min={0} value={form.contract_value} onChange={(e) => field("contract_value", e.target.value)}
              placeholder="0.00" className="bg-neutral-950 border-neutral-700 h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs text-neutral-400 block mb-0.5">Billing Frequency</label>
            <select value={form.billing_frequency} onChange={(e) => field("billing_frequency", e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded h-8 text-sm px-2">
              {["Monthly", "Quarterly", "Semi-Annual", "Annual", "One-Time"].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-neutral-400 block mb-0.5">Terms</label>
            <textarea value={form.terms} onChange={(e) => field("terms", e.target.value)}
              rows={3} placeholder="Payment and delivery terms..."
              className="w-full bg-neutral-950 border border-neutral-700 rounded p-2 text-sm resize-none" />
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.auto_renew} onChange={(e) => field("auto_renew", e.target.checked)} />
              Auto-renew
            </label>
          </div>
        </div>

        <DialogFooter className="pt-2 flex gap-2 sm:justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-primary" onClick={submit} disabled={saving}>
            {saving ? "Creating..." : "Create Contract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const ALL_STATUSES = [
  "Draft", "Pending Signature", "Active", "Renewal Due",
  "Expiring", "Renewed", "Expired", "Cancelled",
];

export default function ContractsPage() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [churnFilter, setChurnFilter] = useState("");
  const [expiryFilter, setExpiryFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [renewalSummary, setRenewalSummary] = useState<any>(null);
  const [runningEngine, setRunningEngine] = useState(false);

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (churnFilter) params.set("churn_risk", churnFilter);
    if (expiryFilter) params.set("expiry_days", expiryFilter);
    const res = await fetch(`/api/crm/contracts?${params}`);
    const data = await res.json();
    if (data.success) setContracts(data.data.contracts || []);
    setLoading(false);
  }, [search, statusFilter, churnFilter, expiryFilter]);

  const fetchSummary = useCallback(async () => {
    const res = await fetch("/api/crm/renewals");
    const data = await res.json();
    if (data.success) setRenewalSummary(data.data);
  }, []);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const runEngine = async () => {
    setRunningEngine(true);
    const res = await fetch("/api/crm/renewals", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      const r = data.data;
      toast.success(`Engine ran: ${r.tasksCreated} tasks, ${r.activitiesCreated} activities, ${r.expired} expired.`);
      fetchContracts();
      fetchSummary();
    } else {
      toast.error("Renewal engine failed");
    }
    setRunningEngine(false);
  };

  // Metrics
  const totalValue = contracts.reduce((a, c) => a + (c.contract_value || 0), 0);
  const activeCount = contracts.filter((c) => c.status === "Active").length;
  const expiringCount = contracts.filter((c) => ["Renewal Due", "Expiring"].includes(c.status)).length;

  return (
    <div className="p-6 space-y-6">
      <NewContractModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={() => { setShowModal(false); fetchContracts(); }}
      />

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">Contracts & Renewals</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Manage all contracts, renewal schedules, and expiry tracking
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runEngine} disabled={runningEngine}>
            <RefreshCw className={`w-4 h-4 mr-1 ${runningEngine ? "animate-spin" : ""}`} />
            Run Renewal Engine
          </Button>
          <Button className="bg-primary" onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4 mr-1" />
            New Contract
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Contract Value" value={`$${totalValue.toLocaleString()}`}
          sub={`${contracts.length} contracts`} />
        <SummaryCard label="Active" value={activeCount} color="text-green-400"
          icon={CheckCircle2} />
        <SummaryCard label="Renewal Due / Expiring" value={expiringCount} color="text-yellow-400"
          icon={AlertTriangle} />
        {renewalSummary && (
          <SummaryCard label="Expiring in 30 days" value={renewalSummary.expiring30}
            sub={`$${(renewalSummary.renewalPipelineValue90Days || 0).toLocaleString()} 90-day pipeline`}
            color="text-orange-400" icon={Clock} />
        )}
      </div>

      {/* Renewal Risk Breakdown */}
      {renewalSummary && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4">
          <h2 className="font-semibold mb-3 text-sm">Renewal Risk Pipeline</h2>
          <div className="grid grid-cols-4 gap-4 text-center">
            {[
              { label: "7 days", value: renewalSummary.expiring7, color: "text-red-400" },
              { label: "30 days", value: renewalSummary.expiring30, color: "text-orange-400" },
              { label: "60 days", value: renewalSummary.expiring60, color: "text-yellow-400" },
              { label: "90 days", value: renewalSummary.expiring90, color: "text-blue-400" },
            ].map((b) => (
              <div key={b.label} className="bg-neutral-950 rounded p-3">
                <p className={`text-2xl font-bold ${b.color}`}>{b.value}</p>
                <p className="text-xs text-neutral-400 mt-0.5">Expiring in {b.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative max-w-xs flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contract number..." className="pl-9 bg-neutral-900 border-neutral-700" />
        </div>

        {/* Status filter pills */}
        <div className="flex gap-1 flex-wrap">
          <Button size="sm" variant={statusFilter === "" ? "default" : "outline"}
            className="h-8 text-xs" onClick={() => setStatusFilter("")}>All</Button>
          {ALL_STATUSES.map((s) => (
            <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"}
              className="h-8 text-xs" onClick={() => setStatusFilter(s === statusFilter ? "" : s)}>{s}</Button>
          ))}
        </div>

        {/* Churn risk filter */}
        <select value={churnFilter} onChange={(e) => setChurnFilter(e.target.value)}
          className="bg-neutral-900 border border-neutral-700 rounded h-8 text-sm px-2">
          <option value="">All Churn Risk</option>
          {["Low", "Medium", "High", "Critical"].map((l) => <option key={l}>{l}</option>)}
        </select>

        {/* Expiry window */}
        <select value={expiryFilter} onChange={(e) => setExpiryFilter(e.target.value)}
          className="bg-neutral-900 border border-neutral-700 rounded h-8 text-sm px-2">
          <option value="">Any Expiry</option>
          <option value="7">Expiring in 7 days</option>
          <option value="30">Expiring in 30 days</option>
          <option value="60">Expiring in 60 days</option>
          <option value="90">Expiring in 90 days</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-neutral-800 hover:bg-transparent">
              <TableHead className="text-neutral-400">Contract #</TableHead>
              <TableHead className="text-neutral-400">Account</TableHead>
              <TableHead className="text-neutral-400 text-right">Value</TableHead>
              <TableHead className="text-neutral-400">Frequency</TableHead>
              <TableHead className="text-neutral-400">End Date</TableHead>
              <TableHead className="text-neutral-400">Status</TableHead>
              <TableHead className="text-neutral-400">Churn Risk</TableHead>
              <TableHead className="text-neutral-400">Renewal</TableHead>
              <TableHead className="text-neutral-400"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-neutral-500">Loading...</TableCell>
              </TableRow>
            )}
            {!loading && contracts.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-neutral-500">No contracts found.</TableCell>
              </TableRow>
            )}
            {!loading && contracts.map((c) => {
              const days = daysUntil(c.end_date);
              const isExpired = days <= 0;
              const isUrgent = days > 0 && days <= 30;

              return (
                <TableRow key={c._id} className="border-neutral-800 hover:bg-neutral-800/50">
                  <TableCell className="font-mono font-medium text-sm">{c.contract_number}</TableCell>
                  <TableCell className="text-sm">{c.account_id?.company_name || "—"}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    ${(c.contract_value || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm text-neutral-400">{c.billing_frequency}</TableCell>
                  <TableCell>
                    <span className={`text-sm ${isExpired ? "text-red-400 font-bold" : isUrgent ? "text-orange-400 font-semibold" : ""}`}>
                      {c.end_date ? new Date(c.end_date).toLocaleDateString() : "—"}
                      {!isExpired && isUrgent && <span className="ml-1 text-xs">({days}d)</span>}
                      {isExpired && <span className="ml-1 text-xs">(EXPIRED)</span>}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[c.status] || "bg-neutral-700 text-neutral-100"}`}>
                      {c.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`text-sm font-semibold ${CHURN_COLOR[c.churn_risk] || ""}`}>
                      {c.churn_risk}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-neutral-400">{c.renewal_status}</TableCell>
                  <TableCell>
                    <Link href={`/crm/contracts/${c._id}`}>
                      <Button variant="ghost" size="sm" className="h-7 text-xs">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
