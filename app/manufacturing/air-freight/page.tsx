'use client';
import { confirmDialog } from "@/components/providers/ConfirmRoot";


import { useCallback, useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { manufacturingSidebarConfig } from '@/config/sidebar/manufacturing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plane, Plus, BarChart3, Clock, MapPin, Pencil, Trash2 } from 'lucide-react';
import { StatCard } from '@/components/manufacturing/StatCard';
import { ManufacturingVisualization } from '@/components/manufacturing/ManufacturingVisualization';
import { useToast } from '@/components/ui/use-toast';

interface AirFreight {
  _id: string;
  flightNumber: string;
  airline: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  status: string;
  cargo: number;
}

export default function AirFreightPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showVisualization, setShowVisualization] = useState(false);
  const [airFreights, setAirFreights] = useState<AirFreight[]>([]);
  const [freightProviders, setFreightProviders] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [visualizationData, setVisualizationData] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFreight, setEditingFreight] = useState<AirFreight | null>(null);
  const [formData, setFormData] = useState({
    flightNumber: '',
    airline: '',
    freightProviderId: '',
    shipmentId: '',
    origin: '',
    destination: '',
    departureTime: '',
    arrivalTime: '',
    status: 'scheduled',
    cargo: '' as string | number,
    aircraftType: '',
    notes: '',
  });

  const fetchAirFreights = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/manufacturing/air-freight');
      if (!response.ok) throw new Error('Failed to fetch air freights');
      const data = await response.json();
      setAirFreights(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load air freights',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

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

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/manufacturing');
    } else if (status === 'authenticated' && session?.user?.role !== 'manufacturing') {
      router.push('/auth/manufacturing');
    } else if (status === 'authenticated') {
      fetchAirFreights();
      fetchFreightProviders();
      fetchShipments();
    }
  }, [fetchAirFreights, fetchFreightProviders, fetchShipments, router, session, status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      const url = '/api/manufacturing/air-freight';
      const method = editingFreight ? 'PUT' : 'POST';
      
      // Convert cargo to number and prepare the body
      const bodyData = {
        ...formData,
        cargo: Number(formData.cargo),
      };
      
      const body = editingFreight
        ? { ...bodyData, _id: editingFreight._id }
        : bodyData;

      console.log('Submitting air freight:', body);

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('API Error:', error);
        throw new Error(error.details || error.error || 'Failed to save air freight');
      }

      const result = await response.json();
      console.log('Air freight saved:', result);

      toast({
        title: 'Success',
        description: `Air freight ${editingFreight ? 'updated' : 'created'} successfully`,
      });

      setIsDialogOpen(false);
      setEditingFreight(null);
      setFormData({
        flightNumber: '',
        airline: '',
        freightProviderId: '',
        shipmentId: '',
        origin: '',
        destination: '',
        departureTime: '',
        arrivalTime: '',
        status: 'scheduled',
        cargo: '',
        aircraftType: '',
        notes: '',
      });
      fetchAirFreights();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (freight: AirFreight) => {
    setEditingFreight(freight);
    setFormData({
      flightNumber: freight.flightNumber,
      airline: freight.airline,
      freightProviderId: '',
      shipmentId: '',
      origin: freight.origin,
      destination: freight.destination,
      departureTime: new Date(freight.departureTime).toISOString().slice(0, 16),
      arrivalTime: new Date(freight.arrivalTime).toISOString().slice(0, 16),
      status: freight.status,
      cargo: freight.cargo,
      aircraftType: '',
      notes: '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: 'Are you sure you want to delete this air freight?' })) return;

    try {
      setIsLoading(true);
      const response = await fetch(`/api/manufacturing/air-freight?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete air freight');

      toast({
        title: 'Success',
        description: 'Air freight deleted successfully',
      });

      fetchAirFreights();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete air freight',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadVisualizationData = () => {
    const statusCounts = airFreights.reduce((acc: any, freight: any) => {
      const status = freight.status || 'unknown';
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
      case 'delivered':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'in-transit':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'scheduled':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'delayed':
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
      pageName="Air Freight"
      breadcrumbs={[
        { label: 'Manufacturing', href: '/manufacturing/dashboard' },
        { label: 'Air Freight' },
      ]}
      profilePath="/manufacturing/profile"
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/manufacturing' })}
    >
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Air Freight</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Manage air cargo and flight schedules
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
            <Button 
              className="bg-blue-800 hover:bg-blue-700 text-white"
              onClick={async () => {
                setEditingFreight(null);
                setFormData({
                  flightNumber: '',
                  airline: '',
                  freightProviderId: '',
                  shipmentId: '',
                  origin: '',
                  destination: '',
                  departureTime: '',
                  arrivalTime: '',
                  status: 'scheduled',
                  cargo: '',
                  aircraftType: '',
                  notes: '',
                });
                setIsDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Schedule Flight
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Active Flights"
            value={airFreights.length}
            icon={Plane}
            description="Currently scheduled"
            colorClass="text-blue-800 dark:text-blue-400"
          />
          <StatCard
            title="In Transit"
            value={airFreights.filter(f => f.status === 'in-transit').length}
            icon={Clock}
            description="En route"
            colorClass="text-blue-800 dark:text-blue-400"
          />
          <StatCard
            title="Total Cargo"
            value={`${airFreights.reduce((sum, f) => sum + f.cargo, 0)} kg`}
            icon={MapPin}
            description="Current shipments"
            colorClass="text-blue-600 dark:text-blue-400"
          />
          <StatCard
            title="Avg Transit Time"
            value="8.5 hrs"
            icon={Clock}
            description="Last 30 days"
            colorClass="text-purple-600 dark:text-purple-400"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Scheduled Flights ({airFreights.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b dark:border-gray-700">
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Flight #</th>
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Airline</th>
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Route</th>
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Departure</th>
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Arrival</th>
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Cargo</th>
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Status</th>
                    <th className="text-left p-3 font-medium text-gray-900 dark:text-white">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {airFreights.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center p-8 text-gray-500 dark:text-gray-400">
                        No flights scheduled.
                      </td>
                    </tr>
                  ) : (
                    airFreights.map((freight) => (
                      <tr key={freight._id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="p-3 text-gray-900 dark:text-white font-medium">{freight.flightNumber}</td>
                        <td className="p-3 text-gray-600 dark:text-gray-400">{freight.airline}</td>
                        <td className="p-3 text-gray-600 dark:text-gray-400">
                          {freight.origin} → {freight.destination}
                        </td>
                        <td className="p-3 text-gray-600 dark:text-gray-400">
                          {new Date(freight.departureTime).toLocaleString()}
                        </td>
                        <td className="p-3 text-gray-600 dark:text-gray-400">
                          {new Date(freight.arrivalTime).toLocaleString()}
                        </td>
                        <td className="p-3 text-gray-600 dark:text-gray-400">{freight.cargo} kg</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(freight.status)}`}>
                            {freight.status}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(freight)}
                              className="h-8 w-8 p-0"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete(freight._id)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
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
          title="Flights by Status"
          chartType="bar"
          xAxisKey="name"
          dataKeys={[{ key: 'value', name: 'Flights', color: '#ea580c' }]}
        />

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="border-b pb-4">
              <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                <Plane className="h-5 w-5 text-blue-800" />
                {editingFreight ? 'Edit Air Freight' : 'Schedule New Flight'}
              </DialogTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Enter flight details and cargo information
              </p>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
              <div className="space-y-6 py-4">
                {/* Flight Information */}
                <div className="space-y-4">
                  <h3 className="text-base font-medium text-gray-900 dark:text-white border-b pb-2">
                    Flight Information
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="flightNumber" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Flight Number <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="flightNumber"
                        value={formData.flightNumber}
                        onChange={(e) => setFormData({ ...formData, flightNumber: e.target.value })}
                        placeholder="AA1234"
                        className="h-10"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="airline" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Airline <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="airline"
                        value={formData.airline}
                        onChange={(e) => setFormData({ ...formData, airline: e.target.value })}
                        placeholder="American Airlines"
                        className="h-10"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="aircraftType" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Aircraft Type
                      </Label>
                      <Input
                        id="aircraftType"
                        value={formData.aircraftType}
                        onChange={(e) => setFormData({ ...formData, aircraftType: e.target.value })}
                        placeholder="Boeing 777"
                        className="h-10"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="status" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Status <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={formData.status}
                        onValueChange={(value) => setFormData({ ...formData, status: value })}
                      >
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="in-transit">In Transit</SelectItem>
                          <SelectItem value="landed">Landed</SelectItem>
                          <SelectItem value="delayed">Delayed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Route Information */}
                <div className="space-y-4">
                  <h3 className="text-base font-medium text-gray-900 dark:text-white border-b pb-2">
                    Route & Schedule
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="origin" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Origin <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="origin"
                        value={formData.origin}
                        onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                        placeholder="LAX"
                        className="h-10"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="destination" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Destination <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="destination"
                        value={formData.destination}
                        onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                        placeholder="JFK"
                        className="h-10"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="departureTime" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Departure Time <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="departureTime"
                        type="datetime-local"
                        value={formData.departureTime}
                        onChange={(e) => setFormData({ ...formData, departureTime: e.target.value })}
                        className="h-10"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="arrivalTime" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Arrival Time <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="arrivalTime"
                        type="datetime-local"
                        value={formData.arrivalTime}
                        onChange={(e) => setFormData({ ...formData, arrivalTime: e.target.value })}
                        className="h-10"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Cargo & Relations */}
                <div className="space-y-4">
                  <h3 className="text-base font-medium text-gray-900 dark:text-white border-b pb-2">
                    Cargo & Relations
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cargo" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Cargo Weight (kg) <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="cargo"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.cargo}
                        onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                        placeholder="5000"
                        className="h-10"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="freightProviderId" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Freight Provider
                      </Label>
                      <Select
                        value={formData.freightProviderId}
                        onValueChange={(value) => setFormData({ ...formData, freightProviderId: value })}
                      >
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select freight provider" />
                        </SelectTrigger>
                        <SelectContent>
                          {freightProviders.map((provider) => (
                            <SelectItem key={provider._id} value={provider._id}>
                              {provider.providerName} ({provider.providerCode})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="shipmentId" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Related Shipment
                      </Label>
                      <Select
                        value={formData.shipmentId}
                        onValueChange={(value) => setFormData({ ...formData, shipmentId: value })}
                      >
                        <SelectTrigger className="h-10">
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
                  </div>
                </div>

                {/* Additional Notes */}
                <div className="space-y-4">
                  <h3 className="text-base font-medium text-gray-900 dark:text-white border-b pb-2">
                    Additional Information
                  </h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="notes" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Notes
                    </Label>
                    <textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => 
                        setFormData({ ...formData, notes: e.target.value })
                      }
                      rows={4}
                      placeholder="Enter any additional notes or special instructions..."
                      className="w-full rounded-none border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-800 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
              
              <DialogFooter className="border-t pt-4 flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  className="min-w-24"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="min-w-24 bg-blue-800 hover:bg-blue-700 text-white"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    editingFreight ? 'Update' : 'Create'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
