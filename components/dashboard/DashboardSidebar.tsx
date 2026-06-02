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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // YouTube-style scrollbar: show when scrolling, hide after delay
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolling(true);
      
      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Hide scrollbar after 1 second of no scrolling
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 1000);
    };

    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
    }

    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleScroll);
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return (
    <aside
      className={cn(
        'relative bg-gradient-to-b from-background to-muted/20 border-r border-border/40 backdrop-blur-sm flex-shrink-0 transition-all duration-300 ease-in-out',
        isCollapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      {/* Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={cn(
          'absolute -right-3 top-6 z-50 h-6 w-6 rounded-full border border-border bg-background shadow-md hover:shadow-lg transition-all duration-300',
          'hover:scale-110 hover:border-primary/50'
        )}
      >
        {isCollapsed ? (
          <ChevronRight className="h-3.5 w-3.5 transition-transform duration-300" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5 transition-transform duration-300" />
        )}
      </Button>

      <div
        ref={scrollContainerRef}
        className={cn(
          'h-full overflow-y-scroll py-6 transition-all duration-300 youtube-scrollbar',
          isScrolling && 'is-scrolling'
        )}
      >
        <nav className={cn('space-y-6', isCollapsed ? 'px-2' : 'px-3')}>
          {sections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="space-y-2">
              {section.title && !isCollapsed && (
                <h3 className="px-4 mb-3 text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">
                  {section.title}
                </h3>
              )}

              {section.title && isCollapsed && (
                <Separator className="my-2 bg-border/60" />
              )}

              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.disabled ? '#' : item.href}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-none transition-all duration-200',
                        isCollapsed ? 'px-2.5 py-2.5 justify-center' : 'px-3.5 py-2.5',
                        isActive
                          ? 'bg-primary/10 text-primary shadow-sm shadow-primary/5'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                        item.disabled && 'opacity-50 cursor-not-allowed',
                        !item.disabled && 'hover:shadow-sm'
                      )}
                      aria-disabled={item.disabled}
                      tabIndex={item.disabled ? -1 : undefined}
                    >
                      {/* Active Indicator */}
                      {isActive && !isCollapsed && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 bg-primary rounded-r-full shadow-md shadow-primary/50" />
                      )}

                      {/* Icon with animation */}
                      <div
                        className={cn(
                          'relative transition-all duration-200',
                          isActive ? 'scale-100' : 'scale-90 group-hover:scale-100',
                          !item.disabled && 'group-hover:rotate-3'
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-[18px] w-[18px] transition-all duration-200',
                            isActive
                              ? 'text-primary drop-shadow-sm'
                              : 'text-muted-foreground/80 group-hover:text-foreground'
                          )}
                        />
                        
                        {/* Glow effect on active */}
                        {isActive && (
                          <Icon
                            className="absolute inset-0 h-[18px] w-[18px] text-primary opacity-20 blur-md"
                            aria-hidden="true"
                          />
                        )}
                      </div>

                      {/* Label */}
                      {!isCollapsed && (
                        <span
                          className={cn(
                            'text-[13px] font-medium transition-all duration-200 flex-1',
                            isActive ? 'font-semibold' : 'group-hover:translate-x-0.5'
                          )}
                        >
                          {item.title}
                        </span>
                      )}

                      {/* Badge */}
                      {item.badge && !isCollapsed && (
                        <Badge
                          variant={isActive ? 'default' : 'secondary'}
                          className={cn(
                            'ml-auto text-[10px] px-2 py-0 h-5 rounded-full font-semibold transition-all duration-200',
                            isActive
                              ? 'bg-primary/20 text-primary border-primary/30 shadow-sm'
                              : 'bg-muted text-muted-foreground border-transparent group-hover:bg-accent group-hover:text-accent-foreground'
                          )}
                        >
                          {item.badge}
                        </Badge>
                      )}

                      {/* Badge dot for collapsed */}
                      {item.badge && isCollapsed && (
                        <div className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary shadow-sm shadow-primary/50 animate-pulse" />
                      )}

                      {/* Tooltip for collapsed state */}
                      {isCollapsed && (
                        <div className="absolute left-full ml-2 px-3 py-1.5 bg-popover text-popover-foreground text-xs font-medium rounded-none shadow-lg border border-border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50">
                          {item.title}
                          {item.badge && (
                            <span className="ml-2 text-muted-foreground">
                              ({item.badge})
                            </span>
                          )}
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-popover border-l border-t border-border rotate-45" />
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>

              {sectionIndex < sections.length - 1 && (
                <Separator className="my-4 bg-border/60" />
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom gradient overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />
    </aside>
  );
}
