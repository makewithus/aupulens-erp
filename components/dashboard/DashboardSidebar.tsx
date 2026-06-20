'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LucideIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface SidebarItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string | number;
  disabled?: boolean;
}

export interface SidebarSection {
  title?: string;
  items: SidebarItem[];
}

interface DashboardSidebarProps {
  sections: SidebarSection[];
  className?: string;
}

export function DashboardSidebar({ sections, className }: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <div className={cn("relative h-full flex-shrink-0 w-[60px] z-40", className)}>
      <aside
        className={cn(
          'absolute left-0 top-0 h-full bg-neutral-950 border-r border-border/40 flex flex-col py-4',
          'w-[60px] hover:w-64 transition-all duration-300 ease-in-out overflow-hidden group shadow-[4px_0_24px_rgba(0,0,0,0.5)]'
        )}
      >
        <div className="flex-1 w-full overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex flex-col gap-4">
          {sections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="w-full flex flex-col gap-1 px-2">
              {section.title && (
                <div className="px-2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest whitespace-nowrap">
                  {section.title}
                </div>
              )}
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.disabled ? '#' : item.href}
                    className={cn(
                      'relative flex items-center gap-3 w-full h-10 rounded-lg transition-all duration-200 px-2.5',
                      isActive
                        ? 'bg-primary/20 text-primary shadow-sm'
                        : 'text-muted-foreground hover:bg-neutral-800 hover:text-foreground',
                      item.disabled && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-medium text-[13px] whitespace-nowrap flex-1">
                      {item.title}
                    </span>

                    {item.badge && (
                      <Badge className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 ml-auto h-5 px-1.5 text-[10px] bg-primary/20 text-primary border-primary/30">
                        {item.badge}
                      </Badge>
                    )}
                  </Link>
                );
              })}
              {sectionIndex < sections.length - 1 && (
                <Separator className="w-full bg-neutral-800 my-2 opacity-50" />
              )}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
