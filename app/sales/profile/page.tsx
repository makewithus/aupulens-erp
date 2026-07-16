'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { FullPageLoadingSkeleton } from '@/components/ui/loading-skeletons';

export default function SalesProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/sales');
    } else if (status === 'authenticated') {
      if (session?.user?.role !== 'sales' && session?.user?.role !== 'admin') {
        router.push('/auth/sales');
      } else {
        router.push('/admin/profile');
      }
    }
  }, [status, router, session]);

  return <FullPageLoadingSkeleton />;
}
