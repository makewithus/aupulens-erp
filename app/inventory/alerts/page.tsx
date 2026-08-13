'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { cachedFetch } from "@/lib/api/cachedFetch";
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { inventorySidebarConfig } from '@/config/sidebar/inventory';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  RefreshCw,
  Search,
  Truck,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { StatCard } from '@/components/admin/StatCard';
import { UsersGraph } from '@/components/admin/graphics/UsersGraph';
import { ActivePulse } from '@/components/admin/graphics/ActivePulse';
import { Skeleton } from '@/components/ui/skeleton';

export default function AlertsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [isLoading, setIsLoading] = useState(true);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [restockingId, setRestockingId] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/inventory');
    } else if (status === 'authenticated' && session?.user?.role !== 'inventory' && session?.user?.role !== 'admin') {
      router.push('/auth/inventory');
    }
  }, [status, router, session]);

  const fetchAlerts = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await cachedFetch('/api/inventory/alerts');
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      } else {
        toast.error('Failed to retrieve active reorder alerts');
      }
    } catch (err) {
      console.error('Error fetching alerts:', err);
      toast.error('Connection error occurred while fetching alerts');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchAlerts();
    }
  }, [status, fetchAlerts]);

  const uniqueWarehouses = useMemo(() => {
    const list = alerts.map((item) => item.warehouse).filter(Boolean);
    return Array.from(new Set(list));
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.itemCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesWarehouse =
        selectedWarehouse === 'all' || item.warehouse === selectedWarehouse;

      const isOutOfStock = item.quantity === 0;
      const isCritical = item.quantity > 0 && item.quantity <= item.reorderLevel * 0.5;
      const isLowStock = item.quantity > item.reorderLevel * 0.5 && item.quantity <= item.reorderLevel;

      let matchesStatus = true;
      if (selectedStatus === 'out_of_stock') {
        matchesStatus = isOutOfStock;
      } else if (selectedStatus === 'critical') {
        matchesStatus = isCritical;
      } else if (selectedStatus === 'low_stock') {
        matchesStatus = isLowStock;
      }

      return matchesSearch && matchesWarehouse && matchesStatus;
    });
  }, [alerts, searchTerm, selectedWarehouse, selectedStatus]);

  const handleRestock = async (item: any) => {
    setRestockingId(item._id);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const orderRef = `PO-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
      toast.success(
        <div>
          <p className="font-bold text-sm">Purchase Order Generated</p>
          <p className="text-xs">Created order {orderRef} for {item.reorderQuantity} {item.unit || 'units'} of {item.name}.</p>
        </div>,
        { duration: 4000 }
      );
      setAlerts((prev) => prev.filter((a) => a._id !== item._id));
    } catch {
      toast.error('Restocking request failed');
    } finally {
      setRestockingId(null);
    }
  };

  const kpis = useMemo(() => {
    const total = alerts.length;
    const outOfStock = alerts.filter((item) => item.quantity === 0).length;
    const critical = alerts.filter((item) => item.quantity > 0 && item.quantity <= item.reorderLevel * 0.5).length;
    const totalValuation = alerts.reduce((sum, item) => sum + (item.reorderQuantity * item.unitCost), 0);

    return {
      total,
      outOfStock,
      critical,
      totalValuation,
    };
  }, [alerts]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={inventorySidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Inventory Dashboard"
      pageName="Reorder Alerts"
      breadcrumbs={[
        { label: 'Dashboard', href: '/inventory/summary' },
        { label: 'Alerts' },
      ]}
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/inventory' })}
      profilePath="/inventory/profile"
    >
      <div className="space-y-6">
        {/* Header toolbar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
              Reorder Alerts
            </h1>
          </div>
          <Button
            variant="outline"
            onClick={fetchAlerts}
            disabled={isLoading}
            className="none-xl h-11 px-4 rounded-none border border-border/40 text-primary hover:bg-muted text-[13px] tracking-tight shadow-none transition-all cursor-pointer font-mono"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Alerts
          </Button>
        </div>

        {/* HR-style Stats Cards Banner */}
        <div className="space-y-1">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
            <StatCard
              title="Active Alerts"
              value={kpis.total}
              visual={<UsersGraph />}
            />
            <StatCard
              title="Out of Stock"
              value={kpis.outOfStock}
              visual={<ActivePulse />}
            />
            <StatCard
              title="Critical Warnings"
              value={kpis.critical}
              visual={<UsersGraph />}
            />
            <StatCard
              title="Restock Valuation"
              value={`₹${kpis.totalValuation.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
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
                    Active Alerts
                  </h2>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
                    {filteredAlerts.length}{' '}
                    {filteredAlerts.length === 1 ? 'alert' : 'alerts'} active
                  </p>
                </div>

                {/* Toolbar Controls */}
                <div className="w-full max-w-3xl flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-end">
                  {/* Search Input */}
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/35 transition-colors" />
                    <Input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search alerts..."
                      className="h-11 rounded-none border-border/40 bg-transparent pl-11 pr-4 text-[14px] tracking-tight shadow-none transition-all duration-300 placeholder:text-muted-foreground/60 hover:border-border/40 focus-visible:border-primary/40 focus-visible:bg-white/[0.015] focus-visible:ring-0 w-full text-foreground"
                    />
                  </div>


                  {/* Status Select */}
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="h-11 w-full md:w-[210px] rounded-none border-border/20 bg-transparent text-[14px] tracking-tight shadow-none hover:border-border/40 focus:ring-0 text-foreground">
                      <SelectValue placeholder="Alert Status" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border/30">
                      <SelectItem value="all">All Alerts</SelectItem>
                      <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                      <SelectItem value="critical">Critical Warning</SelectItem>
                      <SelectItem value="low_stock">Low Stock Warning</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Table Area */}
            <CardContent className="p-0">
              <Table>
                <TableHeader className="border-border/40">
                  <TableRow>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Item
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Location
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Stock Level
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Suggested Reorder
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Valuation
                    </TableHead>
                    <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50 border-r last:border-0 border-border/10">
                      Alert Status
                    </TableHead>
                    <TableHead className="px-8 py-5 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/30">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {/* Item Info */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <div className="space-y-2">
                            <Skeleton className="h-5 w-36" />
                            <Skeleton className="h-3.5 w-24 opacity-55" />
                          </div>
                        </TableCell>

                        {/* Location */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-3 w-16 opacity-55" />
                          </div>
                        </TableCell>

                        {/* Stock Level */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-12" />
                            <Skeleton className="h-1.5 w-36" />
                          </div>
                        </TableCell>

                        {/* Suggested Reorder */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-4 w-16" />
                        </TableCell>

                        {/* Valuation */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-3 w-16 opacity-55" />
                          </div>
                        </TableCell>

                        {/* Alert Status */}
                        <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                          <Skeleton className="h-5 w-24" />
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="px-8 py-7 text-right">
                          <Skeleton className="h-8 w-20 ml-auto" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filteredAlerts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-24 text-center">
                        <CheckCircle2 className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />
                        <h3 className="text-lg font-medium text-foreground">
                          {searchTerm || selectedWarehouse !== 'all' || selectedStatus !== 'all'
                            ? "No alerts match your filters"
                            : "No active alerts"}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {searchTerm || selectedWarehouse !== 'all' || selectedStatus !== 'all'
                            ? "Try adjusting your search or filters."
                            : "All stock levels are currently healthy and operational."}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAlerts.map((item) => {
                      const isOutOfStock = item.quantity === 0;
                      const isCritical = item.quantity > 0 && item.quantity <= item.reorderLevel * 0.5;
                      const progressVal = Math.min((item.quantity / (item.reorderLevel || 1)) * 100, 100);

                      return (
                        <TableRow
                          key={item._id}
                          className="group transition-colors duration-300 hover:bg-white/[0.015]"
                        >
                          {/* Item Code & Name */}
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                            <div className="space-y-1">
                              <h3 className="text-[18px] font-medium tracking-[-0.03em] text-foreground">
                                {item.name}
                              </h3>
                              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground/55">
                                <span className="text-primary/70">{item.itemCode}</span> • {item.category}
                              </p>
                            </div>
                          </TableCell>

                          {/* Location / Warehouse */}
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                            <div className="space-y-1">
                              <p className="text-sm text-foreground">{item.warehouse}</p>
                              {item.location && (
                                <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground/55">
                                  Shelf: {item.location}
                                </p>
                              )}
                            </div>
                          </TableCell>

                          {/* Stock Level Progress Indicator */}
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                            <div className="space-y-1.5 w-36">
                              <div className="flex justify-between text-xs">
                                <span className="font-mono font-medium text-foreground/80">
                                  {item.quantity} {item.unit || 'pcs'}
                                </span>
                                <span className="text-muted-foreground/60 font-mono text-[11px]">
                                  Lvl: {item.reorderLevel}
                                </span>
                              </div>
                              <div className="w-full h-1 bg-muted rounded-none overflow-hidden relative">
                                <div
                                  style={{ width: `${progressVal}%` }}
                                  className={`h-full transition-all duration-500 ${
                                    isOutOfStock
                                      ? 'bg-red-500'
                                      : isCritical
                                      ? 'bg-orange-500'
                                      : 'bg-blue-500'
                                  }`}
                                />
                              </div>
                            </div>
                          </TableCell>

                          {/* Suggested Reorder Qty */}
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                            <span className="font-mono text-sm text-foreground/80">
                              {item.reorderQuantity} {item.unit || 'pcs'}
                            </span>
                          </TableCell>

                          {/* Valuation */}
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
                            <div className="space-y-1">
                              <p className="text-sm text-foreground/90 font-medium">
                                ₹{(item.reorderQuantity * item.unitCost).toLocaleString('en-IN', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </p>
                              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground/55">
                                Cost: ₹{item.unitCost.toLocaleString('en-IN')}
                              </p>
                            </div>
                          </TableCell>

                          {/* Alert Severity Badge */}
                          <TableCell className="px-8 py-7 border-r last:border-0 border-border/10">
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
                                ${
                                  isOutOfStock
                                    ? 'text-red-500'
                                    : isCritical
                                    ? 'text-orange-500'
                                    : 'text-blue-500'
                                }
                              `}
                            >
                              {isOutOfStock
                                ? 'Out of Stock'
                                : isCritical
                                ? 'Critical Warning'
                                : 'Low Stock'}
                            </Badge>
                          </TableCell>

                          {/* Restock trigger action button */}
                          <TableCell className="px-8 py-7 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={restockingId !== null}
                              onClick={() => handleRestock(item)}
                              className="h-8 rounded-none hover:bg-white/5 text-primary hover:text-primary font-mono text-[11px] uppercase tracking-wider inline-flex items-center gap-1.5 px-3 border border-border/20 hover:border-border/40 cursor-pointer"
                            >
                              {restockingId === item._id ? (
                                <>
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                  Restocking...
                                </>
                              ) : (
                                <>
                                  <Truck className="h-3.5 w-3.5 mr-1" />
                                  Restock
                                </>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
