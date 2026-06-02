'use client'

import * as React from 'react'
import { useToast } from './use-toast'
import { CheckCircle, XCircle, X } from 'lucide-react'

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed top-4 right-4 z-100 flex flex-col gap-3 max-w-md">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`
            min-w-[320px] rounded-none border shadow-lg p-4 
            bg-white dark:bg-slate-900 
            animate-in slide-in-from-top-full duration-300
            ${t.variant === 'destructive' 
              ? 'border-red-200 dark:border-red-800' 
              : 'border-blue-200 dark:border-blue-800'
            }
          `}
          role="status"
        >
          <div className="flex gap-3">
            {/* Icon */}
            <div className="shrink-0">
              {t.variant === 'destructive' ? (
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              ) : (
                <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              )}
            </div>
            
            {/* Content */}
            <div className="flex-1 space-y-1">
              {t.title && (
                <div className={`font-semibold text-sm ${
                  t.variant === 'destructive' 
                    ? 'text-red-900 dark:text-red-100' 
                    : 'text-blue-900 dark:text-blue-100'
                }`}>
                  {t.title}
                </div>
              )}
              {t.description && (
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  {t.description}
                </div>
              )}
              {t.action}
            </div>

            {/* Close button */}
            <button 
              onClick={() => dismiss(t.id)} 
              className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}


