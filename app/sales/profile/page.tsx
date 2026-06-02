'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { salesSidebarConfig } from '@/config/sidebar/sales';

export default function SalesProfilePage() {
  const { status, data } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/sales');
  }, [status, router]);

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Profile"
      breadcrumbs={[{ label: 'Sales', href: '/sales/summary' }, { label: 'Profile' }]}
    >
      <div className="space-y-2">
        <div className="text-2xl font-semibold">{data?.user?.name}</div>
        <div className="text-sm text-muted-foreground">{data?.user?.email}</div>
      </div>
    </DashboardLayout>
  );
}


