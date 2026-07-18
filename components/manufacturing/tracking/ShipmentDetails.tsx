import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Weight, Package, DollarSign, FileText } from 'lucide-react';
import { InfoField } from './InfoField';
import type { TrackingData } from './types';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

interface ShipmentDetailsProps {
  shipmentData: {
    weight: number;
    volume: number;
    totalValue?: number;
    currency: string;
    customsStatus?: string;
    items?: TrackingData['items'];
    notes?: string;
  };
  getStatusColor: (status: string) => string;
}

export function ShipmentDetails({ shipmentData, getStatusColor }: ShipmentDetailsProps) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-lg font-semibold">
          Shipment Details
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <InfoField
            icon={Weight}
            label="Weight"
            value={`${shipmentData.weight} kg`}
          />
          
          <InfoField
            icon={Package}
            label="Volume"
            value={`${shipmentData.volume} m³`}
          />

          <InfoField
            icon={DollarSign}
            label="Total Value"
            value={`${shipmentData.currency} ${shipmentData.totalValue?.toLocaleString() || 0}`}
          />

          {shipmentData.customsStatus && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <FileText className="h-4 w-4" />
                Customs Status
              </div>
              <Badge className={getStatusColor(shipmentData.customsStatus)}>
                {shipmentData.customsStatus}
              </Badge>
            </div>
          )}
        </div>

        {shipmentData.items && shipmentData.items.length > 0 && (
          <div className="mb-6">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
              Items ({shipmentData.items.length})
            </h4>
            <div className="overflow-x-auto border rounded-none">
              <Table className="w-full">
                <TableHeader className="bg-gray-50 dark:bg-gray-800">
                  <TableRow className="border-b dark:border-gray-700">
                    <TableHead className="text-left p-3 text-sm font-medium text-gray-900 dark:text-white">Description</TableHead>
                    <TableHead className="text-left p-3 text-sm font-medium text-gray-900 dark:text-white">HS Code</TableHead>
                    <TableHead className="text-right p-3 text-sm font-medium text-gray-900 dark:text-white">Quantity</TableHead>
                    <TableHead className="text-right p-3 text-sm font-medium text-gray-900 dark:text-white">Weight (kg)</TableHead>
                    <TableHead className="text-right p-3 text-sm font-medium text-gray-900 dark:text-white">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipmentData.items.map((item, index) => (
                    <TableRow key={index} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <TableCell className="p-3 text-sm text-gray-900 dark:text-white">{item.description}</TableCell>
                      <TableCell className="p-3 text-sm text-gray-600 dark:text-gray-400">{item.hsCode || 'N/A'}</TableCell>
                      <TableCell className="p-3 text-sm text-gray-900 dark:text-white text-right">{item.quantity}</TableCell>
                      <TableCell className="p-3 text-sm text-gray-900 dark:text-white text-right">{item.weight}</TableCell>
                      <TableCell className="p-3 text-sm text-gray-900 dark:text-white text-right">
                        {shipmentData.currency} {item.value?.toLocaleString() || 0}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {shipmentData.notes && (
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-none border">
            <div className="text-sm font-medium text-gray-900 dark:text-white mb-2">Notes</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">{shipmentData.notes}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
