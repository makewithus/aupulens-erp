import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Package, Loader2 } from 'lucide-react';
import type { ShipmentOption } from './types';

interface TrackingSearchProps {
  searchMode: 'search' | 'dropdown';
  trackingNumber: string;
  isLoading: boolean;
  allShipments: ShipmentOption[];
  onSearchModeChange: (mode: 'search' | 'dropdown') => void;
  onTrackingNumberChange: (value: string) => void;
  onTrack: (e?: React.FormEvent) => void;
  onSelectShipment: (shipmentId: string) => void;
}

export function TrackingSearch({
  searchMode,
  trackingNumber,
  isLoading,
  allShipments,
  onSearchModeChange,
  onTrackingNumberChange,
  onTrack,
  onSelectShipment
}: TrackingSearchProps) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          variant={searchMode === 'search' ? 'default' : 'outline'}
          onClick={() => onSearchModeChange('search')}
          className={searchMode === 'search' ? 'bg-blue-800 hover:bg-blue-700' : ''}
        >
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>
        <Button
          variant={searchMode === 'dropdown' ? 'default' : 'outline'}
          onClick={() => onSearchModeChange('dropdown')}
          className={searchMode === 'dropdown' ? 'bg-blue-800 hover:bg-blue-700' : ''}
        >
          <Package className="mr-2 h-4 w-4" />
          Select from List
        </Button>
      </div>

      {searchMode === 'search' ? (
        <form onSubmit={onTrack} className="flex gap-2">
          <Input
            placeholder="Enter tracking number or shipment number..."
            value={trackingNumber}
            onChange={(e) => onTrackingNumberChange(e.target.value)}
            className="flex-1 h-11"
          />
          <Button
            type="submit"
            disabled={isLoading}
            className="bg-blue-800 hover:bg-blue-700 text-white h-11"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Track
              </>
            )}
          </Button>
        </form>
      ) : (
        <Select onValueChange={onSelectShipment}>
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Select a shipment to track" />
          </SelectTrigger>
          <SelectContent>
            {allShipments.map((shipment) => (
              <SelectItem key={shipment._id} value={shipment._id}>
                {shipment.trackingNumber || shipment.shipmentNumber} - {shipment.customerName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
