'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAiPrefill } from '@/lib/hooks/useAiPrefill';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { manufacturingSidebarConfig } from '@/config/sidebar/manufacturing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Truck, X } from 'lucide-react';

interface Shipment {
  _id: string;
  shipmentNumber: string;
  customerName: string;
  customerEmail?: string;
  origin: string;
  destination: string;
  freightProvider: string;
  trackingNumber?: string;
  shipmentType: 'air' | 'sea' | 'road' | 'rail';
  weight: number;
  volume: number;
  items: Array<{
    description: string;
    hsCode?: string;
    quantity: number;
    weight: number;
    value: number;
  }>;
  totalValue: number;
  currency: string;
  status: 'pending' | 'in-transit' | 'customs' | 'delivered' | 'cancelled';
  estimatedDelivery?: string;
  notes?: string;
  createdAt: string;
}

export default function ShipmentsPage() {
  const { status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<Shipment[]>([]);
  const [freightProviders, setFreightProviders] = useState<any[]>([]);
  const [hsCodes, setHsCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [newShipment, setNewShipment] = useState<{
    shipmentNumber: string;
    customerName: string;
    customerEmail: string;
    origin: string;
    destination: string;
    freightProvider: string;
    trackingNumber: string;
    shipmentType: 'air' | 'sea' | 'road' | 'rail';
    weight: number;
    volume: number;
    items: Array<{
      description: string;
      hsCode: string;
      quantity: number;
      weight: number;
      value: number;
    }>;
    totalValue: number;
    currency: string;
    status: 'pending' | 'in-transit' | 'customs' | 'delivered' | 'cancelled';
    estimatedDelivery: string;
    notes: string;
  }>({
    shipmentNumber: '',
    customerName: '',
    customerEmail: '',
    origin: '',
    destination: '',
    freightProvider: '',
    trackingNumber: '',
    shipmentType: 'air',
    weight: 0,
    volume: 0,
    items: [{ description: '', hsCode: '', quantity: 1, weight: 0, value: 0 }],
    totalValue: 0,
    currency: 'USD',
    status: 'pending',
    estimatedDelivery: '',
    notes: '',
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/manufacturing/shipments');
      const json = await res.json();
      setData(json.shipments || []);
    } catch (error) {
      console.error('Error loading shipments:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFreightProviders = useCallback(async () => {
    try {
      const response = await fetch('/api/manufacturing/freight-providers');
      if (response.ok) {
        const data = await response.json();
        setFreightProviders(data.providers || []);
      }
    } catch (error) {
      console.error('Failed to fetch freight providers:', error);
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
    
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      load();
      fetchFreightProviders();
      fetchHsCodes();
    }
  }, [status, load, fetchFreightProviders, fetchHsCodes]);

  // AI-native: extract shipment details → open the create dialog pre-filled. The
  // user reviews (and picks the freight provider) and clicks Create.
  useAiPrefill('shipment', (p) => {
    const d = p.data || {};
    const items = Array.isArray(d.items) && d.items.length
      ? d.items.map((it: any) => ({
          description: it.description || '',
          hsCode: it.hsCode || '',
          quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
          weight: Number(it.weight) || 0,
          value: Number(it.value) || 0,
        }))
      : [{ description: '', hsCode: '', quantity: 1, weight: 0, value: 0 }];
    const totalValue = items.reduce((acc: number, it: any) => acc + (it.value || 0) * (it.quantity || 1), 0);
    setNewShipment((prev) => ({
      ...prev,
      customerName: d.customerName || '',
      customerEmail: d.customerEmail || '',
      origin: d.origin || '',
      destination: d.destination || '',
      trackingNumber: d.trackingNumber || '',
      shipmentType: ['air', 'sea', 'road', 'rail'].includes(d.shipmentType) ? d.shipmentType : 'air',
      weight: Number(d.weight) || 0,
      volume: Number(d.volume) || 0,
      items,
      totalValue,
      currency: d.currency || 'INR',
      estimatedDelivery: d.estimatedDelivery || '',
      notes: d.notes || '',
    }));
    setIsAddDialogOpen(true);
  });

  const filtered = data.filter((shipment) => {
    const matchesQuery = [shipment.shipmentNumber, shipment.customerName, shipment.origin, shipment.destination].some(
      (v) => v.toLowerCase().includes(query.toLowerCase())
    );
    const matchesStatus = statusFilter === 'all' || shipment.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const handleAddItem = () => {
    setNewShipment({
      ...newShipment,
      items: [...newShipment.items, { description: '', hsCode: '', quantity: 1, weight: 0, value: 0 }],
    });
  };

  const handleRemoveItem = (index: number) => {
    if (newShipment.items.length > 1) {
      const updatedItems = newShipment.items.filter((_, i) => i !== index);
      const totalValue = updatedItems.reduce((sum, item) => sum + item.value * item.quantity, 0);
      const totalWeight = updatedItems.reduce((sum, item) => sum + item.weight * item.quantity, 0);
      setNewShipment({
        ...newShipment,
        items: updatedItems,
        totalValue,
        weight: totalWeight,
      });
    }
  };

  const handleItemChange = (index: number, field: string, value: string | number) => {
    const updatedItems = [...newShipment.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    const totalValue = updatedItems.reduce((sum, item) => sum + (item.value * item.quantity), 0);
    const totalWeight = updatedItems.reduce((sum, item) => sum + (item.weight * item.quantity), 0);
    
    setNewShipment({ 
      ...newShipment, 
      items: updatedItems,
      totalValue,
      weight: totalWeight,
    });
  };

  const handleCreateShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/manufacturing/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newShipment),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create shipment');
      }

      toast({ 
        title: 'Success', 
        description: 'Shipment created successfully',
        variant: 'default'
      });
      
      setIsAddDialogOpen(false);
      setNewShipment({
        shipmentNumber: '',
        customerName: '',
        customerEmail: '',
        origin: '',
        destination: '',
        freightProvider: '',
        trackingNumber: '',
        shipmentType: 'air',
        weight: 0,
        volume: 0,
        items: [{ description: '', hsCode: '', quantity: 1, weight: 0, value: 0 }],
        totalValue: 0,
        currency: 'USD',
        status: 'pending',
        estimatedDelivery: '',
        notes: '',
      });
      load();
    } catch (err) {
      console.error('Error creating shipment:', err);
      toast({ 
        title: 'Error', 
        description: err instanceof Error ? err.message : 'Failed to create shipment',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, string> = {
      'pending': 'bg-accent text-foreground dark:bg-card dark:text-foreground',
      'in-transit': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'customs': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'delivered': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'cancelled': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };
    return <Badge className={config[status] || config.pending}>{status}</Badge>;
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <DashboardLayout
      sidebarSections={manufacturingSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Manufacturing"
      pageName="Shipments"
      breadcrumbs={[{ label: 'Manufacturing', href: '/manufacturing/dashboard' }, { label: 'Shipments' }]}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Shipments</h1>
            <p className="text-sm text-muted-foreground">Manage and track all shipments</p>
          </div>
          <div className="flex items-center gap-2">
            <Input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} className="w-48" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in-transit">In Transit</SelectItem>
                <SelectItem value="customs">Customs</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={load}>Refresh</Button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Shipment
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Shipment</DialogTitle>
                  <DialogDescription>Fill in the details to create a new shipment</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateShipment} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="shipmentNumber">Shipment Number *</Label>
                      <Input
                        id="shipmentNumber"
                        value={newShipment.shipmentNumber}
                        onChange={(e) => setNewShipment({ ...newShipment, shipmentNumber: e.target.value })}
                        placeholder="SH-2024-001"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customerName">Customer Name *</Label>
                      <Input
                        id="customerName"
                        value={newShipment.customerName}
                        onChange={(e) => setNewShipment({ ...newShipment, customerName: e.target.value })}
                        placeholder="ABC Company"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customerEmail">Customer Email</Label>
                      <Input
                        id="customerEmail"
                        type="email"
                        value={newShipment.customerEmail}
                        onChange={(e) => setNewShipment({ ...newShipment, customerEmail: e.target.value })}
                        placeholder="customer@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="freightProvider">Freight Provider *</Label>
                      <Select
                        value={newShipment.freightProvider}
                        onValueChange={(value) => setNewShipment({ ...newShipment, freightProvider: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select freight provider" />
                        </SelectTrigger>
                        <SelectContent>
                          {freightProviders.map((provider) => (
                            <SelectItem key={provider._id} value={provider.providerName}>
                              {provider.providerName} ({provider.providerCode})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="origin">Origin *</Label>
                      <Input
                        id="origin"
                        value={newShipment.origin}
                        onChange={(e) => setNewShipment({ ...newShipment, origin: e.target.value })}
                        placeholder="Mumbai, India"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="destination">Destination *</Label>
                      <Input
                        id="destination"
                        value={newShipment.destination}
                        onChange={(e) => setNewShipment({ ...newShipment, destination: e.target.value })}
                        placeholder="New York, USA"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="shipmentType">Shipment Type *</Label>
                      <Select
                        value={newShipment.shipmentType}
                        onValueChange={(value) => 
                          setNewShipment({ ...newShipment, shipmentType: value as 'air' | 'sea' | 'road' | 'rail' })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="air">Air</SelectItem>
                          <SelectItem value="sea">Sea</SelectItem>
                          <SelectItem value="road">Road</SelectItem>
                          <SelectItem value="rail">Rail</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="volume">Volume (CBM)</Label>
                      <Input
                        id="volume"
                        type="number"
                        step="0.01"
                        value={newShipment.volume}
                        onChange={(e) => setNewShipment({ ...newShipment, volume: parseFloat(e.target.value) || 0 })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="currency">Currency</Label>
                      <Input
                        id="currency"
                        value={newShipment.currency}
                        onChange={(e) => setNewShipment({ ...newShipment, currency: e.target.value })}
                        placeholder="USD"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="trackingNumber">Tracking Number</Label>
                      <Input
                        id="trackingNumber"
                        value={newShipment.trackingNumber}
                        onChange={(e) => setNewShipment({ ...newShipment, trackingNumber: e.target.value })}
                        placeholder="1234567890"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="estimatedDelivery">Estimated Delivery</Label>
                      <Input
                        id="estimatedDelivery"
                        type="date"
                        value={newShipment.estimatedDelivery}
                        onChange={(e) => setNewShipment({ ...newShipment, estimatedDelivery: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <Label>Items *</Label>
                      <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add Item
                      </Button>
                    </div>
                    {newShipment.items.map((item, index) => (
                      <div key={index} className="border rounded-none p-3 space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="grid grid-cols-5 gap-2 flex-1">
                            <div className="col-span-5 space-y-1">
                              <Label className="text-xs">Description</Label>
                              <Input
                                value={item.description}
                                onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                                placeholder="Item description"
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">HS Code</Label>
                              <Select
                                value={item.hsCode}
                                onValueChange={(value) => handleItemChange(index, 'hsCode', value)}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Select HS code" />
                                </SelectTrigger>
                                <SelectContent>
                                  {hsCodes.map((hsCode) => (
                                    <SelectItem key={hsCode._id} value={hsCode.hsCode}>
                                      {hsCode.hsCode} - {hsCode.description}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Quantity</Label>
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Weight (kg)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={item.weight}
                                onChange={(e) => handleItemChange(index, 'weight', parseFloat(e.target.value) || 0)}
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Unit Value</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={item.value}
                                onChange={(e) => handleItemChange(index, 'value', parseFloat(e.target.value) || 0)}
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Total Value</Label>
                              <Input 
                                value={(item.value * item.quantity).toFixed(2)} 
                                readOnly 
                                className="bg-muted" 
                              />
                            </div>
                          </div>
                          {newShipment.items.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveItem(index)}
                              className="ml-2"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 border-t pt-4">
                    <div className="flex justify-between text-sm">
                      <span>Total Weight:</span>
                      <span className="font-medium">{newShipment.weight.toFixed(2)} kg</span>
                    </div>
                    <div className="flex justify-between text-base font-bold border-t pt-2">
                      <span>Total Value:</span>
                      <span>{newShipment.currency} {newShipment.totalValue.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={newShipment.status}
                      onValueChange={(value) => 
                        setNewShipment({ ...newShipment, status: value as 'pending' | 'in-transit' | 'customs' | 'delivered' | 'cancelled' })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in-transit">In Transit</SelectItem>
                        <SelectItem value="customs">Customs</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Input
                      id="notes"
                      value={newShipment.notes}
                      onChange={(e) => setNewShipment({ ...newShipment, notes: e.target.value })}
                      placeholder="Additional notes"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        'Create Shipment'
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Shipments</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No shipments found.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-full text-sm">
                  <TableHeader>
                    <TableRow className="text-left border-b bg-muted/50">
                      <TableHead className="py-2 pr-4">Shipment #</TableHead>
                      <TableHead className="py-2 pr-4">Customer</TableHead>
                      <TableHead className="py-2 pr-4">Route</TableHead>
                      <TableHead className="py-2 pr-4">Type</TableHead>
                      <TableHead className="py-2 pr-4">Status</TableHead>
                      <TableHead className="py-2 pr-4">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((shipment) => (
                      <TableRow key={shipment._id} className="border-b hover:bg-muted/30 transition-colors">
                        <TableCell className="py-2 pr-4 font-medium">
                          <Truck className="inline h-3 w-3 mr-1" />
                          {shipment.shipmentNumber}
                        </TableCell>
                        <TableCell className="py-2 pr-4">{shipment.customerName}</TableCell>
                        <TableCell className="py-2 pr-4 text-muted-foreground text-xs">
                          {shipment.origin} → {shipment.destination}
                        </TableCell>
                        <TableCell className="py-2 pr-4 capitalize">{shipment.shipmentType}</TableCell>
                        <TableCell className="py-2 pr-4">{getStatusBadge(shipment.status)}</TableCell>
                        <TableCell className="py-2 pr-4 text-muted-foreground">{formatDate(shipment.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
