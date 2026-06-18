"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, Search, Filter, Download, ArrowRight, LayoutGrid, Calendar, AlertTriangle, CheckCircle2, TrendingUp, XCircle, DollarSign, Activity } from "lucide-react";
import Link from "next/link";

const FORECAST_CATEGORIES = ["Omitted", "Pipeline", "Best Case", "Commit", "Closed"];
const STAGES = ['Prospecting', 'Discovery', 'Requirement Gathering', 'Solution Fit', 'Proposal Sent', 'Negotiation', 'Approval', 'Closed Won', 'Closed Lost'];
const PRIORITIES = ["Low", "Medium", "High"];

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>({});
  const [loading, setLoading] = useState(true);
  
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

  const fetchOpportunities = async () => {
    setLoading(true);
    let url = "/api/crm/opportunities?";
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (stageFilter && stageFilter !== "all") url += `stage=${encodeURIComponent(stageFilter)}&`;
    if (riskFilter && riskFilter !== "all") url += `risk_level=${encodeURIComponent(riskFilter)}&`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setOpportunities(data.data);
        setKpis(data.kpis);
      }
    } catch (err) {
      toast.error("Failed to load opportunities.");
    } finally {
      setLoading(false);
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
  }, []);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchOpportunities();
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [search, stageFilter, riskFilter]);

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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Opportunity Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage pipeline, deals, and forecasts.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/crm/pipeline">
            <Button variant="outline" className="gap-2">
              <LayoutGrid className="w-4 h-4" /> Pipeline Board
            </Button>
          </Link>
          <Button variant="outline" className="gap-2" onClick={() => setIsExportModalOpen(true)}>
            <Download className="w-4 h-4" /> Export
          </Button>
          <Button className="gap-2 bg-primary hover:bg-primary/90" onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="w-4 h-4" /> New Opportunity
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-400 flex items-center justify-between">
              Total Pipeline Value
              <DollarSign className="w-4 h-4 text-blue-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis?.totalPipelineValue)}</div>
            <p className="text-xs text-muted-foreground mt-1">{kpis?.openOpportunities || 0} Open Deals</p>
          </CardContent>
        </Card>
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-400 flex items-center justify-between">
              Weighted Pipeline
              <Activity className="w-4 h-4 text-purple-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis?.weightedPipelineValue)}</div>
            <p className="text-xs text-muted-foreground mt-1">Expected Revenue</p>
          </CardContent>
        </Card>
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-400 flex items-center justify-between">
              Closing This Month
              <Calendar className="w-4 h-4 text-green-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis?.closingThisMonth || 0} Deals</div>
            <p className="text-xs text-muted-foreground mt-1">Avg Size: {formatCurrency(kpis?.avgDealSize)}</p>
          </CardContent>
        </Card>
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-400 flex items-center justify-between">
              Deals At Risk
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis?.dealsAtRisk || 0} Deals</div>
            <p className="text-xs text-muted-foreground mt-1">Require immediate attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex gap-4 items-center bg-neutral-900 p-4 rounded-lg border border-neutral-800">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <Input 
            placeholder="Search deals, tags, accounts..." 
            className="pl-9 bg-neutral-950 border-neutral-800"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-neutral-500" />
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[180px] bg-neutral-950 border-neutral-800">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[160px] bg-neutral-950 border-neutral-800">
              <SelectValue placeholder="Risk Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risks</SelectItem>
              <SelectItem value="Healthy">Healthy</SelectItem>
              <SelectItem value="Warning">Warning</SelectItem>
              <SelectItem value="At Risk">At Risk</SelectItem>
              <SelectItem value="Critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {selectedIds.length > 0 && (
          <div className="ml-auto">
            <Button variant="secondary" onClick={() => { setExportConfig({ ...exportConfig, scope: 'selected' }); setIsExportModalOpen(true); }}>
              Export Selected ({selectedIds.length})
            </Button>
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : opportunities.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No opportunities found. <button onClick={() => setIsCreateModalOpen(true)} className="text-primary hover:underline">Create one</button>.
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-neutral-950">
              <TableRow className="border-neutral-800">
                <TableHead className="w-12 text-center">
                  <input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? opportunities.map(o => o._id) : [])} checked={selectedIds.length === opportunities.length && opportunities.length > 0} className="w-4 h-4 rounded border-neutral-700 bg-neutral-900" />
                </TableHead>
                <TableHead>Deal Name</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Close Date</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opportunities.map((opp) => (
                <TableRow key={opp._id} className="border-neutral-800 hover:bg-neutral-800/50">
                  <TableCell className="text-center">
                    <input type="checkbox" checked={selectedIds.includes(opp._id)} onChange={(e) => {
                      if (e.target.checked) setSelectedIds([...selectedIds, opp._id]);
                      else setSelectedIds(selectedIds.filter(id => id !== opp._id));
                    }} className="w-4 h-4 rounded border-neutral-700 bg-neutral-900" />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex flex-col gap-1">
                      <Link href={`/crm/opportunities/${opp._id}`} className="hover:underline hover:text-primary transition-colors">
                        {opp.deal_name || opp.name}
                      </Link>
                      {opp.risk_level === 'High' && <span className="text-[10px] text-red-400 uppercase tracking-wider font-bold">At Risk</span>}
                    </div>
                  </TableCell>
                  <TableCell>{opp.account_id?.company_name || '-'}</TableCell>
                  <TableCell>
                    <div className="font-medium">{formatCurrency(opp.amount)}</div>
                    <div className="text-[10px] text-muted-foreground">{opp.probability}% Prob</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      opp.stage === 'Closed Won' ? "border-green-600 text-green-400" :
                      opp.stage === 'Closed Lost' ? "border-red-600 text-red-400" :
                      "border-blue-600 text-blue-400"
                    }>
                      {opp.stage}
                    </Badge>
                  </TableCell>
                  <TableCell>{opp.expected_close_date ? new Date(opp.expected_close_date).toLocaleDateString() : '-'}</TableCell>
                  <TableCell>{opp.ownerId?.name || opp.owner_id?.name || '-'}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/crm/opportunities/${opp._id}`}>
                      <Button variant="outline" size="sm" className="gap-1 border-neutral-700 bg-neutral-900 hover:bg-neutral-800">
                        View <ArrowRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create Opportunity Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-2xl bg-neutral-900 border-neutral-800">
          <DialogHeader>
            <DialogTitle>Create New Opportunity</DialogTitle>
            <DialogDescription>Fill in the deal specifics to track it in your pipeline.</DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2 col-span-2">
              <label className="text-sm font-medium">Deal Name <span className="text-red-400">*</span></label>
              <Input 
                placeholder="e.g. Acme Corp - Enterprise License" 
                value={formData.deal_name}
                onChange={e => setFormData({...formData, deal_name: e.target.value})}
                disabled={isSubmitting}
                className="bg-neutral-950 border-neutral-800"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Account <span className="text-red-400">*</span></label>
              <Select value={formData.account_id} onValueChange={v => setFormData({...formData, account_id: v})} disabled={isSubmitting}>
                <SelectTrigger className="bg-neutral-950 border-neutral-800">
                  <SelectValue placeholder="Select Account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(acc => (
                    <SelectItem key={acc._id} value={acc._id}>{acc.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Amount <span className="text-red-400">*</span></label>
              <Input 
                type="number"
                placeholder="0.00" 
                value={formData.amount}
                onChange={e => setFormData({...formData, amount: e.target.value})}
                disabled={isSubmitting}
                className="bg-neutral-950 border-neutral-800"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Expected Close Date <span className="text-red-400">*</span></label>
              <Input 
                type="date"
                value={formData.expected_close_date}
                onChange={e => setFormData({...formData, expected_close_date: e.target.value})}
                disabled={isSubmitting}
                className="bg-neutral-950 border-neutral-800"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Stage</label>
              <Select value={formData.stage} onValueChange={v => setFormData({...formData, stage: v})} disabled={isSubmitting}>
                <SelectTrigger className="bg-neutral-950 border-neutral-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Priority</label>
              <Select value={formData.priority} onValueChange={v => setFormData({...formData, priority: v})} disabled={isSubmitting}>
                <SelectTrigger className="bg-neutral-950 border-neutral-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Forecast Category</label>
              <Select value={formData.forecast_category} onValueChange={v => setFormData({...formData, forecast_category: v})} disabled={isSubmitting}>
                <SelectTrigger className="bg-neutral-950 border-neutral-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORECAST_CATEGORIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 col-span-2">
              <label className="text-sm font-medium">Next Action</label>
              <Input 
                placeholder="e.g. Schedule technical demo with CTO" 
                value={formData.next_action}
                onChange={e => setFormData({...formData, next_action: e.target.value})}
                disabled={isSubmitting}
                className="bg-neutral-950 border-neutral-800"
              />
            </div>

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)} disabled={isSubmitting}>Cancel</Button>
            <Button onClick={handleCreateOpportunity} disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create Deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Modal */}
      <Dialog open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
        <DialogContent className="max-w-md bg-neutral-900 border-neutral-800">
          <DialogHeader>
            <DialogTitle>Export Opportunities</DialogTitle>
            <DialogDescription>Generate a custom CRM data export.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Export Type</label>
              <Select value={exportConfig.reportType} onValueChange={v => setExportConfig({...exportConfig, reportType: v})}>
                <SelectTrigger className="bg-neutral-950 border-neutral-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard Opportunities</SelectItem>
                  <SelectItem value="pipeline">Pipeline Report</SelectItem>
                  <SelectItem value="forecast">Forecast Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Export Format</label>
              <Select value={exportConfig.format} onValueChange={v => setExportConfig({...exportConfig, format: v})}>
                <SelectTrigger className="bg-neutral-950 border-neutral-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                  <SelectItem value="csv">CSV (.csv)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Export Scope</label>
              <Select value={exportConfig.scope} onValueChange={v => setExportConfig({...exportConfig, scope: v})}>
                <SelectTrigger className="bg-neutral-950 border-neutral-800">
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExportModalOpen(false)}>Cancel</Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={handleExport} disabled={isExporting}>
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
              Generate Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
