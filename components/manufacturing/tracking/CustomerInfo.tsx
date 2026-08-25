import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Mail } from 'lucide-react';
import type { TrackingData } from './types';

interface CustomerInfoProps {
  customerData: Pick<TrackingData, 'customerName' | 'customerEmail'>;
}

export function CustomerInfo({ customerData }: CustomerInfoProps) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-lg font-semibold">
          Customer Information
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground dark:text-muted-foreground mb-1">
            <User className="h-4 w-4" />
            Customer Name
          </div>
          <div className="font-medium text-foreground dark:text-white">
            {customerData.customerName}
          </div>
        </div>
        {customerData.customerEmail && (
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground dark:text-muted-foreground mb-1">
              <Mail className="h-4 w-4" />
              Email
            </div>
            <div className="font-medium text-foreground dark:text-white">
              {customerData.customerEmail}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
