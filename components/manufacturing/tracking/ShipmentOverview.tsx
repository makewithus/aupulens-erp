import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, FileText, Truck, Globe, MapPin } from 'lucide-react';
import { InfoField } from './InfoField';
import type { TrackingData } from './types';

interface ShipmentOverviewProps {
  shipmentData: Pick<TrackingData, 'shipmentNumber' | 'trackingNumber' | 'freightProvider' | 'shipmentType' | 'origin' | 'destination' | 'status'>;
  getStatusColor: (status: string) => string;
}

export function ShipmentOverview({ shipmentData, getStatusColor }: ShipmentOverviewProps) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold">
            Shipment Overview
          </CardTitle>
          <Badge className={getStatusColor(shipmentData.status)}>
            {shipmentData.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <InfoField
            icon={FileText}
            label="Shipment Number"
            value={shipmentData.shipmentNumber}
          />
          
          <InfoField
            icon={FileText}
            label="Tracking Number"
            value={shipmentData.trackingNumber || 'N/A'}
          />

          <InfoField
            icon={Truck}
            label="Freight Provider"
            value={shipmentData.freightProvider || 'N/A'}
          />

          <InfoField
            icon={Package}
            label="Shipment Type"
            value={shipmentData.shipmentType?.toUpperCase()}
          />

          <InfoField
            icon={Globe}
            label="Origin"
            value={shipmentData.origin}
          />

          <InfoField
            icon={MapPin}
            label="Destination"
            value={shipmentData.destination}
          />
        </div>
      </CardContent>
    </Card>
  );
}
