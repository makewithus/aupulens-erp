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
import { Plus, CheckCircle, BarChart3, DollarSign, Clock, AlertCircle } from 'lucide-react';
import { StatsRowSkeleton, TableSkeleton } from '@/components/ui/loading-skeletons';
import { FinancePageHeader } from '@/components/finance/FinancePageHeader';
import { DraggableVisualization } from '@/components/finance/DraggableVisualization';

interface Bill {
  _id: string;
  billNumber: string;
  vendorName: string;
  vendorEmail: string;
  total: number;
  currency: string;
  status: string;
  issueDate: string;
  dueDate: string;
}

export default function PayablesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [bills, setBills] = useState<Bill[]>([]);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  
  // Visualization state
  const [isVizOpen, setIsVizOpen] = useState(false);
  const [vizData, setVizData] = useState<Record<string, string | number>[]>([]);
  
  const [newBill, setNewBill] = useState({
    billNumber: '',
    vendorId: '',
    vendorName: '',
    vendorEmail: '',
    items: [{ description: '', quantity: 1, rate: 0, amount: 0 }],
    subtotal: 0,
    taxRate: 18,
    taxAmount: 0,
    total: 0,
    currency: 'INR',
    status: 'pending',
    issueDate: new Date().toISOString().split('T')[0],
    dueDate: '',
  });

  const fetchBills = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      
      const res = await fetch(`/api/finance/bills?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch bills');
      
      const data = await res.json();
      setBills(data.bills);
    } catch (err) {
      console.error('Error fetching bills:', err);
      setError('Failed to load bills');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/finance');
    } else if (status === 'authenticated') {
      if (session?.user?.role !== 'finance' && session?.user?.role !== 'admin') {
        router.push('/auth/finance');
      } else {
        fetchBills();
      }
    }
  }, [status, router, session, fetchBills]);

  const handleAddItem = () => {
    setNewBill({
      ...newBill,
      items: [...newBill.items, { description: '', quantity: 1, rate: 0, amount: 0 }],
    });
  };

  const handleItemChange = (index: number, field: string, value: string | number) => {
    const updatedItems = [...newBill.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'rate') {
      updatedItems[index].amount = updatedItems[index].quantity * updatedItems[index].rate;
    }
    
    setNewBill({ ...newBill, items: updatedItems });
  };

  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      // Calculate totals inline to avoid state update delay
      const subtotal = newBill.items.reduce((sum, item) => sum + item.amount, 0);
      const taxAmount = (subtotal * newBill.taxRate) / 100;
      const total = subtotal + taxAmount;
      
      const billData = {
        ...newBill,
        vendorId: newBill.vendorEmail,
        subtotal,
        taxAmount,
        total,
      };
      
      const res = await fetch('/api/finance/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(billData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create bill');
      }

      setIsAddDialogOpen(false);
      setNewBill({
        billNumber: '',
        vendorId: '',
        vendorName: '',
        vendorEmail: '',
        items: [{ description: '', quantity: 1, rate: 0, amount: 0 }],
        subtotal: 0,
        taxRate: 18,
        taxAmount: 0,
        total: 0,
        currency: 'INR',
        status: 'pending',
        issueDate: new Date().toISOString().split('T')[0],
        dueDate: '',
      });
      fetchBills();
    } catch (err) {
      console.error('Error creating bill:', err);
      setError('Failed to create bill');
    }
  };

  const handleMarkPaid = async (billId: string) => {
    try {
      const res = await fetch(`/api/finance/bills/${billId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'paid',
          paidDate: new Date().toISOString(),
        }),
      });

      if (!res.ok) throw new Error('Failed to update bill');
      
      fetchBills();
    } catch (err) {
      console.error('Error updating bill:', err);
      setError('Failed to mark bill as paid');
    }
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN');
  };

  const getStatusBadge = (status: string) => {
    const config = {
      draft: { className: 'bg-muted text-muted-foreground border-border', label: 'Draft' },
      pending: { className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', label: 'Pending' },
      paid: { className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', label: 'Paid' },
      overdue: { className: 'bg-destructive/10 text-destructive border-destructive/20', label: 'Overdue' },
    };
    
    const style = config[status as keyof typeof config] || config.pending;
    
    return (
      <Badge className={`${style.className} border font-medium`} variant="outline">
        {style.label}
      </Badge>
    );
  };

  if (status === 'loading' || isLoading) {
    return (
      <DashboardLayout
        sidebarSections={financeSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Finance Dashboard"
        pageName="Accounts Payable"
        breadcrumbs={[{ label: 'Dashboard', href: '/finance/summary' }, { label: 'Payables' }]}
        profilePath="/finance/profile"
        userName={session?.user?.name || 'User'}
        userEmail={session?.user?.email || ''}
        userRole={session?.user?.role || 'finance'}
        onSignOut={() => signOut({ callbackUrl: '/auth/finance' })}
      >
        <div className="space-y-6">
          <div><div className="h-9 w-72 bg-muted animate-pulse rounded mb-2" /><div className="h-5 w-96 bg-muted animate-pulse rounded" /></div>
          <StatsRowSkeleton count={4} />
          <Card><CardContent className="pt-6"><TableSkeleton rows={8} columns={7} /></CardContent></Card>
        </div>
      </DashboardLayout>
    );
  }

  const filteredBills = statusFilter === 'all' 
    ? bills 
    : bills.filter(bill => bill.status === statusFilter);

  return (
    <DashboardLayout
      sidebarSections={financeSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Finance Dashboard"
      pageName="Accounts Payable"
      breadcrumbs={[
        { label: 'Dashboard', href: '/finance/summary' },
        { label: 'Payables' }
      ]}
      profilePath="/finance/profile"
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/finance' })}
      onRefresh={fetchBills}
    >
      <div className="space-y-6">
        <FinancePageHeader
          title="Accounts Payable"
          description="Manage vendor bills and track payments"
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  const paidTotal = bills.filter(b => b.status === 'paid').reduce((sum, b) => sum + b.total, 0);
                  const unpaidTotal = bills.filter(b => b.status === 'pending' || b.status === 'draft').reduce((sum, b) => sum + b.total, 0);
                  const overdueTotal = bills.filter(b => b.status === 'overdue').reduce((sum, b) => sum + b.total, 0);
                  
                  setVizData([
                    { category: 'Paid', amount: paidTotal, count: bills.filter(b => b.status === 'paid').length },
                    { category: 'Unpaid', amount: unpaidTotal, count: bills.filter(b => b.status === 'pending' || b.status === 'draft').length },
                    { category: 'Overdue', amount: overdueTotal, count: bills.filter(b => b.status === 'overdue').length },
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
                    Create Bill
                  </Button>
                </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Bill</DialogTitle>
                <DialogDescription>Fill in the details to create a new bill from your vendor</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateBill} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="billNumber">Bill Number *</Label>
                    <Input
                      id="billNumber"
                      value={newBill.billNumber}
                      onChange={(e) => setNewBill({ ...newBill, billNumber: e.target.value })}
                      placeholder="BILL-001"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vendorName">Vendor Name *</Label>
                    <Input
                      id="vendorName"
                      value={newBill.vendorName}
                      onChange={(e) => setNewBill({ ...newBill, vendorName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vendorEmail">Vendor Email *</Label>
                    <Input
                      id="vendorEmail"
                      type="email"
                      value={newBill.vendorEmail}
                      onChange={(e) => setNewBill({ ...newBill, vendorEmail: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="issueDate">Issue Date *</Label>
                    <Input
                      id="issueDate"
                      type="date"
                      value={newBill.issueDate}
                      onChange={(e) => setNewBill({ ...newBill, issueDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dueDate">Due Date *</Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={newBill.dueDate}
                      onChange={(e) => setNewBill({ ...newBill, dueDate: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Line Items</Label>
                  {newBill.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-4 gap-2">
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                        required
                      />
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))}
                        required
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Rate"
                        value={item.rate}
                        onChange={(e) => handleItemChange(index, 'rate', parseFloat(e.target.value))}
                        required
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Amount"
                        value={item.amount}
                        disabled
                      />
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                    Add Item
                  </Button>
                </div>

                <div className="bg-muted/30 p-4 rounded-none space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="font-medium">
                      {newBill.currency} {newBill.items.reduce((sum, item) => sum + item.amount, 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax ({newBill.taxRate}%):</span>
                    <span className="font-medium">
                      {newBill.currency} {((newBill.items.reduce((sum, item) => sum + item.amount, 0) * newBill.taxRate) / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-semibold pt-2 border-t">
                    <span>Total:</span>
                    <span>
                      {newBill.currency} {(newBill.items.reduce((sum, item) => sum + item.amount, 0) * (1 + newBill.taxRate / 100)).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                    Create Bill
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
              <CardTitle className="text-sm font-medium">Total Payable</CardTitle>
              <DollarSign className="h-4 w-4 text-blue-800" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{bills.reduce((sum, bill) => sum + bill.total, 0).toLocaleString('en-IN')}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{bills.filter(b => b.status === 'pending').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Paid</CardTitle>
              <CheckCircle className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{bills.filter(b => b.status === 'paid').length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Overdue</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{bills.filter(b => b.status === 'overdue').length}</div>
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
            <div className="flex justify-between items-center">
              <CardTitle className="text-base font-semibold">
                Bills
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({filteredBills.length} total)
                </span>
              </CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="font-semibold">Bill #</TableHead>
                  <TableHead className="font-semibold">Vendor</TableHead>
                  <TableHead className="font-semibold">Issue Date</TableHead>
                  <TableHead className="font-semibold">Due Date</TableHead>
                  <TableHead className="text-right font-semibold">Amount</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No bills found. Create your first bill to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBills.map((bill) => (
                    <TableRow key={bill._id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">{bill.billNumber}</TableCell>
                      <TableCell>
                        <div className="font-medium">{bill.vendorName}</div>
                        <div className="text-xs text-muted-foreground">{bill.vendorEmail}</div>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(bill.issueDate)}</TableCell>
                      <TableCell className="text-sm">{formatDate(bill.dueDate)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatCurrency(bill.total)}
                      </TableCell>
                      <TableCell>{getStatusBadge(bill.status)}</TableCell>
                      <TableCell>
                        {(bill.status === 'pending' || bill.status === 'overdue') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkPaid(bill._id)}
                            className="h-8"
                          >
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Mark Paid
                          </Button>
                        )}
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
        title="Payables: Paid vs Unpaid vs Overdue"
        chartType="bar"
        xAxisKey="category"
        dataKeys={[
          { key: 'amount', name: 'Amount (₹)', color: 'hsl(var(--primary))' },
          { key: 'count', name: 'Count', color: 'hsl(142, 76%, 36%)' },
        ]}
      />
    </DashboardLayout>
  );
}
