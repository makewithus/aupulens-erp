'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { financeSidebarConfig } from '@/config/sidebar/finance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Package, TrendingDown, Wallet, Archive, BarChart3 } from 'lucide-react';
import { StatsRowSkeleton, TableSkeleton } from '@/components/ui/loading-skeletons';
import { FinancePageHeader } from '@/components/finance/FinancePageHeader';
import { DraggableVisualization } from '@/components/finance/DraggableVisualization';

interface Asset {
  _id: string;
  assetName: string;
  category: string;
  purchaseDate: string;
  purchaseValue: number;
  currentBookValue: number;
  accumulatedDepreciation: number;
  status: string;
}

export default function AssetsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [summary, setSummary] = useState({ totalPurchaseValue: 0, totalDepreciation: 0, totalBookValue: 0, count: 0 });
  const [error, setError] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  
  // Visualization state
  const [isVizOpen, setIsVizOpen] = useState(false);
  const [vizData, setVizData] = useState<Record<string, string | number>[]>([]);
  
  const [newAsset, setNewAsset] = useState({
    assetName: '',
    category: 'equipment',
    purchaseDate: new Date().toISOString().split('T')[0],
    purchaseValue: '',
    depreciationMethod: 'straight-line',
    depreciationRate: '10',
    usefulLife: '5',
    notes: '',
  });

  const fetchAssets = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/finance/assets');
      if (!res.ok) throw new Error('Failed to fetch assets');
      
      const data = await res.json();
      setAssets(data.assets);
      setSummary(data.summary);
    } catch (err) {
      console.error('Error fetching assets:', err);
      setError('Failed to load assets');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/finance');
    } else if (status === 'authenticated') {
      if (session?.user?.role !== 'finance' && session?.user?.role !== 'admin') {
        router.push('/auth/finance');
      } else {
        fetchAssets();
      }
    }
  }, [status, router, session, fetchAssets]);

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/finance/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newAsset,
          purchaseValue: parseFloat(newAsset.purchaseValue),
          depreciationRate: parseFloat(newAsset.depreciationRate),
          usefulLife: parseInt(newAsset.usefulLife),
        }),
      });

      if (!res.ok) throw new Error('Failed to create asset');

      setIsAddDialogOpen(false);
      setNewAsset({
        assetName: '',
        category: 'equipment',
        purchaseDate: new Date().toISOString().split('T')[0],
        purchaseValue: '',
        depreciationMethod: 'straight-line',
        depreciationRate: '10',
        usefulLife: '5',
        notes: '',
      });
      fetchAssets();
    } catch (err) {
      console.error('Error creating asset:', err);
      setError('Failed to create asset');
    }
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN');
  };

  if (status === 'loading' || isLoading) {
    return (
      <DashboardLayout
        sidebarSections={financeSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Finance Dashboard"
        pageName="Fixed Assets"
        breadcrumbs={[{ label: 'Dashboard', href: '/finance/summary' }, { label: 'Assets' }]}
        profilePath="/finance/profile"
        userName={session?.user?.name || 'User'}
        userEmail={session?.user?.email || ''}
        userRole={session?.user?.role || 'finance'}
        onSignOut={() => signOut({ callbackUrl: '/auth/finance' })}
      >
        <div className="space-y-6">
          <div><div className="h-9 w-64 bg-muted animate-pulse rounded mb-2" /><div className="h-5 w-96 bg-muted animate-pulse rounded" /></div>
          <StatsRowSkeleton count={4} />
          <Card><CardContent className="pt-6"><TableSkeleton rows={8} columns={8} /></CardContent></Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance Dashboard"
      pageName="Fixed Assets"
      breadcrumbs={[
        { label: 'Dashboard', href: '/finance/summary' },
        { label: 'Assets' }
      ]}
      profilePath="/finance/profile"
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/finance' })}
      onRefresh={fetchAssets}
    >
      <div className="space-y-6">
        <FinancePageHeader
          title="Fixed Assets"
          description="Track company assets and depreciation"
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  const totalPurchaseValue = assets.reduce((sum, asset) => sum + asset.purchaseValue, 0);
                  const totalDepreciation = assets.reduce((sum, asset) => sum + asset.accumulatedDepreciation, 0);
                  const totalBookValue = assets.reduce((sum, asset) => sum + asset.currentBookValue, 0);
                  
                  setVizData([
                    { category: 'Purchase Value', amount: totalPurchaseValue, percentage: 100 },
                    { category: 'Depreciation', amount: totalDepreciation, percentage: totalPurchaseValue > 0 ? (totalDepreciation / totalPurchaseValue * 100).toFixed(1) : 0 },
                    { category: 'Current Book Value', amount: totalBookValue, percentage: totalPurchaseValue > 0 ? (totalBookValue / totalPurchaseValue * 100).toFixed(1) : 0 },
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
                    Add Asset
                  </Button>
                </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Asset</DialogTitle>
                <DialogDescription>Register a new fixed asset with purchase details and depreciation information</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateAsset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="assetName">Asset Name *</Label>
                  <Input
                    id="assetName"
                    value={newAsset.assetName}
                    onChange={(e) => setNewAsset({ ...newAsset, assetName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select
                    value={newAsset.category}
                    onValueChange={(value) => setNewAsset({ ...newAsset, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equipment">Equipment</SelectItem>
                      <SelectItem value="furniture">Furniture</SelectItem>
                      <SelectItem value="vehicle">Vehicle</SelectItem>
                      <SelectItem value="building">Building</SelectItem>
                      <SelectItem value="land">Land</SelectItem>
                      <SelectItem value="software">Software</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="purchaseDate">Purchase Date *</Label>
                    <Input
                      id="purchaseDate"
                      type="date"
                      value={newAsset.purchaseDate}
                      onChange={(e) => setNewAsset({ ...newAsset, purchaseDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="purchaseValue">Purchase Value *</Label>
                    <Input
                      id="purchaseValue"
                      type="number"
                      step="0.01"
                      value={newAsset.purchaseValue}
                      onChange={(e) => setNewAsset({ ...newAsset, purchaseValue: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="depreciationRate">Depreciation Rate (%)</Label>
                    <Input
                      id="depreciationRate"
                      type="number"
                      value={newAsset.depreciationRate}
                      onChange={(e) => setNewAsset({ ...newAsset, depreciationRate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="usefulLife">Useful Life (years)</Label>
                    <Input
                      id="usefulLife"
                      type="number"
                      value={newAsset.usefulLife}
                      onChange={(e) => setNewAsset({ ...newAsset, usefulLife: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Input
                    id="notes"
                    value={newAsset.notes}
                    onChange={(e) => setNewAsset({ ...newAsset, notes: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                    Add Asset
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
            </>
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
              <Package className="h-4 w-4 text-blue-800" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.count}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Purchase Value</CardTitle>
              <Wallet className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{summary.totalPurchaseValue.toLocaleString('en-IN')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Depreciation</CardTitle>
              <TrendingDown className="h-4 w-4 text-blue-800" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-800">₹{summary.totalDepreciation.toLocaleString('en-IN')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Current Book Value</CardTitle>
              <Archive className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">₹{summary.totalBookValue.toLocaleString('en-IN')}</div>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-none">
            {error}
          </div>
        )}

        <Card className="border-border/40">
          <CardHeader className="bg-muted/30">
            <CardTitle className="text-base font-semibold">
              Assets
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({summary.count} total)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="font-semibold">Asset Name</TableHead>
                  <TableHead className="font-semibold">Category</TableHead>
                  <TableHead className="font-semibold">Purchase Date</TableHead>
                  <TableHead className="text-right font-semibold">Purchase Value</TableHead>
                  <TableHead className="text-right font-semibold">Depreciation</TableHead>
                  <TableHead className="text-right font-semibold">Book Value</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No assets found. Add your first asset to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  assets.map((asset) => (
                    <TableRow key={asset._id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">{asset.assetName}</TableCell>
                      <TableCell className="capitalize text-sm">{asset.category}</TableCell>
                      <TableCell className="text-sm">{formatDate(asset.purchaseDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(asset.purchaseValue)}</TableCell>
                      <TableCell className="text-right tabular-nums text-amber-600">
                        {formatCurrency(asset.accumulatedDepreciation)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatCurrency(asset.currentBookValue)}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${
                          asset.status === 'active' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' :
                          asset.status === 'inactive' ? 'bg-muted text-muted-foreground border-border' :
                          'bg-destructive/10 text-destructive border-destructive/20'
                        } border font-medium`} variant="outline">
                          {asset.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <DraggableVisualization
        isOpen={isVizOpen}
        onClose={() => setIsVizOpen(false)}
        data={vizData}
        title="Assets: Purchase Value vs Depreciation"
        chartType="bar"
        xAxisKey="category"
        dataKeys={[
          { key: 'amount', name: 'Amount (₹)', color: 'hsl(var(--primary))' },
          { key: 'percentage', name: 'Percentage (%)', color: 'hsl(142, 76%, 36%)' },
        ]}
      />
    </DashboardLayout>
  );
}
