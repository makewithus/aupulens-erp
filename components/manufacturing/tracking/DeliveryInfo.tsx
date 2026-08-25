import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from 'lucide-react';
import type { TrackingData } from './types';

interface DeliveryInfoProps {
  deliveryData: Pick<TrackingData, 'estimatedDelivery' | 'actualDelivery'>;
}

export function DeliveryInfo({ deliveryData }: DeliveryInfoProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-lg font-semibold">
          Delivery Information
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground dark:text-muted-foreground mb-1">
            <Calendar className="h-4 w-4" />
            Estimated Delivery
          </div>
          <div className="font-medium text-foreground dark:text-white">
            {deliveryData.estimatedDelivery 
              ? formatDate(deliveryData.estimatedDelivery)
              : 'Not specified'}
          </div>
        </div>
        {deliveryData.actualDelivery && (
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground dark:text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              Actual Delivery
            </div>
            <div className="font-medium text-blue-600 dark:text-blue-400">
              {formatDate(deliveryData.actualDelivery)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
