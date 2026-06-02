'use client';

import { DraggableVisualization } from '@/components/finance/DraggableVisualization';

interface ManufacturingVisualizationProps {
  isOpen: boolean;
  onClose: () => void;
  data: Record<string, string | number>[];
  title: string;
  chartType?: 'bar' | 'line';
  xAxisKey?: string;
  dataKeys?: {
    key: string;
    name: string;
    color: string;
  }[];
}

export function ManufacturingVisualization(props: ManufacturingVisualizationProps) {
  return <DraggableVisualization {...props} />;
}
