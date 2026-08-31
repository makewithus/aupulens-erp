'use client';

import { Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useAiPrefill } from '@/lib/hooks/useAiPrefill';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { inventorySidebarConfig } from '@/config/sidebar/inventory';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, BarChart3, Search, CheckCircle2 } from 'lucide-react';
import { DraggableVisualization } from '@/components/finance/DraggableVisualization';
import { DateRangeFilter } from '@/components/shared/DateRangeFilter';
import { StatCard } from '@/components/admin/StatCard';
import { UsersGraph } from '@/components/admin/graphics/UsersGraph';
import { ActivePulse } from '@/components/admin/graphics/ActivePulse';

interface Batch {
  _id: string;
  batchNumber: string;
  lotNumber: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  manufactureDate: string;
  expiryDate?: string;
  warehouse: string;
  location?: string;
  status: string;
  bondedWarehouse: boolean;
  customsStatus?: string;
}

interface Warehouse {
  _id: string;
  warehouseCode: string;
  name: string;
  status: string;
}

const statusColors: Record<string, string> = {
  active: "text-blue-500",
  expired: "text-red-500",
  quarantine: "text-amber-500",
  released: "text-emerald-500",
};

const statusLabels: Record<string, string> = {
  active: "Active",
  expired: "Expired",
  quarantine: "Quarantine",
  released: "Released",
};

const customsStatusColors: Record<string, string> = {
  pending: "text-amber-500",
  cleared: "text-blue-500",
  bonded: "text-indigo-500",
};

const customsStatusLabels: Record<string, string> = {
  pending: "Pending",
  cleared: "Cleared",
  bonded: "Bonded",
};

const LIMIT = 10;

export default function BatchLotPage() {
  return (
    <Suspense fallback={null}>
      <BatchLotPageInner />
    </Suspense>
  );
}

function BatchLotPageInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [batches, setBatches] = useState<Batch[]>([]);
  // Separate, unpaginated fetch used only for the KPI cards — those need
  // totals across every matching batch, not just the current page of 10.
  const [allBatches, setAllBatches] = useState<Batch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [error, setError] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // AI-native "redirect with filters" support — seeded from the URL
  // synchronously (lazy useState initializer) so the very first fetch
  // already uses them. A normal, param-less visit just gets the defaults
  // below, unchanged. This used to seed via a separate useEffect after
  // mount, which let an initial unfiltered fetch fire and render before the
  // filtered one landed: a visible flash of the wrong rows on every
  // filtered redirect. `debouncedSearch` is seeded too (not just
  // `searchQuery`) so a seeded search term doesn't wait out its normal
  // 300ms typing-debounce before the first fetch uses it.
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || 'all');
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get('search') || '');
  const [dateFrom, setDateFrom] = useState(() => searchParams.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState(() => searchParams.get('dateTo') || '');
  const [quantityMin, setQuantityMin] = useState(() => searchParams.get('quantityMin') || '');
  const [quantityMax, setQuantityMax] = useState(() => searchParams.get('quantityMax') || '');

  // Visualization state
  const [isVizOpen, setIsVizOpen] = useState(false);
  const [vizData, setVizData] = useState<Record<string, string | number>[]>([]);
  
  const [newBatch, setNewBatch] = useState({
    batchNumber: '',
    lotNumber: '',
    itemCode: '',
    itemName: '',
    quantity: 0,
    manufactureDate: new Date().toISOString().split('T')[0],
    expiryDate: '',
    warehouse: '',
    location: '',
    status: 'active',
    bondedWarehouse: false,
    customsStatus: 'cleared',
  });

  // AI-native pre-fill: open the Add Batch dialog with AI-extracted fields.
  useAiPrefill('batch', (p) => {
    const d: any = p.data || {};
    setNewBatch((prev) => ({
      ...prev,
      batchNumber: d.batch_number ? String(d.batch_number) : prev.batchNumber,
      lotNumber: d.lot_number ? String(d.lot_number) : prev.lotNumber,
      itemCode: d.item_code ? String(d.item_code) : prev.itemCode,
      itemName: d.item_name ? String(d.item_name) : prev.itemName,
      quantity: Number(d.quantity) > 0 ? Number(d.quantity) : prev.quantity,
      warehouse: d.warehouse ? String(d.warehouse) : prev.warehouse,
      location: d.location ? String(d.location) : prev.location,
      manufactureDate: d.manufacture_date ? String(d.manufacture_date) : prev.manufactureDate,
      expiryDate: d.expiry_date ? String(d.expiry_date) : prev.expiryDate,
      status: ['active', 'inactive', 'expired'].includes(d.status) ? d.status : prev.status,
      bondedWarehouse: typeof d.bonded_warehouse === 'boolean' ? d.bonded_warehouse : prev.bondedWarehouse,
      customsStatus: ['cleared', 'pending', 'in_bond'].includes(d.customs_status) ? d.customs_status : prev.customsStatus,
    }));
    setIsAddDialogOpen(true);
    if (p.suggestions && p.suggestions.length) toast.info('Review before saving', { description: p.suggestions.join('  •  ') });
  });

  useEffect(() => {
    if (status === "authenticated") {
      if (session?.user?.role !== 'inventory' && session?.user?.role !== 'admin') {
        router.push('/auth/inventory');
      }
    }
  }, [status, router, session]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const fetchBatches = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);
      if (quantityMin) params.append('quantityMin', quantityMin);
      if (quantityMax) params.append('quantityMax', quantityMax);

      const res = await cachedFetch(`/api/inventory/batch?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch batches');

      const data = await res.json();
      setBatches(data.batches || []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (err) {
      console.error('Error fetching batches:', err);
      setError('Failed to load batches');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, debouncedSearch, page, dateFrom, dateTo, quantityMin, quantityMax]);

  const fetchAllBatchesForStats = useCallback(async () => {
    try {
      const res = await cachedFetch('/api/inventory/batch');
      if (!res.ok) return;
      const data = await res.json();
      setAllBatches(data.batches || []);
    } catch (err) {
      console.error('Error fetching batch stats:', err);
    }
  }, []);

  const fetchWarehouses = useCallback(async () => {
    try {
      const res = await cachedFetch('/api/inventory/warehouse');
      if (res.ok) {
        const data = await res.json();
        setWarehouses(data.warehouses.filter((w: Warehouse) => w.status === 'active'));
      }
    } catch (err) {
      console.error('Error fetching warehouses:', err);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchBatches();
      fetchWarehouses();
    }
  }, [status, fetchBatches, fetchWarehouses]);

  useEffect(() => {
    if (status === 'authenticated') fetchAllBatchesForStats();
  }, [status, fetchAllBatchesForStats]);

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await cachedFetch('/api/inventory/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBatch),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create batch');
      }

      setIsAddDialogOpen(false);
      setNewBatch({
        batchNumber: '',
        lotNumber: '',
        itemCode: '',
        itemName: '',
        quantity: 0,
        manufactureDate: new Date().toISOString().split('T')[0],
        expiryDate: '',
        warehouse: '',
        location: '',
        status: 'active',
        bondedWarehouse: false,
        customsStatus: 'cleared',
      });
      fetchBatches();
      fetchAllBatchesForStats();
    } catch (err) {
      console.error('Error creating batch:', err);
      setError('Failed to create batch');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const label = statusLabels[status] || status;
    return (
      <Badge
        className={`
          rounded-none
          border-0
          bg-transparent
          px-0
          font-mono
          text-[12px]
          uppercase
          tracking-[0.12em]
          hover:bg-transparent
          shadow-none
          ${statusColors[status] || "text-muted-foreground"}
        `}
      >
        {label}
      </Badge>
    );
  };

  const getCustomsStatusBadge = (status: string) => {
    const label = customsStatusLabels[status] || status;
    return (
      <Badge
        className={`
          rounded-none
          border-0
          bg-transparent
          px-0
          font-mono
          text-[12px]
          uppercase
          tracking-[0.12em]
          hover:bg-transparent
          shadow-none
          ${customsStatusColors[status] || "text-muted-foreground"}
        `}
      >
        {label}
      </Badge>
    );
  };

  const getDaysUntilExpiry = (expiryDate: string) => {
    const expiry = new Date(expiryDate);
    const today = new Date();
    const diff = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // batches is already filtered + paginated server-side.
  const filteredBatches = batches;

  // Compute metrics for KPIs from the full (unpaginated) matching set.
  const kpis = useMemo(() => {
    const total = allBatches.length;
    const active = allBatches.filter(b => b.status === 'active').length;
    const quarantine = allBatches.filter(b => b.status === 'quarantine').length;
    const expired = allBatches.filter(b => b.status === 'expired').length;
    return { total, active, quarantine, expired };
  }, [allBatches]);

  return (
    <DashboardLayout
      sidebarSections={inventorySidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Inventory Dashboard"
      pageName="Batch & Lot Tracking"
      breadcrumbs={[
        { label: 'Dashboard', href: '/inventory/summary' },
        { label: 'Batch & Lot' }
      ]}
      profilePath="/inventory/profile"
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/inventory' })}
      onRefresh={() => { fetchBatches(); fetchAllBatchesForStats(); }}
    >
      <div className="space-y-6">
        {/* Page Header Toolbar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Batch & Lot Tracking
            </h1>
          </div>
          <div className="flex gap-2">
            

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="h-12 px-6 text-primary bg-tertiary border-secondary border-1 transition-all hover:bg-muted font-mono text-[13px] uppercase tracking-wider rounded-none cursor-pointer">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Batch
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-none border border-border/30 bg-background">
                <DialogHeader>
                  <DialogTitle className="text-xl font-medium tracking-tight">Add New Batch</DialogTitle>
                  <DialogDescription>Fill in the details to create a new batch or lot record</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateBatch} className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="batchNumber">Batch Number *</Label>
                      <Input
                        id="batchNumber"
                        value={newBatch.batchNumber}
                        onChange={(e) => setNewBatch({ ...newBatch, batchNumber: e.target.value })}
                        placeholder="BATCH001"
                        required
                        className="rounded-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lotNumber">Lot Number *</Label>
                      <Input
                        id="lotNumber"
                        value={newBatch.lotNumber}
                        onChange={(e) => setNewBatch({ ...newBatch, lotNumber: e.target.value })}
                        placeholder="LOT2024001"
                        required
                        className="rounded-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="itemCode">Item Code *</Label>
                      <Input
                        id="itemCode"
                        value={newBatch.itemCode}
                        onChange={(e) => setNewBatch({ ...newBatch, itemCode: e.target.value })}
                        placeholder="ITEM001"
                        required
                        className="rounded-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="itemName">Item Name *</Label>
                      <Input
                        id="itemName"
                        value={newBatch.itemName}
                        onChange={(e) => setNewBatch({ ...newBatch, itemName: e.target.value })}
                        placeholder="Product Name"
                        required
                        className="rounded-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="quantity">Quantity *</Label>
                      <Input
                        id="quantity"
                        type="number"
                        value={newBatch.quantity}
                        onChange={(e) => setNewBatch({ ...newBatch, quantity: parseInt(e.target.value) || 0 })}
                        placeholder="100"
                        required
                        className="rounded-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="warehouse">Warehouse *</Label>
                      <Select
                        value={newBatch.warehouse}
                        onValueChange={(value) => setNewBatch({ ...newBatch, warehouse: value })}
                      >
                        <SelectTrigger className="rounded-none">
                          <SelectValue placeholder="Select warehouse" />
                        </SelectTrigger>
                        <SelectContent className="rounded-none">
                          {warehouses.map((wh) => (
                            <SelectItem key={wh._id} value={wh.name} className="rounded-none">
                              {wh.name} ({wh.warehouseCode})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        value={newBatch.location}
                        onChange={(e) => setNewBatch({ ...newBatch, location: e.target.value })}
                        placeholder="Aisle A, Rack 1"
                        className="rounded-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={newBatch.status}
                        onValueChange={(value) => setNewBatch({ ...newBatch, status: value })}
                      >
                        <SelectTrigger className="rounded-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-none">
                          <SelectItem value="active" className="rounded-none">Active</SelectItem>
                          <SelectItem value="quarantine" className="rounded-none">Quarantine</SelectItem>
                          <SelectItem value="released" className="rounded-none">Released</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="manufactureDate">Manufacture Date *</Label>
                      <Input
                        id="manufactureDate"
                        type="date"
                        value={newBatch.manufactureDate}
                        onChange={(e) => setNewBatch({ ...newBatch, manufactureDate: e.target.value })}
                        required
                        className="rounded-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="expiryDate">Expiry Date</Label>
                      <Input
                        id="expiryDate"
                        type="date"
                        value={newBatch.expiryDate}
                        onChange={(e) => setNewBatch({ ...newBatch, expiryDate: e.target.value })}
                        className="rounded-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 border-t pt-4">
                    <h3 className="font-semibold text-sm">Bonded Warehouse Compliance</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="bondedWarehouse">Bonded Warehouse</Label>
                        <Select
                          value={newBatch.bondedWarehouse ? 'yes' : 'no'}
                          onValueChange={(value) => setNewBatch({ ...newBatch, bondedWarehouse: value === 'yes' })}
                        >
                          <SelectTrigger className="rounded-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-none">
                            <SelectItem value="no" className="rounded-none">No</SelectItem>
                            <SelectItem value="yes" className="rounded-none">Yes</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="customsStatus">Customs Status</Label>
                        <Select
                          value={newBatch.customsStatus}
                          onValueChange={(value) => setNewBatch({ ...newBatch, customsStatus: value })}
                        >
                          <SelectTrigger className="rounded-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-none">
                            <SelectItem value="pending" className="rounded-none">Pending</SelectItem>
                            <SelectItem value="cleared" className="rounded-none">Cleared</SelectItem>
                            <SelectItem value="bonded" className="rounded-none">Bonded</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)} className="rounded-none">
                      Cancel
                    </Button>
                    <Button type="submit" className="rounded-none">
                      Add Batch
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Row */}
        <div className="space-y-1">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
            <StatCard
              title="Total Batches"
              value={kpis.total}
              visual={<UsersGraph />}
            />
            <StatCard
              title="Active Batches"
              value={kpis.active}
              visual={<ActivePulse />}
            />
            <StatCard
              title="Quarantined Batches"
              value={kpis.quarantine}
              visual={<UsersGraph />}
            />
            <StatCard
              title="Expired Batches"
              value={kpis.expired}
              visual={<ActivePulse />}
            />
          </div>

          {/* Unified Card matching HR Employee structure */}
          <Card className="overflow-hidden border border-border/40 shadow-none bg-background rounded-none">
            {/* Card Header & Controls Toolbar */}
            <div className="border-b border-border/20 px-8 py-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="shrink-0">
                  <h2 className="text-[30px] font-medium tracking-[-0.05em] text-foreground">
                    Batch Records
                  </h2>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                    {total}{" "}
                    {total === 1 ? "Batch" : "Batches"}
                  </p>
                </div>

                {/* Toolbar Controls */}
                <div className="w-full max-w-3xl flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-end">
                  {/* Search Input */}
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/35 transition-colors" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by batch, lot, or item..."
                      className="h-11 rounded-none border-border/40 bg-transparent pl-11 pr-4 text-[14px] tracking-tight shadow-none transition-all duration-300 placeholder:text-muted-foreground/60 hover:border-border/40 focus-visible:border-primary/40 focus-visible:bg-white/[0.015] focus-visible:ring-0 w-full text-foreground"
                    />
                  </div>

                  {/* Status Select Filter */}
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-11 w-full md:w-[210px] rounded-none border-border/20 bg-transparent text-[14px] tracking-tight shadow-none hover:border-border/40 focus:ring-0 text-foreground">
                      <SelectValue placeholder="Batch Status" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border/30">
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="quarantine">Quarantine</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="released">Released</SelectItem>
                    </SelectContent>
                  </Select>

                  <DateRangeFilter
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    onDateFromChange={setDateFrom}
                    onDateToChange={setDateTo}
                  />
                </div>
              </div>
            </div>

            {/* Table Content */}
            <CardContent className="p-0">
              <Table>
                <TableHeader className="border-border/40">
                  <TableRow>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Batch #
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Lot #
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Item Info
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Quantity
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Manufacture & Expiry
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Warehouse Location
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Status
                    </TableHead>
                    <TableHead className="px-8 py-5 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                      Customs Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/30">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-20 opacity-55" />
                          </div>
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 font-mono">
                          <Skeleton className="h-4 w-12" />
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-3 w-16 opacity-55" />
                          </div>
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-3 w-16 opacity-55" />
                          </div>
                        </TableCell>
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-4 w-16" />
                        </TableCell>
                        <TableCell className="px-8 py-7 text-right">
                          <Skeleton className="h-4 w-16 ml-auto" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filteredBatches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-24 text-center">
                        <CheckCircle2 className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />
                        <h3 className="text-lg font-medium text-foreground">
                          {searchQuery || statusFilter !== "all"
                            ? "No batches match your filters"
                            : "No batch records found"}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {searchQuery || statusFilter !== "all"
                            ? "Try adjusting your search or status filter."
                            : "Add your first batch record to get started."}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBatches.map((batch) => (
                      <TableRow key={batch._id} className="hover:bg-white/[0.015] transition-colors duration-300">
                        {/* Batch # */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 font-mono text-sm font-semibold text-foreground">
                          {batch.batchNumber}
                        </TableCell>

                        {/* Lot # */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 font-mono text-sm font-semibold text-foreground">
                          {batch.lotNumber}
                        </TableCell>

                        {/* Item Info */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <div className="font-medium text-foreground">{batch.itemName}</div>
                          <div className="text-xs text-muted-foreground/60 font-mono mt-0.5">{batch.itemCode}</div>
                        </TableCell>

                        {/* Quantity */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 font-mono font-medium text-foreground/80">
                          {batch.quantity.toLocaleString()}
                        </TableCell>

                        {/* Manufacture & Expiry */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/85">
                          <div className="font-medium">{formatDate(batch.manufactureDate)}</div>
                          {batch.expiryDate ? (
                            <div className="mt-0.5">
                              <span className="text-xs text-muted-foreground/65">Expires: {formatDate(batch.expiryDate)}</span>
                              {getDaysUntilExpiry(batch.expiryDate) <= 30 && getDaysUntilExpiry(batch.expiryDate) > 0 && (
                                <span className="block text-[11px] text-amber-500 font-mono mt-0.5">
                                  ({getDaysUntilExpiry(batch.expiryDate)} days left)
                                </span>
                              )}
                              {getDaysUntilExpiry(batch.expiryDate) <= 0 && (
                                <span className="block text-[11px] text-red-500 font-mono mt-0.5">
                                  (Expired)
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/50 italic mt-0.5 block">No Expiry</span>
                          )}
                        </TableCell>

                        {/* Warehouse Location */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10 text-sm text-foreground/80">
                          <div className="font-medium">{batch.warehouse}</div>
                          {batch.location && (
                            <div className="text-xs text-muted-foreground/50 mt-0.5">{batch.location}</div>
                          )}
                        </TableCell>

                        {/* Status Badge */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          {getStatusBadge(batch.status)}
                        </TableCell>

                        {/* Customs Badge */}
                        <TableCell className="px-8 py-7 text-right">
                          {batch.bondedWarehouse ? (
                            getCustomsStatusBadge(batch.customsStatus || 'cleared')
                          ) : (
                            <span className="text-xs text-muted-foreground/50">N/A</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-8 py-4 border-t border-border/40">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/60">
                    Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="rounded-none" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                      Previous
                    </Button>
                    <span className="text-sm">Page {page} of {totalPages}</span>
                    <Button variant="outline" size="sm" className="rounded-none" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Draggable Visualization */}
        <DraggableVisualization
          isOpen={isVizOpen}
          onClose={() => setIsVizOpen(false)}
          data={vizData}
          title="Batch Status Distribution"
          chartType="bar"
          xAxisKey="category"
          dataKeys={[
            { key: 'count', name: 'Count', color: 'hsl(var(--primary))' },
            { key: 'quantity', name: 'Quantity', color: 'hsl(221, 83%, 53%)' },
          ]}
        />
      </div>
    </DashboardLayout>
  );
}
