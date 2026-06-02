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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, CheckCircle, XCircle, AlertCircle, BarChart3 } from 'lucide-react';
import { StatsRowSkeleton, TableSkeleton } from '@/components/ui/loading-skeletons';
import { DraggableVisualization } from '@/components/finance/DraggableVisualization';
import { FinanceVisualization } from '@/components/finance/FinanceVisualization';

interface Reconciliation {
  _id: string;
  accountName: string;
  accountNumber: string;
  statementDate: string;
  statementBalance: number;
  bookBalance: number;
  difference: number;
  status: 'pending' | 'reconciled' | 'discrepancy';
  matchedTransactions: number;
  unmatchedTransactions: number;
  createdAt: string;
}

export default function ReconciliationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  // Visualization state
  const [isVizOpen, setIsVizOpen] = useState(false);
  const [vizData, setVizData] = useState<Record<string, string | number>[]>([]);

  const [newRecon, setNewRecon] = useState({
    accountName: '',
    accountNumber: '',
    bankStatementDate: '',
    bankBalance: 0,
    ledgerBalance: 0,
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/finance');
    } else if (status === 'authenticated') {
      if (session?.user?.role !== 'finance' && session?.user?.role !== 'admin') {
        router.push('/auth/finance');
      }
    }
  }, [status, router, session]);

  const fetchReconciliations = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const res = await fetch(`/api/finance/reconciliation?${params}`);
      if (!res.ok) throw new Error('Failed to fetch reconciliations');

      const data = await res.json();
      setReconciliations(data.reconciliations || []);
      setError('');
    } catch (err) {
      console.error('Error fetching reconciliations:', err);
      setError('Failed to load reconciliations');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchReconciliations();
    }
  }, [status, fetchReconciliations]);

  const handleCreateReconciliation = async () => {
    try {
      const res = await fetch('/api/finance/reconciliation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bankStatementDate: newRecon.bankStatementDate,
          bankBalance: newRecon.bankBalance,
          ledgerBalance: newRecon.ledgerBalance,
          transactions: [], // Start with empty transactions array
          notes: `Account: ${newRecon.accountName} (${newRecon.accountNumber})`,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create reconciliation');
      }

      setNewRecon({
        accountName: '',
        accountNumber: '',
        bankStatementDate: '',
        bankBalance: 0,
        ledgerBalance: 0,
      });
      setIsDialogOpen(false);
      fetchReconciliations();
    } catch (err) {
      console.error('Error creating reconciliation:', err);
      setError('Failed to create reconciliation');
    }
  };

  const handleReconcile = async (id: string) => {
    try {
      const res = await fetch(`/api/finance/reconciliation/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'reconciled' }),
      });

      if (!res.ok) throw new Error('Failed to reconcile');

      fetchReconciliations();
    } catch (err) {
      console.error('Error reconciling:', err);
      setError('Failed to reconcile account');
    }
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'reconciled':
        return <Badge className="bg-blue-500">Reconciled</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500">Pending</Badge>;
      case 'discrepancy':
        return <Badge className="bg-red-500">Discrepancy</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const stats = {
    total: reconciliations.length,
    pending: reconciliations.filter((r) => r.status === 'pending').length,
    reconciled: reconciliations.filter((r) => r.status === 'reconciled').length,
    discrepancies: reconciliations.filter((r) => r.status === 'discrepancy').length,
  };

  if (status === 'loading') {
    return (
      <DashboardLayout
        sidebarSections={financeSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Finance Dashboard"
        pageName="Bank Reconciliation"
        breadcrumbs={[{ label: 'Dashboard', href: '/finance/summary' }, { label: 'Reconciliation' }]}
        profilePath="/finance/profile"
        userName="Finance User"
        userEmail=""
        userRole="finance"
        onSignOut={() => signOut({ callbackUrl: '/auth/finance' })}
      >
        <div className="space-y-6">
          <div><div className="h-9 w-80 bg-muted animate-pulse rounded mb-2" /><div className="h-5 w-96 bg-muted animate-pulse rounded" /></div>
          <StatsRowSkeleton count={4} />
          <Card><CardContent className="pt-6"><TableSkeleton rows={8} columns={7} /></CardContent></Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance Dashboard"
      pageName="Bank Reconciliation"
      breadcrumbs={[
        { label: 'Dashboard', href: '/finance/summary' },
        { label: 'Reconciliation' }
      ]}
      profilePath="/finance/profile"
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/finance' })}
      onRefresh={fetchReconciliations}
    >
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Bank Reconciliation</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Match bank statements with your ledger transactions
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const pendingCount = reconciliations.filter(r => r.status === 'pending').length;
                const reconciledCount = reconciliations.filter(r => r.status === 'reconciled').length;
                const discrepancyCount = reconciliations.filter(r => r.status === 'discrepancy').length;
                
                const pendingAmount = reconciliations
                  .filter(r => r.status === 'pending')
                  .reduce((sum, r) => sum + Math.abs(r.difference || 0), 0);
                const reconciledAmount = reconciliations
                  .filter(r => r.status === 'reconciled')
                  .reduce((sum, r) => sum + (r.statementBalance || 0), 0);
                const discrepancyAmount = reconciliations
                  .filter(r => r.status === 'discrepancy')
                  .reduce((sum, r) => sum + Math.abs(r.difference || 0), 0);
                
                setVizData([
                  { category: 'Pending', count: pendingCount, amount: pendingAmount },
                  { category: 'Reconciled', count: reconciledCount, amount: reconciledAmount },
                  { category: 'Discrepancies', count: discrepancyCount, amount: discrepancyAmount },
                ]);
                setIsVizOpen(true);
              }}
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Visualize
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="mr-2 h-4 w-4" />
                Start Reconciliation
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Start Bank Reconciliation</DialogTitle>
                <DialogDescription>Match your bank statement with your accounting records</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="accountName">Account Name</Label>
                  <Input
                    id="accountName"
                    placeholder="HDFC Bank Current Account"
                    value={newRecon.accountName}
                    onChange={(e) =>
                      setNewRecon({ ...newRecon, accountName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account Number</Label>
                  <Input
                    id="accountNumber"
                    placeholder="XXXX1234"
                    value={newRecon.accountNumber}
                    onChange={(e) =>
                      setNewRecon({ ...newRecon, accountNumber: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankStatementDate">Bank Statement Date</Label>
                  <Input
                    id="bankStatementDate"
                    type="date"
                    value={newRecon.bankStatementDate}
                    onChange={(e) =>
                      setNewRecon({ ...newRecon, bankStatementDate: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankBalance">Bank Statement Balance</Label>
                  <Input
                    id="bankBalance"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newRecon.bankBalance}
                    onChange={(e) =>
                      setNewRecon({ ...newRecon, bankBalance: parseFloat(e.target.value) || 0 })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ledgerBalance">Ledger Balance</Label>
                  <Input
                    id="ledgerBalance"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newRecon.ledgerBalance}
                    onChange={(e) =>
                      setNewRecon({ ...newRecon, ledgerBalance: parseFloat(e.target.value) || 0 })
                    }
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateReconciliation}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Start Reconciliation
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-none">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <AlertCircle className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Reconciled</CardTitle>
              <CheckCircle className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.reconciled}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Discrepancies</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.discrepancies}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Reconciliations</CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="reconciled">Reconciled</SelectItem>
                  <SelectItem value="discrepancy">Discrepancy</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-800"></div>
              </div>
            ) : reconciliations.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No reconciliations found. Start a new reconciliation to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Statement Balance</TableHead>
                    <TableHead>Book Balance</TableHead>
                    <TableHead>Difference</TableHead>
                    <TableHead>Matched/Unmatched</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconciliations.map((recon) => (
                    <TableRow key={recon._id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{recon.accountName}</div>
                          <div className="text-sm text-gray-500">{recon.accountNumber}</div>
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(recon.statementDate)}</TableCell>
                      <TableCell>{formatCurrency(recon.statementBalance)}</TableCell>
                      <TableCell>{formatCurrency(recon.bookBalance)}</TableCell>
                      <TableCell>
                        <span
                          className={
                            recon.difference === 0
                              ? 'text-blue-600'
                              : 'text-red-600 font-semibold'
                          }
                        >
                          {formatCurrency(Math.abs(recon.difference))}
                        </span>
                      </TableCell>
                      <TableCell>
                        {recon.matchedTransactions} / {recon.unmatchedTransactions}
                      </TableCell>
                      <TableCell>{getStatusBadge(recon.status)}</TableCell>
                      <TableCell>
                        {recon.status === 'pending' && recon.difference === 0 && (
                          <Button
                            size="sm"
                            onClick={() => handleReconcile(recon._id)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Reconcile
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

       
        {/* Draggable Visualization */}
        <DraggableVisualization
          isOpen={isVizOpen}
          onClose={() => setIsVizOpen(false)}
          data={vizData}
          title="Reconciliation: Pending vs Reconciled vs Discrepancies"
          chartType="bar"
          xAxisKey="category"
          dataKeys={[
            { key: 'count', name: 'Count', color: 'hsl(var(--primary))' },
            { key: 'amount', name: 'Amount (₹)', color: 'hsl(142, 76%, 36%)' },
          ]}
        />
      </div>
    </DashboardLayout>
  );
}
