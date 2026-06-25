"use client";

import { useState, useRef, useEffect } from "react";
import { Roboto_Mono } from "next/font/google";
import {
  RefreshCw,
  ChevronRight,
  Home,
  Search,
  X,
  Menu,
  ChevronDown,
  DollarSign,
  ShoppingCart,
  Package,
  Factory,
  ShieldCheck,
  Users,
  Sparkles,
} from "lucide-react";

const robotoMono = Roboto_Mono({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserNav } from "./UserNav";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { financeSidebarConfig } from "@/config/sidebar/finance";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { inventorySidebarConfig } from "@/config/sidebar/inventory";
import { manufacturingSidebarConfig } from "@/config/sidebar/manufacturing";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import { hrSidebarConfig } from "@/config/sidebar/hr";
import { crmSidebarConfig } from "@/config/sidebar/crm";
import { useTenantStore } from "@/store/useTenantStore";
import { useAuthStore, clearAllStores } from "@/store/authStore";
import { signOut } from "next-auth/react";

// Master Admin Module Switching
const MASTER_MODULES = [
  {
    id: "sales",
    title: "Sales",
    icon: ShoppingCart,
    config: salesSidebarConfig,
  },
  {
    id: "inventory",
    title: "Inventory",
    icon: Package,
    config: inventorySidebarConfig,
  },
  {
    id: "finance",
    title: "Finance",
    icon: DollarSign,
    config: financeSidebarConfig,
  },
  {
    id: "manufacturing",
    title: "Manufacturing",
    icon: Factory,
    config: manufacturingSidebarConfig,
  },
  {
    id: "hr",
    title: "HR",
    icon: Users,
    config: hrSidebarConfig,
  },
  {
    id: "admin",
    title: "Admin",
    icon: ShieldCheck,
    config: adminSidebarConfig,
  },
  {
    id: "crm",
    title: "CRM",
    icon: Users,
    config: crmSidebarConfig,
  },
];

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export type { BreadcrumbItem };

interface SidebarItem {
  title: string;
  href: string;
  icon?: any;
}

interface SidebarSection {
  title?: string;
  items: SidebarItem[];
}

interface DashboardHeaderProps {
  companyName?: string;
  dashboardTitle?: string;
  pageName?: string;
  breadcrumbs?: BreadcrumbItem[];
  userName?: string;
  userEmail?: string;
  userRole?: string;
  onSignOut?: () => void;
  onRefresh?: () => void | Promise<void>;
  className?: string;
  profilePath?: string;
  sidebarConfig?: SidebarSection[];
  onToggleAi?: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function DashboardHeader({
  companyName = "Aupulens",
  dashboardTitle = "Dashboard",
  pageName,
  breadcrumbs,
  userName,
  userEmail,
  userRole,
  onSignOut,
  onRefresh,
  className,
  profilePath,
  sidebarConfig = [],
  onToggleAi,
  isSidebarOpen = true,
  onToggleSidebar,
}: DashboardHeaderProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { tenantId } = useTenantStore();
  const { logout, user } = useAuthStore();
  
  const activeUserRole = userRole || user?.role;

  const handleSignOut = async () => {
    console.log("[DashboardHeader] Sign out triggered");
    // 1. If a parent (DashboardLayout) provided a sign-out handler, use it
    if (onSignOut) {
      console.log("[DashboardHeader] Using onSignOut prop");
      await onSignOut();
      return;
    }

    // 2. Fallback: Default native sign out behavior
    console.log("[DashboardHeader] Using native signOut fallback");
    clearAllStores();
    await signOut({ callbackUrl: "/auth/admin" });
  };

  const pathname = usePathname();
  // Extract all pages from sidebar config
  const allPages = sidebarConfig.flatMap((section) =>
    section.items.map((item) => ({
      title: item.title,
      href: item.href,
      section: section.title,
      icon: item.icon,
    })),
  );

  // Filter pages based on search query
  const filteredPages = searchQuery.trim()
    ? allPages.filter(
        (page) =>
          page.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          page.section.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : [];

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const handleSearchSelect = (href: string) => {
    router.push(href);
    setSearchQuery("");
    setShowSearchResults(false);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setShowSearchResults(value.trim().length > 0);
  };

  // Simplified header left content: Logo, Module dropdown, and top-level links
  const [isModuleOpen, setIsModuleOpen] = useState(false);
  const moduleRef = useRef<HTMLDivElement | null>(null);
  const [openSectionIndex, setOpenSectionIndex] = useState<number | null>(null);

  // New state for top-level dropdowns
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const dropdownRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [previewModuleId, setPreviewModuleId] = useState<string | null>(null);

  // Initialize preview module based on dashboardTitle or pathname
  useEffect(() => {
    if (activeUserRole === "master-admin" || activeUserRole === "admin") {
      const currentMod = MASTER_MODULES.find(
        (m) =>
          dashboardTitle?.toLowerCase().includes(m.id) ||
          pathname.includes(`/${m.id}`),
      );
      setPreviewModuleId(currentMod?.id || "admin");
    }
  }, [activeUserRole, dashboardTitle, pathname]);

  const currentPreviewConfig =
    MASTER_MODULES.find((m) => m.id === previewModuleId)?.config ||
    sidebarConfig;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (moduleRef.current && !moduleRef.current.contains(e.target as Node)) {
        setIsModuleOpen(false);
      }
      // Close top-level dropdowns when clicking outside
      if (
        !dropdownRefs.current.some((ref) => ref?.contains(e.target as Node))
      ) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Derive a few important top-level links by scanning available pages
  const messagesPage =
    allPages.find(
      (p) =>
        p.title.toLowerCase().includes("message") ||
        p.href.includes("/messages"),
    )?.href || "/messages";
  const analyticsPage =
    allPages.find(
      (p) =>
        p.title.toLowerCase().includes("analytics") ||
        p.href.includes("/analytics"),
    )?.href || "/admin/analytics";
  const intelligencePage =
    allPages.find(
      (p) =>
        p.title.toLowerCase().includes("intelligence") ||
        p.href.includes("ai") ||
        p.href.includes("assistant"),
    )?.href || "/admin/ai-assistant";

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
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* LEFT SECTION: logo + module + top links */}
          <div className="flex items-center gap-2 sm:gap-4 lg:gap-8">
            {/* Company Logo + Name */}
            <Link href="/" className="flex items-center gap-2 sm:gap-3 group cursor-pointer">
              <Logo
                width={112}
                height={32}
                priority
                className="h-8 w-auto object-contain transition-all duration-300"
              />
            </Link>

            {/* Module Dropdown */}
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
            {/* Module Dropdown and Top-Links (desktop) */}
            <div className="hidden lg:flex items-center gap-4">
              {sidebarConfig.length > 0 && onToggleSidebar && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onToggleSidebar}
                  title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                  className="h-8 w-8 text-neutral-400 hover:text-foreground hover:bg-neutral-800/50 transition-all rounded-lg"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              )}
              <div className="relative" ref={moduleRef}>
                <button
                  onClick={() => setIsModuleOpen(!isModuleOpen)}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-none bg-primary/5 hover:bg-primary/10 transition-all text-[11px] font-black border-r border-primary/20 shadow-sm uppercase tracking-widest text-primary"
                >
                  {activeUserRole === "master-admin" || activeUserRole === "admin"
                    ? "MODULES"
                    : dashboardTitle || "MODULE"}
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </button>

                {isModuleOpen && (
                  <div
                    className="absolute left-0 top-full mt-2 w-[400px]
  rounded-none border-2 border-primary/20 bg-black p-0 z-50 transform-gpu transition-all duration-300 ease-out origin-top-left shadow-2xl overflow-hidden"
                  >
                    {(activeUserRole === "master-admin" || activeUserRole === "admin") && (
                      <div className="flex border-b border-white/10 bg-white/5">
                        {MASTER_MODULES.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => setPreviewModuleId(m.id)}
                            className={cn(
                              "flex-1 py-3 px-2 flex flex-col items-center gap-1.5 transition-all relative group",
                              previewModuleId === m.id
                                ? "text-primary bg-primary/10"
                                : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                            )}
                          >
                            <m.icon
                              className={cn(
                                "h-4 w-4",
                                previewModuleId === m.id
                                  ? "text-primary"
                                  : "opacity-40 group-hover:opacity-100",
                              )}
                            />
                            <span className="text-[9px] font-black uppercase tracking-tight">
                              {m.title}
                            </span>
                            {previewModuleId === m.id && (
                              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="p-3 max-h-[70vh] overflow-y-auto youtube-scrollbar">
                      {(activeUserRole === "master-admin" || activeUserRole === "admin"
                        ? currentPreviewConfig
                        : sidebarConfig
                      ).map((section, si) => (
                        <div key={si} className="mb-2 last:mb-0">
                          {/* Section header (accordion trigger) */}
                          <button
                            onClick={() =>
                              setOpenSectionIndex(
                                openSectionIndex === si ? null : si,
                              )
                            }
                            className="w-full flex items-center justify-between px-3 py-2 bg-transparent hover:bg-muted/50 transition-colors rounded-none"
                            aria-expanded={openSectionIndex === si}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                                {section.title}
                              </span>
                            </div>
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 transition-transform duration-300",
                                openSectionIndex === si
                                  ? "rotate-180 text-primary"
                                  : "text-muted-foreground",
                              )}
                            />
                          </button>

                          {/* Submenu - collapsed/expanded with smooth animation */}
                          <div
                            className={cn(
                              "overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out",
                              openSectionIndex === si
                                ? "max-h-96 opacity-100"
                                : "max-h-0 opacity-0",
                            )}
                          >
                            <div className="mt-2 grid grid-cols-1 gap-1">
                              {section.items.map((it: any) => (
                                <button
                                  key={it.href}
                                  onClick={() => {
                                    setIsModuleOpen(false);
                                    setOpenSectionIndex(null);
                                    router.push(it.href);
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-none hover:bg-muted/60 transition transform duration-200 flex items-center gap-3 text-sm text-foreground/90 hover:shadow-sm uppercase"
                                >
                                  {it.icon && (
                                    <it.icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                                  )}
                                  <span className="truncate">{it.title}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Breadcrumbs removed per header simplification */}
          </div>

          {/* RIGHT SECTION */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Search Bar - Hidden on mobile, visible on md+ */}
            {sidebarConfig.length > 0 && (
              <div ref={searchRef} className="relative hidden lg:block">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onFocus={() => searchQuery && setShowSearchResults(true)}
                    className="w-48 xl:w-64 pl-9 pr-9 h-9  bg-muted/50 border-border/60 focus:bg-background rounded-none focus:ring-0 focus:border-primary"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSearchQuery("");
                        setShowSearchResults(false);
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {showSearchResults && filteredPages.length > 0 && (
                  <div className="absolute top-full right-0 mt-2 w-80 bg-background border border-border rounded-none shadow-lg overflow-hidden z-50">
                    <div
                      className={cn(
                        "max-h-96 overflow-y-auto youtube-scrollbar",
                        isScrolling && "is-scrolling",
                      )}
                      onScroll={(e) => {
                        setIsScrolling(true);
                        if (scrollTimeoutRef.current) {
                          clearTimeout(scrollTimeoutRef.current);
                        }
                        scrollTimeoutRef.current = setTimeout(() => {
                          setIsScrolling(false);
                        }, 1000);
                      }}
                    >
                      {filteredPages.map((page, index) => {
                        const Icon = page.icon;
                        return (
                          <button
                            key={index}
                            onClick={() => handleSearchSelect(page.href)}
                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left border-b border-border/40 last:border-0"
                          >
                            {Icon && (
                              <div className="shrink-0 w-8 h-8 rounded-none bg-primary/10 flex items-center justify-center">
                                <Icon className="h-4 w-4 text-primary" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-foreground truncate">
                                {page.title}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {page.section}
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* No Results */}
                {showSearchResults &&
                  searchQuery &&
                  filteredPages.length === 0 && (
                    <div className="absolute top-full right-0 mt-2 w-80 bg-background border border-border rounded-none shadow-lg p-4 z-50">
                      <p className="text-sm text-muted-foreground text-center">
                        No pages found for &quot;{searchQuery}&quot;
                      </p>
                    </div>
                  )}
              </div>
            )}

            {sidebarConfig.length > 0 && (
              <Separator
                orientation="vertical"
                className="hidden sm:block h-6 bg-border/60"
              />
            )}

            {/* Refresh Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={cn(
                "h-8 w-8 sm:h-9 sm:w-9 rounded-none hover:bg-accent transition-all duration-200",
                "hover:shadow-sm hover:scale-105",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
              )}
              title="Refresh page"
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground transition-all duration-500",
                  isRefreshing && "animate-spin text-primary",
                  !isRefreshing && "hover:text-foreground",
                )}
              />
            </Button>

            {/* AI Assistant Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleAi}
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-none hover:bg-accent transition-all duration-200 hover:shadow-sm hover:scale-105"
              title="Aupulens Copilot"
            >
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground hover:text-primary transition-all duration-300" />
            </Button>

            {/* Theme Toggle
            <div className="hover:scale-105 transition-transform duration-200">
              <ThemeToggle />
            </div> */}

            {/* Separator - Hidden on mobile */}
            <Separator
              orientation="vertical"
              className="hidden sm:block h-6 bg-border/60"
            />

            {/* User Nav */}
            {userName && (
              <UserNav
                userName={userName}
                userEmail={userEmail}
                userRole={userRole}
                onSignOut={() => handleSignOut()}
                profilePath={profilePath}
              />
            )}
          </div>
        </div>

        {/* Mobile breadcrumbs removed */}
      </div>

      {/* Bottom gradient line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-primary/20 to-transparent" />
      {/* Mobile nav overlay - shows the sidebar sections & items like the sidebar */}
      {isMobileNavOpen && (
        <div
          ref={mobileNavRef}
          className="lg:hidden absolute left-0 right-0 top-full z-50 bg-background shadow-lg border-t border-border/40 p-3 max-h-[85vh] overflow-y-auto"
        >
          {(activeUserRole === "master-admin" || activeUserRole === "admin") && (
            <div className="mb-4 pb-4 border-b border-border/50">
              <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2 px-2">
                Modules
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MASTER_MODULES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPreviewModuleId(m.id)}
                    className={cn(
                      "flex flex-col items-center justify-center p-2 rounded border transition-all",
                      previewModuleId === m.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/40 bg-muted/20 text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <m.icon className="h-5 w-5 mb-1" />
                    <span className="text-[10px] font-semibold uppercase">{m.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(activeUserRole === "master-admin" || activeUserRole === "admin"
            ? currentPreviewConfig
            : sidebarConfig
          ).map((section, si) => (
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