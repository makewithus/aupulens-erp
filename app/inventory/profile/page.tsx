'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function InventoryProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      if (session?.user?.role !== 'inventory' && session?.user?.role !== 'admin') {
        router.push('/auth/inventory');
      } else {
        router.push('/admin/profile');
      }
    }
  }, [status, router, session]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
