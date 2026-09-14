"use client";

import { useState, useRef, useEffect } from "react";
import { Roboto_Mono } from "next/font/google";
import { Menu, ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { HeaderActions } from "@/components/dashboard/HeaderActions";
import { ThemeToggle } from "@/components/ThemeToggle";
import { platformSidebarConfig } from "@/config/sidebar/platform";

const robotoMono = Roboto_Mono({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

interface PlatformHeaderProps {
  companyName?: string;
  dashboardTitle?: string;
  pageName?: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  onSignOut: () => void;
  onRefresh?: () => void | Promise<void>;
  className?: string;
  profilePath?: string;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function PlatformHeader({
  companyName = "Aupulens",
  dashboardTitle = "Platform Admin",
  pageName,
  userName,
  userEmail,
  userRole,
  onSignOut,
  onRefresh,
  className,
  profilePath,
  isSidebarOpen = true,
  onToggleSidebar,
}: PlatformHeaderProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Close mobile nav when clicking outside
  const mobileNavRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const handleClickOutsideMobile = (event: MouseEvent) => {
      if (
        mobileNavRef.current &&
        !mobileNavRef.current.contains(event.target as Node)
      ) {
        setIsMobileNavOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutsideMobile);
    return () =>
      document.removeEventListener("mousedown", handleClickOutsideMobile);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) await onRefresh();
      router.refresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-30 backdrop-blur-xl bg-background/80 border-b border-border/40 shadow-sm",
        robotoMono.className,
        "supports-backdrop-filter:bg-background/60",
        className,
      )}
    >
      <div className="px-3 sm:px-4 lg:px-6 xl:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* LEFT SECTION */}
          <div className="flex items-center gap-2 sm:gap-4 lg:gap-8">
            {/* Company Logo + Name */}
            <Link href="/platform" className="flex items-center gap-2 sm:gap-3 group cursor-pointer">
              <Logo
                width={125}
                height={32}
                priority
                className="h-8 w-auto object-contain transition-all duration-300"
              />
            </Link>

            <Button
              size="icon"
              variant="ghost"
              onClick={() => router.back()}
              title="Go back"
              className="h-8 w-8 rounded-none shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="lg:hidden">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
                title="Open menu"
                className="h-8 w-8 rounded-none"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* RIGHT SECTION */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <HeaderActions
              isRefreshing={isRefreshing}
              onRefresh={handleRefresh}
              userName={userName}
              userEmail={userEmail}
              userRole={userRole}
              profilePath={profilePath}
              onSignOut={onSignOut}
            />

            <div className="hover:scale-105 transition-transform duration-200">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom gradient line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-primary/20 to-transparent" />

      {/* Mobile nav overlay */}
      {isMobileNavOpen && (
        <div
          ref={mobileNavRef}
          className="lg:hidden absolute left-0 right-0 top-full z-50 bg-background shadow-lg border-t border-border/40 p-3 max-h-[85vh] overflow-y-auto"
        >
          {platformSidebarConfig.map((section, si) => (
            <div key={si} className="mb-3">
              {section.title && (
                <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2 px-2">
                  {section.title}
                </div>
              )}
              <div className="flex flex-col gap-1">
                {section.items.map((it: any) => {
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.href}
                      onClick={() => {
                        setIsMobileNavOpen(false);
                        router.push(it.href);
                      }}
                      className="flex items-center gap-3 text-left px-3 py-2 rounded-none hover:bg-muted/50 text-sm text-muted-foreground"
                    >
                      {Icon && <Icon className="h-4 w-4" />}
                      <span className="truncate">{it.title}</span>
                      {it.badge && (
                        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
                          {it.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
