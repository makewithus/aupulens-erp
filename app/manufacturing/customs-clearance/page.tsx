'use client';
import { confirmDialog } from "@/components/providers/ConfirmRoot";


import { useCallback, useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { manufacturingSidebarConfig } from '@/config/sidebar/manufacturing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileText, Plus, BarChart3, Edit, Trash2 } from 'lucide-react';
import { ManufacturingVisualization } from '@/components/manufacturing/ManufacturingVisualization';
import { useToast } from '@/components/ui/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface CustomsClearance {
  _id: string;
  declarationNumber: string;
  shipmentId: string;
  status: string;
  submissionDate: string;
  clearanceDate?: string;
  customsOffice: string;
  dutyAmount: number;
  currency: string;
}

export default function CustomsClearancePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [clearances, setClearances] = useState<CustomsClearance[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [hsCodes, setHsCodes] = useState<any[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showVisualization, setShowVisualization] = useState(false);
  const [visualizationData, setVisualizationData] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    declarationNumber: '',
    shipmentId: '',
    hsCodeId: '',
    status: 'pending',
    submissionDate: '',
    customsOffice: '',
    dutyAmount: '',
    currency: 'USD',
  });

  const fetchClearances = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/manufacturing/customs-clearance');
      const data = await res.json();
      setClearances(data.clearances || []);
    } catch (err) {
      console.error('Error fetching clearances:', err);
      toast({
        title: 'Error',
        description: 'Failed to fetch customs clearances',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const fetchShipments = useCallback(async () => {
    try {
      const response = await fetch('/api/manufacturing/shipments');
      if (response.ok) {
        const data = await response.json();
        setShipments(data.shipments || []);
      }
    } catch (error) {
      console.error('Failed to fetch shipments:', error);
    }
  }, []);

  const fetchHsCodes = useCallback(async () => {
    try {
      const response = await fetch('/api/manufacturing/hs-codes');
      if (response.ok) {
        const data = await response.json();
        setHsCodes(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to fetch HS codes:', error);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      if (session?.user?.role !== 'manufacturing') {
        router.push('/auth/manufacturing');
      } else {
        fetchClearances();
        fetchShipments();
        fetchHsCodes();
      }
    }
  }, [fetchClearances, fetchHsCodes, fetchShipments, router, session, status]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/manufacturing/customs-clearance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          dutyAmount: parseFloat(formData.dutyAmount),
        }),
      });

      if (res.ok) {
        toast({
          title: 'Success',
          description: 'Customs clearance created successfully',
        });
        setIsCreateOpen(false);
        setFormData({
          declarationNumber: '',
          shipmentId: '',
          hsCodeId: '',
          status: 'pending',
          submissionDate: '',
          customsOffice: '',
          dutyAmount: '',
          currency: 'USD',
        });
        fetchClearances();
      } else {
        throw new Error('Failed to create clearance');
      }
    } catch (err) {
      console.error('Error creating clearance:', err);
      toast({
        title: 'Error',
        description: 'Failed to create customs clearance',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: 'Are you sure you want to delete this customs clearance?' })) return;
    
    try {
      const res = await fetch(`/api/manufacturing/customs-clearance/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast({
          title: 'Success',
          description: 'Customs clearance deleted successfully',
        });
        fetchClearances();
      } else {
        throw new Error('Failed to delete clearance');
      }
    } catch (err) {
      console.error('Error deleting clearance:', err);
      toast({
        title: 'Error',
        description: 'Failed to delete customs clearance',
        variant: 'destructive',
      });
    }
  };

  const loadVisualizationData = async () => {
    const statusCounts = clearances.reduce((acc: any, clearance: any) => {
      const status = clearance.status || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const chartData = Object.entries(statusCounts).map(([status, count]) => ({
      name: status,
      value: count,
    }));

    setVisualizationData(chartData);
    setShowVisualization(true);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'cleared':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'under-review':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-blue-800" />
      </div>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={manufacturingSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Manufacturing"
      pageName="Customs Clearance"
      breadcrumbs={[
        { label: 'Manufacturing', href: '/manufacturing/dashboard' },
        { label: 'Customs Clearance' },
      ]}
      profilePath="/manufacturing/profile"
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/manufacturing' })}
      onRefresh={fetchClearances}
    >
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Customs Clearance</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Manage customs declarations and clearances
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={loadVisualizationData}
              variant="outline"
              className="border-blue-800 text-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950"
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              View Analytics
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-800 hover:bg-blue-700 text-white">
                  <Plus className="mr-2 h-4 w-4" />
                  New Clearance
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Customs Clearance</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="declarationNumber">Declaration Number *</Label>
                      <Input
                        id="declarationNumber"
                        value={formData.declarationNumber}
                        onChange={(e) => setFormData({ ...formData, declarationNumber: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="shipmentId">Shipment *</Label>
                      <Select
                        value={formData.shipmentId}
                        onValueChange={(value) => setFormData({ ...formData, shipmentId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select shipment" />
                        </SelectTrigger>
                        <SelectContent>
                          {shipments.map((shipment) => (
                            <SelectItem key={shipment._id} value={shipment._id}>
                              {shipment.shipmentNumber} - {shipment.customerName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="hsCodeId">HS Code</Label>
                      <Select
                        value={formData.hsCodeId}
                        onValueChange={(value) => setFormData({ ...formData, hsCodeId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select HS code" />
                        </SelectTrigger>
                        <SelectContent>
                          {hsCodes.map((hsCode) => (
                            <SelectItem key={hsCode._id} value={hsCode._id}>
                              {hsCode.hsCode} - {hsCode.description}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="status">Status *</Label>
                      <Select
                        value={formData.status}
                        onValueChange={(value) => setFormData({ ...formData, status: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="under-review">Under Review</SelectItem>
                          <SelectItem value="cleared">Cleared</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="submissionDate">Submission Date *</Label>
                      <Input
                        id="submissionDate"
                        type="date"
                        value={formData.submissionDate}
                        onChange={(e) => setFormData({ ...formData, submissionDate: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="customsOffice">Customs Office *</Label>
                      <Input
                        id="customsOffice"
                        value={formData.customsOffice}
                        onChange={(e) => setFormData({ ...formData, customsOffice: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="dutyAmount">Duty Amount *</Label>
                      <Input
                        id="dutyAmount"
                        type="number"
                        step="0.01"
                        value={formData.dutyAmount}
                        onChange={(e) => setFormData({ ...formData, dutyAmount: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-blue-800 hover:bg-blue-700">
                      Create Clearance
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Customs Clearances ({clearances.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="w-full">
                <TableHeader>
                  <TableRow className="border-b dark:border-gray-700">
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">Declaration #</TableHead>
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">Shipment ID</TableHead>
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">Office</TableHead>
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">Status</TableHead>
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">Duty</TableHead>
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">Submitted</TableHead>
                    <TableHead className="text-left p-3 font-medium text-gray-900 dark:text-white">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clearances.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center p-8 text-gray-500 dark:text-gray-400">
                        No customs clearances found. Create your first clearance to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    clearances.map((clearance) => (
                      <TableRow key={clearance._id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <TableCell className="p-3 text-gray-900 dark:text-white font-medium">{clearance.declarationNumber}</TableCell>
                        <TableCell className="p-3 text-gray-600 dark:text-gray-400">{clearance.shipmentId}</TableCell>
                        <TableCell className="p-3 text-gray-600 dark:text-gray-400">{clearance.customsOffice}</TableCell>
                        <TableCell className="p-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(clearance.status)}`}>
                            {clearance.status}
                          </span>
                        </TableCell>
                        <TableCell className="p-3 text-gray-600 dark:text-gray-400">
                          {clearance.currency} {clearance.dutyAmount.toFixed(2)}
                        </TableCell>
                        <TableCell className="p-3 text-gray-600 dark:text-gray-400">
                          {new Date(clearance.submissionDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="p-3">
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-blue-800 hover:text-blue-700 hover:bg-blue-50"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(clearance._id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <ManufacturingVisualization
          isOpen={showVisualization}
          onClose={() => setShowVisualization(false)}
          data={visualizationData}
          title="Clearances by Status"
          chartType="bar"
          xAxisKey="name"
          dataKeys={[{ key: 'value', name: 'Clearances', color: '#ea580c' }]}
        />
      </div>
    </DashboardLayout>
  );
}
