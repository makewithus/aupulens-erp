'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { manufacturingSidebarConfig } from '@/config/sidebar/manufacturing';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { TrackingSearch } from '@/components/manufacturing/tracking/TrackingSearch';
import { ShipmentOverview } from '@/components/manufacturing/tracking/ShipmentOverview';
import { CustomerInfo } from '@/components/manufacturing/tracking/CustomerInfo';
import { DeliveryInfo } from '@/components/manufacturing/tracking/DeliveryInfo';
import { ShipmentDetails } from '@/components/manufacturing/tracking/ShipmentDetails';
import type { TrackingData, ShipmentOption, SearchMode } from '@/components/manufacturing/tracking/types';

export default function TrackingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [allShipments, setAllShipments] = useState<ShipmentOption[]>([]);
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>('search');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/manufacturing');
    } else if (status === 'authenticated' && session?.user?.role !== 'manufacturing') {
      router.push('/auth/manufacturing');
    } else if (status === 'authenticated') {
      fetchAllShipments();
    }
  }, [status, router, session]);

  const fetchAllShipments = async () => {
    try {
      const res = await fetch('/api/manufacturing/shipments');
      const data = await res.json();
      setAllShipments(data.shipments || []);
    } catch (err) {
      console.error('Error fetching shipments:', err);
    }
  };

  const handleTrack = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!trackingNumber.trim()) return;

    try {
      setIsLoading(true);
      const res = await fetch(`/api/manufacturing/shipments?trackingNumber=${trackingNumber}`);
      const data = await res.json();
      
      if (data.shipments && data.shipments.length > 0) {
        setTrackingData(data.shipments[0]);
        toast({
          title: 'Success',
          description: 'Shipment found successfully',
        });
      } else {
        toast({
          title: 'Not Found',
          description: 'No shipment found with this tracking number',
          variant: 'destructive',
        });
        setTrackingData(null);
      }
    } catch (err) {
      console.error('Error tracking shipment:', err);
      toast({
        title: 'Error',
        description: 'Failed to track shipment',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectShipment = async (shipmentId: string) => {
    const shipment = allShipments.find(s => s._id === shipmentId);
    if (shipment) {
      setIsLoading(true);
      try {
        // Fetch the full shipment data
        const res = await fetch(`/api/manufacturing/shipments?id=${shipmentId}`);
        if (!res.ok) throw new Error('Failed to fetch shipment details');
        
        const fullShipmentData = await res.json();
        setTrackingData(fullShipmentData);
        setTrackingNumber(shipment.trackingNumber || shipment.shipmentNumber);
        
        toast({
          title: 'Success',
          description: 'Shipment details loaded',
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load shipment details',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'delivered':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'in-transit':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'customs':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'cancelled':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  if (status === 'loading') {
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
      pageName="Tracking"
      breadcrumbs={[
        { label: 'Manufacturing', href: '/manufacturing/dashboard' },
        { label: 'Tracking' },
      ]}
      profilePath="/manufacturing/profile"
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/manufacturing' })}
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Shipment Tracking</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Track your shipments in real-time with detailed information
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <TrackingSearch
              searchMode={searchMode}
              trackingNumber={trackingNumber}
              isLoading={isLoading}
              allShipments={allShipments}
              onSearchModeChange={setSearchMode}
              onTrackingNumberChange={setTrackingNumber}
              onTrack={handleTrack}
              onSelectShipment={handleSelectShipment}
            />
          </CardContent>
        </Card>

        {trackingData && (
          <div className="space-y-6">
            <ShipmentOverview
              shipmentData={trackingData}
              getStatusColor={getStatusColor}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CustomerInfo customerData={trackingData} />
              <DeliveryInfo deliveryData={trackingData} />
            </div>

            <ShipmentDetails
              shipmentData={trackingData}
              getStatusColor={getStatusColor}
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
