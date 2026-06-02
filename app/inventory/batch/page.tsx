'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { inventorySidebarConfig } from '@/config/sidebar/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Plus, BarChart3, Layers, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { StatsRowSkeleton, TableSkeleton } from '@/components/ui/loading-skeletons';
import { FinancePageHeader } from '@/components/finance/FinancePageHeader';
import { DraggableVisualization } from '@/components/finance/DraggableVisualization';

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

export default function BatchLotPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  
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

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/inventory');
    } else if (status === 'authenticated') {
      if (session?.user?.role !== 'inventory' && session?.user?.role !== 'admin') {
        router.push('/auth/inventory');
      }
    }
  }, [status, router, session]);

  const fetchBatches = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      
      const res = await fetch(`/api/inventory/batch?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch batches');
      
      const data = await res.json();
      setBatches(data.batches);
    } catch (err) {
      console.error('Error fetching batches:', err);
      setError('Failed to load batches');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  const fetchWarehouses = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/warehouse');
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

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/inventory/batch', {
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
    const config = {
      active: { className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', label: 'Active' },
      expired: { className: 'bg-destructive/10 text-destructive border-destructive/20', label: 'Expired' },
      quarantine: { className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', label: 'Quarantine' },
      released: { className: 'bg-blue-800/10 text-blue-800 dark:text-blue-400 border-blue-800/20', label: 'Released' },
    };
    
    const style = config[status as keyof typeof config] || config.active;
    
    return (
      <Badge className={`${style.className} border font-medium`} variant="outline">
        {style.label}
      </Badge>
    );
  };

  const getCustomsStatusBadge = (status: string) => {
    const config = {
      pending: { className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', label: 'Pending' },
      cleared: { className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', label: 'Cleared' },
      bonded: { className: 'bg-blue-800/10 text-blue-800 dark:text-blue-400 border-blue-800/20', label: 'Bonded' },
    };
    
    const style = config[status as keyof typeof config] || config.cleared;
    
    return (
      <Badge className={`${style.className} border font-medium text-xs`} variant="outline">
        {style.label}
      </Badge>
    );
  };

  const getDaysUntilExpiry = (expiryDate: string) => {
    const expiry = new Date(expiryDate);
    const today = new Date();
    const diff = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const filteredBatches = statusFilter === 'all' 
    ? batches 
    : batches.filter(batch => batch.status === statusFilter);

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
      onRefresh={fetchBatches}
    >
      <div className="space-y-6">
        <FinancePageHeader
          title="Batch & Lot Tracking"
          description="Manage batch and lot numbers with bonded warehouse compliance"
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  const activeCount = batches.filter(b => b.status === 'active').length;
                  const expiredCount = batches.filter(b => b.status === 'expired').length;
                  const quarantineCount = batches.filter(b => b.status === 'quarantine').length;
                  const releasedCount = batches.filter(b => b.status === 'released').length;
                  
                  setVizData([
                    { category: 'Active', count: activeCount, quantity: batches.filter(b => b.status === 'active').reduce((sum, b) => sum + b.quantity, 0) },
                    { category: 'Expired', count: expiredCount, quantity: batches.filter(b => b.status === 'expired').reduce((sum, b) => sum + b.quantity, 0) },
                    { category: 'Quarantine', count: quarantineCount, quantity: batches.filter(b => b.status === 'quarantine').reduce((sum, b) => sum + b.quantity, 0) },
                    { category: 'Released', count: releasedCount, quantity: batches.filter(b => b.status === 'released').reduce((sum, b) => sum + b.quantity, 0) },
                  ]);
                  setIsVizOpen(true);
                }}
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                Visualize
              </Button>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Batch
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Batch</DialogTitle>
                    <DialogDescription>Fill in the details to create a new batch or lot record</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateBatch} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="batchNumber">Batch Number *</Label>
                        <Input
                          id="batchNumber"
                          value={newBatch.batchNumber}
                          onChange={(e) => setNewBatch({ ...newBatch, batchNumber: e.target.value })}
                          placeholder="BATCH001"
                          required
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
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="quantity">Quantity *</Label>
                        <Input
                          id="quantity"
                          type="number"
                          value={newBatch.quantity}
                          onChange={(e) => setNewBatch({ ...newBatch, quantity: parseInt(e.target.value) })}
                          placeholder="100"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="warehouse">Warehouse *</Label>
                        <Select
                          value={newBatch.warehouse}
                          onValueChange={(value) => setNewBatch({ ...newBatch, warehouse: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select warehouse" />
                          </SelectTrigger>
                          <SelectContent>
                            {warehouses.map((wh) => (
                              <SelectItem key={wh._id} value={wh.name}>
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
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="status">Status</Label>
                        <Select
                          value={newBatch.status}
                          onValueChange={(value) => setNewBatch({ ...newBatch, status: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="quarantine">Quarantine</SelectItem>
                            <SelectItem value="released">Released</SelectItem>
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
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="expiryDate">Expiry Date</Label>
                        <Input
                          id="expiryDate"
                          type="date"
                          value={newBatch.expiryDate}
                          onChange={(e) => setNewBatch({ ...newBatch, expiryDate: e.target.value })}
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
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="no">No</SelectItem>
                              <SelectItem value="yes">Yes</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="customsStatus">Customs Status</Label>
                          <Select
                            value={newBatch.customsStatus}
                            onValueChange={(value) => setNewBatch({ ...newBatch, customsStatus: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="cleared">Cleared</SelectItem>
                              <SelectItem value="bonded">Bonded</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-3">
                      <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" className="bg-blue-800 hover:bg-blue-700">
                        Add Batch
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Batches</CardTitle>
              <Layers className="h-4 w-4 text-blue-800" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{batches.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <CheckCircle className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{batches.filter(b => b.status === 'active').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Quarantine</CardTitle>
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{batches.filter(b => b.status === 'quarantine').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Expired</CardTitle>
              <Clock className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{batches.filter(b => b.status === 'expired').length}</div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-none border border-red-200 dark:border-red-900">
            {error}
          </div>
        )}

        {/* Batches Table */}
        <Card className="border-border/40">
          <CardHeader className="bg-muted/30">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base font-semibold">
                Batch Records
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({filteredBatches.length} total)
                </span>
              </CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="quarantine">Quarantine</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="released">Released</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">Batch #</TableHead>
                    <TableHead className="font-semibold">Lot #</TableHead>
                    <TableHead className="font-semibold">Item</TableHead>
                    <TableHead className="font-semibold">Quantity</TableHead>
                    <TableHead className="font-semibold">Manufacture Date</TableHead>
                    <TableHead className="font-semibold">Expiry Date</TableHead>
                    <TableHead className="font-semibold">Warehouse</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Customs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBatches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                        No batch records found. Add your first batch to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBatches.map((batch) => (
                      <TableRow key={batch._id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-semibold text-sm">{batch.batchNumber}</TableCell>
                        <TableCell className="font-medium text-sm">{batch.lotNumber}</TableCell>
                        <TableCell>
                          <div className="font-medium">{batch.itemName}</div>
                          <div className="text-xs text-muted-foreground">{batch.itemCode}</div>
                        </TableCell>
                        <TableCell className="font-semibold tabular-nums">{batch.quantity.toLocaleString()}</TableCell>
                        <TableCell className="text-sm">{formatDate(batch.manufactureDate)}</TableCell>
                        <TableCell>
                          {batch.expiryDate ? (
                            <div>
                              <div className="text-sm">{formatDate(batch.expiryDate)}</div>
                              {getDaysUntilExpiry(batch.expiryDate) <= 30 && getDaysUntilExpiry(batch.expiryDate) > 0 && (
                                <div className="text-xs text-amber-600 font-medium mt-0.5">
                                  {getDaysUntilExpiry(batch.expiryDate)} days left
                                </div>
                              )}
                              {getDaysUntilExpiry(batch.expiryDate) <= 0 && (
                                <div className="text-xs text-destructive font-medium mt-0.5">
                                  Expired
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{batch.warehouse}</div>
                          {batch.location && (
                            <div className="text-xs text-muted-foreground">{batch.location}</div>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(batch.status)}</TableCell>
                        <TableCell>
                          {batch.bondedWarehouse ? (
                            getCustomsStatusBadge(batch.customsStatus || 'cleared')
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

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
