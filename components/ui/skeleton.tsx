'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-none bg-neutral-200 dark:bg-neutral-800/60', className)}
      {...props}
    />
  )
}

