import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  isLoading?: boolean;
  className?: string;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function DashboardSidebar({
  sections,
  isLoading = false,
  className,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <aside
      className={cn(
        "hidden lg:flex shrink-0 flex-col border-r border-border/50 bg-background py-6 transition-all duration-300",
        isCollapsed ? "w-20" : "w-72",
        className
      )}
    >
      <div className={cn("flex items-center px-4 mb-2 shrink-0", isCollapsed ? "justify-center" : "justify-end")}>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="
            h-8
            w-8
            rounded-none
            text-muted-foreground
            hover:bg-transparent
            hover:text-foreground
          "
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="flex-1 w-full overflow-y-auto youtube-scrollbar flex flex-col gap-2 pr-1">
        {isLoading ? (
          <div aria-label="Loading navigation" aria-busy="true" className="w-full px-2 animate-pulse">
            {[0, 1, 2].map((group) => (
              <div key={group} className="mb-7 flex flex-col gap-3 px-4">
                {!isCollapsed && <div className="h-2 w-20 rounded bg-muted/60" />}
                {[0, 1, 2].slice(0, group === 0 ? 2 : 3).map((item) => (
                  <div key={item} className="flex h-9 items-center gap-3">
                    <div className="h-4 w-4 shrink-0 rounded bg-muted/60" />
                    {!isCollapsed && <div className="h-3 w-28 rounded bg-muted/60" />}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : sections.map((section, sectionIndex) => (
          <div key={`${section.title || "section"}-${sectionIndex}`} className="w-full flex flex-col gap-1 px-2">
            {section.title && !isCollapsed && (
              <div className="mb-3 mt-4 first:mt-1 px-6 font-mono text-[10px] uppercase leading-none tracking-[0.32em] text-muted-foreground">
                {section.title}
              </div>
            )}
            {section.items.map((item, itemIndex) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              // Warm a route only when it is approached; eager prefetch across
              // a large sidebar competes with the page the user opens.
              return (
                <Link
                  key={`${item.href}-${item.title}-${itemIndex}`}
                  href={item.disabled ? "#" : item.href}
                  prefetch={false}
                  onPointerEnter={() => !item.disabled && router.prefetch(item.href)}
                  onFocus={() => !item.disabled && router.prefetch(item.href)}
                  className={cn(
                    "group flex items-center transition-all duration-300",
                    isCollapsed ? "justify-center py-3" : "gap-3 px-6 py-2.5",
                    item.disabled && "pointer-events-none opacity-40"
                  )}
                  title={isCollapsed ? item.title : undefined}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-all duration-300 shrink-0",
                      isActive
                        ? "text-foreground opacity-100"
                        : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />

                  {!isCollapsed && (
                    <div className="flex flex-col">
                      <span
                        className={cn(
                          "relative w-fit max-w-[13rem] text-[25px] leading-[0.98] tracking-[-0.055em] transition-colors duration-300",
                          isActive
                            ? "text-foreground"
                            : "text-muted-foreground group-hover:text-foreground"
                        )}
                      >
                        {item.title}

                        <span
                          className={cn(
                            "absolute -bottom-2 left-0 h-0.5 bg-current transition-all duration-300",
                            isActive
                              ? "w-full opacity-100"
                              : "w-0 group-hover:w-full opacity-40"
                          )}
                        />
                      </span>

                      {item.badge && (
                        <Badge
                          className="mt-2 w-fit rounded-none border border-border bg-transparent text-[10px] text-foreground"
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
            {sectionIndex < sections.length - 1 && (
              <Separator className="my-7 bg-border/80" />
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
