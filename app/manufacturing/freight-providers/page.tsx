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
import { Loader2, Ship, Plus, BarChart3, Edit, Trash2 } from 'lucide-react';
import { ManufacturingVisualization } from '@/components/manufacturing/ManufacturingVisualization';
import { useToast } from '@/components/ui/toast';

interface FreightProvider {
  _id: string;
  providerName: string;
  providerCode: string;
  providerType: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  status: string;
  servicesOffered: string[];
}

export default function FreightProvidersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [providers, setProviders] = useState<FreightProvider[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showVisualization, setShowVisualization] = useState(false);
  const [visualizationData, setVisualizationData] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    providerName: '',
    providerCode: '',
    providerType: 'air' as 'air' | 'sea' | 'road' | 'rail' | 'multimodal',
    contactPerson: '',
    contactEmail: '',
    contactPhone: '',
    status: 'active' as 'active' | 'inactive',
    servicesOffered: [] as string[],
  });

  const fetchProviders = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/manufacturing/freight-providers');
      const data = await res.json();
      setProviders(data.providers || []);
    } catch (err) {
      console.error('Error fetching providers:', err);
      toast({
        title: 'Error',
        description: 'Failed to fetch freight providers',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/manufacturing');
    } else if (status === 'authenticated') {
      if (session?.user?.role !== 'manufacturing') {
        router.push('/auth/manufacturing');
      } else {
        fetchProviders();
      }
    }
  }, [fetchProviders, router, session, status]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/manufacturing/freight-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        toast({
          title: 'Success',
          description: 'Freight provider created successfully',
        });
        setIsCreateOpen(false);
        setFormData({
          providerName: '',
          providerCode: '',
          providerType: 'air',
          contactPerson: '',
          contactEmail: '',
          contactPhone: '',
          status: 'active',
          servicesOffered: [],
        });
        fetchProviders();
      } else {
        throw new Error('Failed to create provider');
      }
    } catch (err) {
      console.error('Error creating provider:', err);
      toast({
        title: 'Error',
        description: 'Failed to create freight provider',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: 'Are you sure you want to delete this freight provider?' })) return;
    
    try {
      const res = await fetch(`/api/manufacturing/freight-providers/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast({
          title: 'Success',
          description: 'Freight provider deleted successfully',
        });
        fetchProviders();
      } else {
        throw new Error('Failed to delete provider');
      }
    } catch (err) {
      console.error('Error deleting provider:', err);
      toast({
        title: 'Error',
        description: 'Failed to delete freight provider',
        variant: 'destructive',
      });
    }
  };

  const loadVisualizationData = async () => {
    const typeCounts = providers.reduce((acc: any, provider: any) => {
      const type = provider.providerType || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const chartData = Object.entries(typeCounts).map(([type, count]) => ({
      name: type,
      value: count,
    }));

    setVisualizationData(chartData);
    setShowVisualization(true);
  };

  const getStatusColor = (status: string) => {
    return status.toLowerCase() === 'active'
      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
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
      pageName="Freight Providers"
      breadcrumbs={[
        { label: 'Manufacturing', href: '/manufacturing/dashboard' },
        { label: 'Freight Providers' },
      ]}
      profilePath="/manufacturing/profile"
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/manufacturing' })}
      onRefresh={fetchProviders}
    >
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Freight Providers</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Manage freight and shipping partners
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
                  Add Provider
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Freight Provider</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="providerName">Provider Name *</Label>
                      <Input
                        id="providerName"
                        value={formData.providerName}
                        onChange={(e) => setFormData({ ...formData, providerName: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="providerCode">Provider Code *</Label>
                      <Input
                        id="providerCode"
                        value={formData.providerCode}
                        onChange={(e) => setFormData({ ...formData, providerCode: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="providerType">Type *</Label>
                      <Select
                        value={formData.providerType}
                        onValueChange={(value: any) => setFormData({ ...formData, providerType: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="air">Air Freight</SelectItem>
                          <SelectItem value="sea">Sea Freight</SelectItem>
                          <SelectItem value="road">Road Freight</SelectItem>
                          <SelectItem value="rail">Rail Freight</SelectItem>
                          <SelectItem value="multimodal">Multimodal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="status">Status *</Label>
                      <Select
                        value={formData.status}
                        onValueChange={(value: any) => setFormData({ ...formData, status: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="contactPerson">Contact Person *</Label>
                      <Input
                        id="contactPerson"
                        value={formData.contactPerson}
                        onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="contactEmail">Contact Email *</Label>
                      <Input
                        id="contactEmail"
                        type="email"
                        value={formData.contactEmail}
                        onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="contactPhone">Contact Phone *</Label>
                      <Input
                        id="contactPhone"
                        value={formData.contactPhone}
                        onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
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
                      Add Provider
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Freight Providers ({providers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b dark:border-gray-700">
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Name</th>
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Code</th>
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Type</th>
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Contact</th>
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Status</th>
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center p-8 text-gray-500 dark:text-gray-400">
                        No freight providers found. Add your first provider to get started.
                      </td>
                    </tr>
                  ) : (
                    providers.map((provider) => (
                      <tr key={provider._id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="p-3 text-gray-900 dark:text-white font-medium">{provider.providerName}</td>
                        <td className="p-3 text-gray-600 dark:text-gray-400">{provider.providerCode}</td>
                        <td className="p-3 text-gray-600 dark:text-gray-400 capitalize">{provider.providerType}</td>
                        <td className="p-3 text-gray-600 dark:text-gray-400">
                          <div>{provider.contactPerson}</div>
                          <div className="text-sm text-gray-500">{provider.contactEmail}</div>
                          <div className="text-sm text-gray-500">{provider.contactPhone}</div>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(provider.status)}`}>
                            {provider.status}
                          </span>
                        </td>
                        <td className="p-3">
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
                              onClick={() => handleDelete(provider._id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <ManufacturingVisualization
          isOpen={showVisualization}
          onClose={() => setShowVisualization(false)}
          data={visualizationData}
          title="Providers by Type"
          chartType="bar"
          xAxisKey="name"
          dataKeys={[{ key: 'value', name: 'Providers', color: '#ea580c' }]}
        />
      </div>
    </DashboardLayout>
  );
}
