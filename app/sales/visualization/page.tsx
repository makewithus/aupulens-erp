'use client';

import { useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { salesSidebarConfig } from '@/config/sidebar/sales';
import { SalesVisualization } from '@/components/sales/SalesVisualization';

export default function SalesVisualizationPage() {
  const { status, data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/sales');
  }, [status, router]);

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Visualization"
      breadcrumbs={[{ label: 'Sales', href: '/sales/summary' }, { label: 'Visualization' }]}
      profilePath="/sales/profile"
      userName={session?.user?.name || ''}
      userEmail={session?.user?.email || ''}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: '/auth/sales' })}
    >
      <SalesVisualization
        title="Sales KPIs"
        availableDataTypes={[
          { value: 'orders_trend', label: 'Orders Trend' },
          { value: 'revenue_trend', label: 'Revenue Trend' },
          { value: 'quotation_to_order', label: 'Quotation → Order Conversion' },
          { value: 'status_breakdown', label: 'Order Status Breakdown' },
        ]}
        defaultDataType="orders_trend"
      />
    </DashboardLayout>
  );
}


