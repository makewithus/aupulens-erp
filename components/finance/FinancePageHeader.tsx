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
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          {description}
        </p>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
