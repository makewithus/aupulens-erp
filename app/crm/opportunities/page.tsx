"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/SearchInput";
import { StatCard } from "@/components/admin/StatCard";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/shared/Table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, Download, FolderKanban } from "lucide-react";
import Link from "next/link";

const FORECAST_CATEGORIES = ["Omitted", "Pipeline", "Best Case", "Commit", "Closed"];
const STAGES = ['Prospecting', 'Discovery', 'Requirement Gathering', 'Solution Fit', 'Proposal Sent', 'Negotiation', 'Approval', 'Closed Won', 'Closed Lost'];
const PRIORITIES = ["Low", "Medium", "High"];

const STAGE_COLORS: Record<string, string> = {
  Prospecting: "text-[#6CADF5]",
  Discovery: "text-[#6CADF5]",
  "Requirement Gathering": "text-[#A77DFF]",
  "Solution Fit": "text-[#A77DFF]",
  "Proposal Sent": "text-[#F1DF38]",
  Negotiation: "text-[#F1DF38]",
  Approval: "text-[#8AE06C]",
  "Closed Won": "text-[#8AE06C]",
  "Closed Lost": "text-[#F56868]",
};

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 25;

  // Toolbar state
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  
  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportConfig, setExportConfig] = useState({ format: 'xlsx', scope: 'all', reportType: 'standard' });
  const [isExporting, setIsExporting] = useState(false);

  const [formData, setFormData] = useState({
    deal_name: "",
    account_id: "",
    amount: "",
    expected_close_date: "",
    stage: "Prospecting",
    priority: "Medium",
    forecast_category: "Pipeline",
    source: "",
    product_service_line: "",
    next_action: ""
  });

  // Reference lookups (Mocking this part for UI, in real app fetched from APIs)
  const [accounts, setAccounts] = useState<any[]>([]);

  const fetchOpportunities = async (currentPage = page) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('limit', String(LIMIT));
    if (search) params.set('search', search);
    if (stageFilter && stageFilter !== "all") params.set('stage', stageFilter);
    if (riskFilter && riskFilter !== "all") params.set('risk_level', riskFilter);

    try {
      const res = await fetch(`/api/crm/opportunities?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setOpportunities(data.data);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      }
    } catch (err) {
      toast.error("Failed to load opportunities.");
    } finally {
      setLoading(false);
    }
  };

  const fetchKpis = async () => {
    try {
      const res = await fetch("/api/crm/opportunities/kpis");
      const data = await res.json();
      if (data.success) setKpis(data.kpis);
    } catch {
      // non-critical; KPI cards remain empty
    }
  };

  const fetchLookups = async () => {
    try {
      const res = await fetch("/api/crm/accounts");
      const data = await res.json();
      if (data.success) setAccounts(data.data.accounts || []);
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => {
    fetchLookups();
    fetchKpis();
  }, []);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      setPage(1);
      fetchOpportunities(1);
      fetchKpis();
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [search, stageFilter, riskFilter]);

  useEffect(() => {
    fetchOpportunities(page);
  }, [page]);

  const handleCreateOpportunity = async () => {
    if (!formData.deal_name || !formData.account_id || !formData.amount || !formData.expected_close_date) {
      toast.error("Please fill in all required fields (Deal Name, Account, Amount, Close Date).");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/crm/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount)
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Opportunity created successfully!");
        setIsCreateModalOpen(false);
        setFormData({
          deal_name: "", account_id: "", amount: "", expected_close_date: "",
          stage: "Prospecting", priority: "Medium", forecast_category: "Pipeline",
          source: "", product_service_line: "", next_action: ""
        });
        fetchOpportunities();
      } else {
        toast.error(data.message || "Failed to create opportunity.");
      }
    } catch (err) {
      toast.error("Network error.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/crm/opportunities/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...exportConfig,
          selectedIds,
          filters: { search, stage: stageFilter, risk_level: riskFilter }
        })
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Opportunities_Export_${new Date().toISOString().split('T')[0]}.${exportConfig.format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Export completed successfully.");
      setIsExportModalOpen(false);
    } catch (err) {
      toast.error("Export failed. Please check permissions.");
    } finally {
      setIsExporting(false);
    }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val || 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between pb-2">
        <div className="shrink-0">
          <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
            Opportunity Management
          </h1>
          {/* <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
            {total} {total === 1 ? "Opportunity" : "Opportunities"}
          </p> */}
        </div>

        <div className="flex flex-row gap-4">
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="none-xl h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Opportunity
          </Button>
        </div>
      </div>

      {/* KPI Cards (StatCards) */}
      <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Pipeline Value"
          value={formatCurrency(kpis?.totalPipelineValue)}
          subtitle={`${kpis?.openOpportunities || 0} Open Deals`}
          className="border border-border/40 bg-background"
        />
        <StatCard
          title="Weighted Pipeline"
          value={formatCurrency(kpis?.weightedPipelineValue)}
          subtitle="Expected Revenue"
          className="border border-border/40 bg-background"
        />
        <StatCard
          title="Closing This Month"
          value={`${kpis?.closingThisMonth || 0}`}
          subtitle="Deals"
          className="border border-border/40 bg-background"
        />
        <StatCard
          title="Deals At Risk"
          value={`${kpis?.dealsAtRisk || 0}`}
          subtitle="Requires attention"
          className="border border-border/40 bg-background"
        />
      </div>

      {/* Table Card */}
      <Card className="overflow-hidden border-border/40 shadow-none bg-background">
        {/* Toolbar */}
        <div className="border-b border-border/20 px-6 py-4">
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            {/* Search Input */}
            <div className="w-full max-w-sm">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search deals, tags, accounts..."
              />
            </div>

            {/* Stage Filter */}
            <div className="flex items-center gap-2">
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="w-[180px] h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                  <SelectValue placeholder="All Stages" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border/40">
                  <SelectItem value="all">All Stages</SelectItem>
                  {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Risk Filter */}
            <div className="flex items-center gap-2">
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger className="w-[160px] h-10 rounded-none border-border/40 bg-white/[0.02] text-sm text-foreground focus:ring-0">
                  <SelectValue placeholder="Risk Level" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-border/40">
                  <SelectItem value="all">All Risks</SelectItem>
                  <SelectItem value="Healthy">Healthy</SelectItem>
                  <SelectItem value="Warning">Warning</SelectItem>
                  <SelectItem value="At Risk">At Risk</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Export Selected */}
            
              <div className="ml-auto">
                <Button
                  variant="outline"
                  onClick={() => { setExportConfig({ ...exportConfig, scope: 'selected' }); setIsExportModalOpen(true); }}
                  className="h-10 px-4 rounded-none font-mono text-[11px] uppercase tracking-[0.15em] hover:bg-white/5 text-muted-foreground hover:text-foreground border border-border/20 transition-all duration-300"
                >
                  Export Selected ({selectedIds.length})
                </Button>
              </div>
          </div>
        </div>

        <CardContent className="p-0">
          <TableContainer>
            <TableHead>
              <TableRow className="text-left hover:bg-transparent">
                <TableHeaderCell className="w-12 text-center">
                  <input
                    type="checkbox"
                    onChange={(e) => setSelectedIds(e.target.checked ? opportunities.map(o => o._id) : [])}
                    checked={selectedIds.length === opportunities.length && opportunities.length > 0}
                    className="w-4 h-4 rounded-none border-neutral-700 bg-neutral-900 accent-primary"
                  />
                </TableHeaderCell>
                <TableHeaderCell>Deal Name</TableHeaderCell>
                <TableHeaderCell>Account</TableHeaderCell>
                <TableHeaderCell>Amount</TableHeaderCell>
                <TableHeaderCell>Stage</TableHeaderCell>
                <TableHeaderCell>Close Date</TableHeaderCell>
                <TableHeaderCell>Owner</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="w-12 text-center">
                      <Skeleton className="h-4 w-4 mx-auto" />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-36" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-3 w-12" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Skeleton className="h-8 w-16" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : opportunities.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="py-24 text-center">
                    <FolderKanban className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />

                    <h3 className="text-lg font-medium">
                      {search ? "No opportunities match your filters" : "No opportunities found"}
                    </h3>

                    <p className="mt-2 text-sm text-muted-foreground">
                      {search ? "Try adjusting your search query or filters." : 'Click "New Opportunity" to create one.'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                opportunities.map((opp) => (
                  <TableRow key={opp._id}>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(opp._id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds([...selectedIds, opp._id]);
                          else setSelectedIds(selectedIds.filter(id => id !== opp._id));
                        }}
                        className="w-4 h-4 rounded-none border-neutral-700 bg-neutral-900 accent-primary"
                      />
                    </TableCell>

                    {/* Deal Name */}
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Link
                          href={`/crm/opportunities/${opp._id}`}
                          className="hover:underline hover:text-primary transition-colors text-[18px] font-medium tracking-[-0.03em] text-foreground"
                        >
                          {opp.deal_name || opp.name}
                        </Link>
                        {opp.risk_level === 'High' && (
                          <Badge
                            className="
                              rounded-none
                              border-0
                              bg-transparent
                              px-0
                              font-mono
                              text-[11px]
                              uppercase
                              tracking-[0.12em]
                              hover:bg-transparent
                              shadow-none
                              text-[#F56868]
                            "
                          >
                            At Risk
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Account */}
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {opp.account_id?.company_name || "—"}
                      </span>
                    </TableCell>

                    {/* Amount */}
                    <TableCell>
                      <div className="text-sm font-medium text-foreground">
                        {formatCurrency(opp.amount)}
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground/60">
                        {opp.probability}% Prob
                      </div>
                    </TableCell>

                    {/* Stage */}
                    <TableCell>
                      <Badge
                        className={`
                          rounded-none
                          border-0
                          bg-transparent
                          px-0
                          font-mono
                          text-[12px]
                          hover:bg-transparent
                          shadow-none
                          ${STAGE_COLORS[opp.stage] ?? "text-[#6CADF5]"}
                        `}
                      >
                        {opp.stage}
                      </Badge>
                    </TableCell>

                    {/* Close Date */}
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {opp.expected_close_date ? new Date(opp.expected_close_date).toLocaleDateString() : "—"}
                      </span>
                    </TableCell>

                    {/* Owner */}
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {opp.ownerId?.name || opp.owner_id?.name || "—"}
                      </span>
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Link href={`/crm/opportunities/${opp._id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-3 rounded-none font-mono text-[11px] uppercase tracking-[0.15em] hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all duration-300"
                          >
                            View
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </TableContainer>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-border/20">
              <p className="font-mono text-[11px] text-muted-foreground/50 uppercase tracking-[0.05em]">
                Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
              </p>
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="h-8 px-3 rounded-none font-mono text-[11px] uppercase tracking-[0.15em] border border-border/20 hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all duration-300 disabled:opacity-50"
                >
                  Previous
                </Button>
                <span className="font-mono text-[11px] text-muted-foreground/60 uppercase tracking-[0.05em]">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="h-8 px-3 rounded-none font-mono text-[11px] uppercase tracking-[0.15em] border border-border/20 hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all duration-300 disabled:opacity-50"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Opportunity Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Opportunity</DialogTitle>
            <DialogDescription>Fill in the deal specifics to track it in your pipeline.</DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="deal_name">Deal Name <span className="text-red-500">*</span></Label>
              <Input 
                id="deal_name"
                placeholder="e.g. Acme Corp - Enterprise License" 
                value={formData.deal_name}
                onChange={e => setFormData({...formData, deal_name: e.target.value})}
                disabled={isSubmitting}
              />
            </div>
            
            <div className="space-y-1.5">
              <Label>Account <span className="text-red-500">*</span></Label>
              <Select value={formData.account_id} onValueChange={v => setFormData({...formData, account_id: v})} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(acc => (
                    <SelectItem key={acc._id} value={acc._id}>{acc.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount <span className="text-red-500">*</span></Label>
              <Input 
                id="amount"
                type="number"
                placeholder="0.00" 
                value={formData.amount}
                onChange={e => setFormData({...formData, amount: e.target.value})}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expected_close_date">Expected Close Date <span className="text-red-500">*</span></Label>
              <Input 
                id="expected_close_date"
                type="date"
                value={formData.expected_close_date}
                onChange={e => setFormData({...formData, expected_close_date: e.target.value})}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select value={formData.stage} onValueChange={v => setFormData({...formData, stage: v})} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={formData.priority} onValueChange={v => setFormData({...formData, priority: v})} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Forecast Category</Label>
              <Select value={formData.forecast_category} onValueChange={v => setFormData({...formData, forecast_category: v})} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORECAST_CATEGORIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="next_action">Next Action</Label>
              <Input 
                id="next_action"
                placeholder="e.g. Schedule technical demo with CTO" 
                value={formData.next_action}
                onChange={e => setFormData({...formData, next_action: e.target.value})}
                disabled={isSubmitting}
              />
            </div>

          </div>

          <DialogFooter className="pt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              onClick={handleCreateOpportunity}
              disabled={isSubmitting}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create Deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Modal */}
      <Dialog open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Export Opportunities</DialogTitle>
            <DialogDescription>Generate a custom CRM data export.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Export Type</Label>
              <Select value={exportConfig.reportType} onValueChange={v => setExportConfig({...exportConfig, reportType: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard Opportunities</SelectItem>
                  <SelectItem value="pipeline">Pipeline Report</SelectItem>
                  <SelectItem value="forecast">Forecast Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Export Format</Label>
              <Select value={exportConfig.format} onValueChange={v => setExportConfig({...exportConfig, format: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                  <SelectItem value="csv">CSV (.csv)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Export Scope</Label>
              <Select value={exportConfig.scope} onValueChange={v => setExportConfig({...exportConfig, scope: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Opportunities</SelectItem>
                  <SelectItem value="filtered">Currently Filtered Results</SelectItem>
                  <SelectItem value="selected" disabled={selectedIds.length === 0}>Selected Rows ({selectedIds.length})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="pt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsExportModalOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
              Generate Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
