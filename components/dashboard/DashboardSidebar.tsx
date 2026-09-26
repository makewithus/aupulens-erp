import React, { useEffect, useRef } from 'react';
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
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function DashboardSidebar({
  sections,
  className,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Restore scroll position on sections change (meaning a navigation completed and layout mounted)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const savedPosition = sessionStorage.getItem("sidebar-scroll-position");
    if (savedPosition) {
      container.scrollTop = parseInt(savedPosition, 10);
      const t = setTimeout(() => {
        container.scrollTop = parseInt(savedPosition, 10);
      }, 100);
      return () => clearTimeout(t);
    }
  }, [sections]);

  // Track and save scroll position in sessionStorage on scroll events
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      sessionStorage.setItem("sidebar-scroll-position", container.scrollTop.toString());
    };

    container.addEventListener("scroll", handleScroll);
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <aside
      className={cn(
        "hidden lg:flex shrink-0 flex-col border-r border-border/30 bg-background py-8 transition-all duration-300",
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
            text-[#B3BAC7]
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

      <div ref={scrollContainerRef} className="flex-1 w-full overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex flex-col gap-2">
        {sections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="w-full flex flex-col gap-1 px-2">
            {section.title && !isCollapsed && (
              <div className="mb-6 px-6 font-mono text-[10px] uppercase leading-none tracking-[0.32em] text-[#B3BAC7]">
                {section.title}
              </div>
            )}
            {section.items.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.disabled ? "#" : item.href}
                  prefetch={true}
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
                        ? "text-[#B3BAC7] opacity-100"
                        : "text-[#B3BAC7]/75 group-hover:text-[#B3BAC7]"
                    )}
                  />

                  {!isCollapsed && (
                    <div className="flex flex-col">
                      <span
                        className={cn(
                          "relative w-fit max-w-[13rem] text-[25px] leading-[0.98] tracking-[-0.055em] transition-colors duration-300",
                          isActive
                            ? "text-[#B3BAC7]"
                            : "text-[#B3BAC7]/90 group-hover:text-[#B3BAC7]"
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