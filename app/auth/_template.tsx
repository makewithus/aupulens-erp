'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { SignInForm } from '@/components/auth/SignInForm';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Loader2 } from 'lucide-react';

function AuthContent() {
  const router = useRouter();

  const switchToFinance = () => {
    router.push('/auth/finance');
  };

  const switchToInventory = () => {
    router.push('/auth/inventory');
  };

  const switchToSales = () => {
    router.push('/auth/sales');
  };

  const switchToManufacturing = () => {
    router.push('/auth/manufacturing');
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-white dark:bg-gray-950">
      {/* Interactive Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[48px_48px] mask-[radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]">
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex">
        {/* Left Side - Branding */}
        <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-16">
          <div>
            <h1 className="text-6xl font-bold text-blue-800 dark:text-blue-800 mb-2">
              Aupulens
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium tracking-wide">
              ENTERPRISE RESOURCE PLANNING
            </p>
          </div>

          <div className="space-y-6">
            {/* Portal Switcher */}
            <div className="space-y-4">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-gray-800"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white dark:bg-gray-950 text-gray-500 dark:text-gray-400 font-medium">
                    Access Other Portals
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={switchToFinance}
                  className="px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-none text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-900 dark:hover:border-gray-100 transition-colors duration-200"
                >
                  Finance
                </button>

                <button
                  onClick={switchToInventory}
                  className="px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-none text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-900 dark:hover:border-gray-100 transition-colors duration-200"
                >
                  Inventory
                </button>

                <button
                  onClick={switchToSales}
                  className="px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-none text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-900 dark:hover:border-gray-100 transition-colors duration-200"
                >
                  Sales
                </button>

                <button
                  onClick={switchToManufacturing}
                  className="px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-none text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-900 dark:hover:border-gray-100 transition-colors duration-200"
                >
                  Manufacturing
                </button>
              </div>
            </div>

            <div className="text-sm text-gray-500 dark:text-gray-500">
              © 2025 Aupulens. All rights reserved.
            </div>
          </div>
        </div>

        {/* Right Side - Auth Form */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
          <div className="absolute top-6 right-6">
            <ThemeToggle />
          </div>

          <div className="w-full max-w-md space-y-8">
            {/* Mobile Header */}
            <div className="lg:hidden text-center mb-8">
              <h1 className="text-3xl font-bold text-blue-800 dark:text-blue-800 mb-2">
                Aupulens
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 tracking-wide">
                ENTERPRISE RESOURCE PLANNING
              </p>
            </div>

            {/* Auth Card */}
            <div className="relative">
              <div className="relative bg-white dark:bg-gray-900 rounded-none border border-gray-200 dark:border-gray-800 p-12">
                <div className="mb-10">
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    Admin Portal
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    System Administration Access
                  </p>
                </div>

                {/* Auth Form */}
                <SignInForm />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <Loader2 className="h-8 w-8 animate-spin text-blue-800" />
        </div>
      }
    >
      <AuthContent />
    </Suspense>
  );
}
