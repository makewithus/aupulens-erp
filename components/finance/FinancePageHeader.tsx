'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FinancePageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}

export function FinancePageHeader({
  title,
  description,
  actions,
  className,
}: FinancePageHeaderProps) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-start justify-between gap-4', className)}>
      <div className="space-y-1 min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground break-words">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          {description}
        </p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
