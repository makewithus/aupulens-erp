'use client';

import { useState, useEffect, useCallback } from "react";
import { useAiPrefill } from "@/lib/hooks/useAiPrefill";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus, Search, Megaphone, DollarSign, Target, TrendingUp, Loader2
} from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  Draft: "bg-accent text-foreground",
  Planned: "bg-blue-700 text-blue-100",
  Active: "bg-green-700 text-green-100",
  Paused: "bg-yellow-700 text-yellow-100",
  Completed: "bg-purple-700 text-purple-100",
  Archived: "bg-accent text-muted-foreground",
};

function NewCampaignModal({
  open,
  onClose,
  onCreated,
  initialData,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  initialData?: any;
}) {
  const [form, setForm] = useState({
    campaign_name: "",
    campaign_code: `CMP-${Date.now().toString(36).toUpperCase().slice(-6)}`,
    channel: "Organic Search",
    status: "Draft",
    budget: "",
    start_date: "",
    end_date: "",
    expected_leads: "",
    expected_revenue: "",
  });
  const [saving, setSaving] = useState(false);

  const field = (name: keyof typeof form, value: any) =>
    setForm((p) => ({ ...p, [name]: value }));

  // AI-native pre-fill: merge in any AI-extracted fields when the assistant
  // opens this modal with data already prepared.
  useEffect(() => {
    if (open && initialData) {
      setForm((p) => {
        const n = { ...p };
        for (const k of Object.keys(p)) {
          const v = initialData[k];
          if (v !== undefined && v !== null && v !== "") n[k as keyof typeof n] = v;
        }
        return n;
      });
    }
  }, [open, initialData]);

  const submit = async () => {
    if (!form.campaign_name || !form.start_date) {
      toast.error("Name and start date are required.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/crm/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        budget: parseFloat(form.budget) || 0,
        expected_leads: parseInt(form.expected_leads) || 0,
        expected_revenue: parseFloat(form.expected_revenue) || 0,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success("Campaign created!");
      onCreated();
    } else {
      toast.error(data.message || "Failed to create campaign");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Campaign</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground block mb-0.5">Campaign Name *</label>
            <Input value={form.campaign_name} onChange={(e) => field("campaign_name", e.target.value)}
              placeholder="Q4 Holiday Sale" className="bg-background border-border h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-0.5">Campaign Code</label>
            <Input value={form.campaign_code} onChange={(e) => field("campaign_code", e.target.value)}
              className="bg-background border-border h-8 text-sm font-mono" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-0.5">Status</label>
            <select value={form.status} onChange={(e) => field("status", e.target.value)}
              className="w-full bg-background border border-border rounded h-8 text-sm px-2">
              {["Draft", "Planned", "Active"].map((f) => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground block mb-0.5">Channel *</label>
            <select value={form.channel} onChange={(e) => field("channel", e.target.value)}
              className="w-full bg-background border border-border rounded h-8 text-sm px-2">
              {['Organic Search', 'Paid Search', 'Facebook', 'Instagram', 'LinkedIn', 'Referral', 'Event', 'Trade Show', 'Direct Website', 'WhatsApp', 'Outbound Calling', 'Partner Channel'].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-0.5">Start Date *</label>
            <Input type="date" value={form.start_date} onChange={(e) => field("start_date", e.target.value)}
              className="bg-background border-border h-8 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-0.5">End Date</label>
            <Input type="date" value={form.end_date} onChange={(e) => field("end_date", e.target.value)}
              className="bg-background border-border h-8 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground block mb-0.5">Budget</label>
            <Input type="number" min={0} value={form.budget} onChange={(e) => field("budget", e.target.value)}
              placeholder="0.00" className="bg-background border-border h-8 text-sm" />
          </div>
        </div>

        <DialogFooter className="pt-2 flex gap-2 sm:justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-primary" onClick={submit} disabled={saving}>
            {saving ? "Creating..." : "Create Campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const LIMIT = 25;

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [aiCampaignData, setAiCampaignData] = useState<any>(undefined);

  // AI-native: extract the campaign's details → open New Campaign pre-filled.
  useAiPrefill("campaign", (p) => {
    setAiCampaignData(p.data || {});
    setShowModal(true);
    if (p.suggestions && p.suggestions.length) toast.info("Review before saving", { description: p.suggestions.join("  •  "), duration: 9000 });
  });

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const res = await fetch(`/api/crm/campaigns?${params}`);
    const data = await res.json();
    if (data.success) {
      setCampaigns(data.data.campaigns || []);
      setTotal(data.data.total ?? 0);
      setTotalPages(data.data.totalPages ?? 1);
    }
    setLoading(false);
  }, [page, debouncedSearch, statusFilter, dateFrom, dateTo]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, dateFrom, dateTo]);

  const forceROIUpdate = async () => {
    toast.info("Updating global ROI metrics...");
    const res = await fetch("/api/crm/reports/roi", { method: "POST" });
    if (res.ok) {
      toast.success("ROI updated successfully");
      fetchCampaigns();
    } else {
      toast.error("ROI update failed");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <NewCampaignModal
        open={showModal}
        onClose={() => { setShowModal(false); setAiCampaignData(undefined); }}
        onCreated={() => { setShowModal(false); setAiCampaignData(undefined); fetchCampaigns(); }}
        initialData={aiCampaignData}
      />

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage marketing campaigns, budgets, and track ROI.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={forceROIUpdate}>
            Refresh Global ROI
          </Button>
          <Button variant="outline" asChild>
            <Link href="/crm/campaigns/dashboard">Campaign Dashboard</Link>
          </Button>
          <Button className="bg-primary" onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4 mr-1" />
            New Campaign
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative max-w-xs flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns..." className="pl-9 bg-card border-border" />
        </div>

        <div className="flex gap-1 flex-wrap">
          <Button size="sm" variant={statusFilter === "" ? "default" : "outline"}
            className="h-8 text-xs" onClick={() => setStatusFilter("")}>All</Button>
          {["Planned", "Active", "Paused", "Completed"].map((s) => (
            <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"}
              className="h-8 text-xs" onClick={() => setStatusFilter(s === statusFilter ? "" : s)}>{s}</Button>
          ))}
        </div>

        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
        />
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Campaign Name</TableHead>
              <TableHead className="text-muted-foreground">Channel</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground text-right">Budget</TableHead>
              <TableHead className="text-muted-foreground text-right">Revenue</TableHead>
              <TableHead className="text-muted-foreground text-right">ROI</TableHead>
              <TableHead className="text-muted-foreground"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></TableCell>
              </TableRow>
            )}
            {!loading && campaigns.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  {debouncedSearch || statusFilter || dateFrom || dateTo ? "No campaigns match your search or filters." : "No campaigns found."}
                </TableCell>
              </TableRow>
            )}
            {!loading && campaigns.map((c) => (
              <TableRow key={c._id} className="border-border hover:bg-accent/50">
                <TableCell>
                  <div className="font-medium">{c.campaign_name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{c.campaign_code}</div>
                </TableCell>
                <TableCell className="text-sm text-foreground">{c.channel}</TableCell>
                <TableCell>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[c.status] || "bg-accent text-foreground"}`}>
                    {c.status}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-foreground">
                  ₹{(c.budget || 0).toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-green-400">
                  ₹{(c.attributed_revenue || 0).toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <span className={`font-mono text-sm font-bold ${c.roi_percentage >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {c.roi_percentage >= 0 ? "+" : ""}{c.roi_percentage?.toFixed(1)}%
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/crm/campaigns/${c._id}`}>
                    <Button variant="ghost" size="sm" className="h-7 text-xs">View</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <span className="text-sm">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
