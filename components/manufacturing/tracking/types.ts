// Tracking Module Type Definitions

import { ShipmentTrackingStatus } from "@/lib/constants/statuses";

export interface ShipmentItem {
  hsCode: string;
  description: string;
  quantity: number;
  weight: number;
  value: number;
}

export interface TrackingData {
  _id: string;
  shipmentNumber: string;
  trackingNumber: string;
  freightProvider: string;
  shipmentType: string;
  origin: string;
  destination: string;
  status: ShipmentTrackingStatus;
  estimatedDelivery: string;
  actualDelivery?: string;
  customerName: string;
  customerEmail: string;
  weight: number;
  volume: number;
  totalValue: number;
  currency: string;
  customsStatus: string;
  items: ShipmentItem[];
  notes?: string;
}

export interface ShipmentOption {
  _id: string;
  shipmentNumber: string;
  customerName: string;
  trackingNumber: string;
}

export type SearchMode = 'search' | 'dropdown';

export interface TrackingSearchProps {
  searchMode: SearchMode;
  setSearchMode: (mode: SearchMode) => void;
  trackingNumber: string;
  setTrackingNumber: (value: string) => void;
  selectedShipmentId: string;
  setSelectedShipmentId: (value: string) => void;
  shipments: ShipmentOption[];
  onSearch: () => void;
  isLoading: boolean;
}

export interface TrackingDetailsProps {
  trackingData: TrackingData;
}
