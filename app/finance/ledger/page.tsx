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
import { Plus, Download, Filter, BarChart3 } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/loading-skeletons';
import { FinancePageHeader } from '@/components/finance/FinancePageHeader';
import { DraggableVisualization } from '@/components/finance/DraggableVisualization';

interface Transaction {
  _id: string;
  date: string;
  account: string;
  accountCategory: string;
  type: 'debit' | 'credit';
  amount: number;
  currency: string;
  baseAmount: number;
  notes?: string;
  reference?: string;
}

export default function GeneralLedgerPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  
  // Visualization state
  const [isVizOpen, setIsVizOpen] = useState(false);
  const [vizData, setVizData] = useState<Record<string, string | number>[]>([]);
  
  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchAccount, setSearchAccount] = useState('');
  
  // New transaction form
  const [newTransaction, setNewTransaction] = useState({
    date: new Date().toISOString().split('T')[0],
    account: '',
    accountCategory: 'expense',
    type: 'debit' as 'debit' | 'credit',
    amount: '',
    currency: 'INR',
    exchangeRate: '1',
    notes: '',
    reference: '',
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

  const fetchTransactions = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (typeFilter && typeFilter !== 'all') params.append('type', typeFilter);
      if (categoryFilter && categoryFilter !== 'all') params.append('category', categoryFilter);
      if (searchAccount) params.append('account', searchAccount);
      
      const res = await fetch(`/api/finance/transactions?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch transactions');
      
      const data = await res.json();
      setTransactions(data.transactions);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError('Failed to load transactions');
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, typeFilter, categoryFilter, searchAccount]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchTransactions();
    }
  }, [status, fetchTransactions]);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/finance/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newTransaction,
          amount: parseFloat(newTransaction.amount),
          exchangeRate: parseFloat(newTransaction.exchangeRate),
        }),
      });

      if (!res.ok) throw new Error('Failed to create transaction');

      setIsAddDialogOpen(false);
      setNewTransaction({
        date: new Date().toISOString().split('T')[0],
        account: '',
        accountCategory: 'expense',
        type: 'debit',
        amount: '',
        currency: 'INR',
        exchangeRate: '1',
        notes: '',
        reference: '',
      });
      fetchTransactions();
    } catch (err) {
      console.error('Error creating transaction:', err);
      setError('Failed to create transaction');
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return `${currency === 'INR' ? '₹' : currency} ${amount.toLocaleString('en-IN')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (status === 'loading') {
    return (
      <DashboardLayout
        sidebarSections={financeSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Finance Dashboard"
        pageName="General Ledger"
        breadcrumbs={[
          { label: 'Dashboard', href: '/finance/summary' },
          { label: 'General Ledger' }
        ]}
        profilePath="/finance/profile"
        userName="Finance User"
        userEmail=""
        userRole="finance"
        onSignOut={() => signOut({ callbackUrl: '/auth/finance' })}
      >
        <div className="space-y-6">
          <div>
            <div className="h-8 w-64 bg-muted animate-pulse rounded mb-2" />
            <div className="h-5 w-96 bg-muted animate-pulse rounded" />
          </div>
          <Card>
            <CardHeader>
              <div className="h-6 w-48 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <TableSkeleton rows={10} columns={7} />
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout
        sidebarSections={financeSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Finance Dashboard"
        pageName="General Ledger"
        breadcrumbs={[
          { label: 'Dashboard', href: '/finance/summary' },
          { label: 'General Ledger' }
        ]}
        profilePath="/finance/profile"
        userName={session?.user?.name || ''}
        userEmail={session?.user?.email || ''}
        userRole={session?.user?.role}
        onSignOut={() => signOut({ callbackUrl: '/auth/finance' })}
        onRefresh={fetchTransactions}
      >
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">General Ledger</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Track all financial transactions and account activities
            </p>
          </div>
          <Card>
            <CardContent className="pt-6">
              <TableSkeleton rows={10} columns={7} />
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance Dashboard"
      pageName="General Ledger"
      breadcrumbs={[
        { label: 'Dashboard', href: '/finance/summary' },
        { label: 'General Ledger' }
      ]}
      profilePath="/finance/profile"
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/finance' })}
      onRefresh={fetchTransactions}
    >
      <div className="space-y-6">
        <FinancePageHeader
          title="General Ledger"
          description="Track all financial transactions and account activities"
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  // Prepare visualization data
                  const data = transactions.reduce((acc: Record<string, { date: string; debit: number; credit: number }>, t) => {
                    const date = new Date(t.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
                    if (!acc[date]) {
                      acc[date] = { date, debit: 0, credit: 0 };
                    }
                    if (t.type === 'debit') {
                      acc[date].debit += t.amount;
                    } else {
                      acc[date].credit += t.amount;
                    }
                    return acc;
                  }, {});
                  setVizData(Object.values(data));
                  setIsVizOpen(true);
                }}
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                Visualize
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Transaction
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add New Transaction</DialogTitle>
                  <DialogDescription>Record a new transaction in the general ledger</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddTransaction} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="date">Date *</Label>
                      <Input
                        id="date"
                        type="date"
                        value={newTransaction.date}
                        onChange={(e) => setNewTransaction({ ...newTransaction, date: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="account">Account *</Label>
                      <Input
                        id="account"
                        value={newTransaction.account}
                        onChange={(e) => setNewTransaction({ ...newTransaction, account: e.target.value })}
                        placeholder="e.g., Cash, Bank, Sales"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category">Category *</Label>
                      <Select
                        value={newTransaction.accountCategory}
                        onValueChange={(value) => setNewTransaction({ ...newTransaction, accountCategory: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="revenue">Revenue</SelectItem>
                          <SelectItem value="expense">Expense</SelectItem>
                          <SelectItem value="asset">Asset</SelectItem>
                          <SelectItem value="liability">Liability</SelectItem>
                          <SelectItem value="equity">Equity</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="type">Type *</Label>
                      <Select
                        value={newTransaction.type}
                        onValueChange={(value: 'debit' | 'credit') => setNewTransaction({ ...newTransaction, type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="debit">Debit</SelectItem>
                          <SelectItem value="credit">Credit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="amount">Amount *</Label>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        value={newTransaction.amount}
                        onChange={(e) => setNewTransaction({ ...newTransaction, amount: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="currency">Currency</Label>
                      <Input
                        id="currency"
                        value={newTransaction.currency}
                        onChange={(e) => setNewTransaction({ ...newTransaction, currency: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="reference">Reference</Label>
                      <Input
                        id="reference"
                        value={newTransaction.reference}
                        onChange={(e) => setNewTransaction({ ...newTransaction, reference: e.target.value })}
                        placeholder="Invoice/Bill number"
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Input
                        id="notes"
                        value={newTransaction.notes}
                        onChange={(e) => setNewTransaction({ ...newTransaction, notes: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                      Add Transaction
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            </>
          }
        />

        {error && (
          <div className="p-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-none border border-red-200 dark:border-red-900">
            {error}
          </div>
        )}

        {/* Filters */}
        <Card className="border-border/40">
          <CardHeader className="bg-muted/30 border-b border-border/40">
            <CardTitle className="flex items-center text-base font-semibold">
              <div className="p-1.5 rounded-none bg-primary/10 mr-2">
                <Filter className="h-4 w-4 text-primary" />
              </div>
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="typeFilter" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="debit">Debit</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="categoryFilter" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Category</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="revenue">Revenue</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="asset">Asset</SelectItem>
                    <SelectItem value="liability">Liability</SelectItem>
                    <SelectItem value="equity">Equity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="searchAccount" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Account</Label>
                <Input
                  id="searchAccount"
                  value={searchAccount}
                  onChange={(e) => setSearchAccount(e.target.value)}
                  placeholder="Search account..."
                  className="h-9"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <Button onClick={fetchTransactions}>
                Apply Filters
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setTypeFilter('all');
                  setCategoryFilter('all');
                  setSearchAccount('');
                  fetchTransactions();
                }}
              >
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Transactions Table */}
        <Card className="border-border/40">
          <CardHeader className="bg-muted/30">
            <CardTitle className="text-base font-semibold">
              Transactions
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({transactions.length} total)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Account</TableHead>
                    <TableHead className="font-semibold">Category</TableHead>
                    <TableHead className="font-semibold">Type</TableHead>
                    <TableHead className="text-right font-semibold">Amount</TableHead>
                    <TableHead className="font-semibold">Reference</TableHead>
                    <TableHead className="font-semibold">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                        No transactions found. Add your first transaction to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((transaction) => (
                      <TableRow key={transaction._id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="text-sm">{formatDate(transaction.date)}</TableCell>
                        <TableCell className="font-medium">{transaction.account}</TableCell>
                        <TableCell>
                          <span className="capitalize text-sm text-muted-foreground">{transaction.accountCategory}</span>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center capitalize px-2.5 py-1 rounded-full text-xs font-medium ${
                            transaction.type === 'debit' 
                              ? 'bg-destructive/10 text-destructive border border-destructive/20'
                              : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                          }`}>
                            {transaction.type}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatCurrency(transaction.amount, transaction.currency)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{transaction.reference || '—'}</TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{transaction.notes || '—'}</TableCell>
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
          title="Ledger Transactions"
          chartType="bar"
          dataKeys={[
            { key: 'debit', name: 'Debit', color: 'hsl(0, 84%, 60%)' },
            { key: 'credit', name: 'Credit', color: 'hsl(142, 76%, 36%)' },
          ]}
        />
      </div>
    </DashboardLayout>
  );
}
