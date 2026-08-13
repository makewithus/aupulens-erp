"use client";

import { useState, useRef, useEffect } from "react";
import { Roboto_Mono } from "next/font/google";
import {
  DollarSign,
  ShoppingCart,
  Package,
  Factory,
  ShieldCheck,
  Users,
  Menu,
  ChevronLeft,
} from "lucide-react";

const robotoMono = Roboto_Mono({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});
import { CommandCenterInput } from "./CommandCenterInput";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePathname, useRouter } from "next/navigation";
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
import { HeaderActions } from "./HeaderActions";
import { GlobalSearch } from "./GlobalSearch";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { ModuleTabs } from "./ModuleTabs";
import { ThemeToggle } from "@/components/ThemeToggle";

// Master Admin Module Switching
const MASTER_MODULES = [
  {
    id: "sales",
    title: "Sales",
    icon: ShoppingCart,
    config: salesSidebarConfig,
    // Selecting the module jumps straight into its tabbed interface
    // (Customers selected) instead of just previewing the sidebar sections.
    landingHref: "/sales/customers",
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
    // Selecting the module jumps straight into Chart of Accounts instead of
    // just previewing the sidebar sections.
    landingHref: "/finance/accounting",
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

const MODULES = [
  {
    id: "sales",
    title: "Sales",
    href: "/sales/pipeline",
  },
  {
    id: "inventory",
    title: "Inventory",
    href: "/inventory/summary",
  },
  {
    id: "finance",
    title: "Finance",
    href: "/finance/summary",
  },
  {
    id: "manufacturing",
    title: "Manufacturing",
    href: "/manufacturing/dashboard",
  },
  {
    id: "hr",
    title: "HR",
    href: "/hr/dashboard",
  },
  {
    id: "admin",
    title: "Admin",
    href: "/admin/dashboard",
  },
  {
    id: "crm",
    title: "CRM",
    href: "/crm/dashboard",
  },
  {
    id: "projects",
    title: "Projects",
    href: "/projects",
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
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

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
    await signOut({ callbackUrl: "/auth" });
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

  const activeModule =
  MODULES.find((m) => pathname.startsWith(`/${m.id}`))?.id ??
  "admin";

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
                width={125}
                height={32}
                priority
                className="h-8 w-auto object-contain transition-all duration-300"
              />
            </Link>

            {/* Back — so users don't have to return to a dashboard to move around. */}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => router.back()}
              title="Go back"
              className="h-8 w-8 rounded-none shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* Mobile nav trigger - the only way to reach navigation below the lg breakpoint, since DashboardSidebar is `hidden lg:flex` */}
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

            {/* Module Dropdown and Top-Links (desktop) - superseded by ModuleTabs below */}
            {/* <div className="hidden lg:flex items-center gap-1">
              {(activeUserRole === "master-admin" || activeUserRole === "admin") ? (
                MASTER_MODULES.map((m, index) => {
                  const isDropdownActive = activeDropdown === index;
                  return (
                    <div
                      key={m.id}
                      className="relative"
                      ref={(el) => {
                        dropdownRefs.current[index] = el;
                      }}
                    >
                      <button
                        onClick={() => setActiveDropdown(isDropdownActive ? null : index)}
                        className={cn(
                          "flex items-center gap-1 px-2 xl:px-3 py-1.5 rounded-none transition-all text-[10px] xl:text-[11px] border-r border-primary/20 shadow-sm tracking-widest",
                          isDropdownActive
                            ? "bg-primary/10 text-primary border-primary/40"
                            : "bg-primary/5 text-primary/80 hover:bg-primary/10 hover:text-primary"
                        )}
                      >
                        <m.icon className="h-3 w-3 xl:h-3.5 xl:w-3.5 opacity-70" />
                        <span>{m.title}</span>
                        <ChevronDown
                          className={cn(
                            "h-3 w-3 opacity-50 transition-transform duration-200",
                            isDropdownActive && "rotate-180"
                          )}
                        />
                      </button>

                      {isDropdownActive && (
                        <div
                          className="absolute left-0 top-full mt-2 w-[320px] rounded-none border-2 border-primary/20 bg-black p-3 z-50 transform-gpu transition-all duration-300 ease-out origin-top-left shadow-2xl overflow-hidden max-h-[70vh] overflow-y-auto youtube-scrollbar"
                        >
                          {m.config.map((section, si) => (
                            <div key={si} className="mb-3 last:mb-0">
                              {section.title && (
                                <div className="text-[10px] font-black tracking-widest uppercase text-muted-foreground/70 px-2 mb-1">
                                  {section.title}
                                </div>
                              )}
                              <div className="grid grid-cols-1 gap-0.5">
                                {section.items.map((it: any) => (
                                  <button
                                    key={it.href}
                                    onClick={() => {
                                      setActiveDropdown(null);
                                      router.push(it.href);
                                    }}
                                    className="w-full text-left px-2 py-1.5 rounded-none hover:bg-primary/5 hover:text-primary transition duration-150 flex items-center gap-2.5 text-xs text-foreground/80 tracking-wider"
                                  >
                                    {it.icon && (
                                      <it.icon className="h-3.5 w-3.5 text-muted-foreground/60" />
                                    )}
                                    <span className="truncate">{it.title}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                sidebarConfig.length > 0 && (
                  <div className="relative" ref={moduleRef}>
                    <button
                      onClick={() => setIsModuleOpen(!isModuleOpen)}
                      className="flex items-center gap-2 px-4 py-1.5 rounded-none bg-primary/5 hover:bg-primary/10 transition-all text-[11px] font-black border-r border-primary/20 shadow-sm uppercase tracking-widest text-primary"
                    >
                      {dashboardTitle || "MODULE"}
                      <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                    </button>

                    {isModuleOpen && (
                      <div className="absolute left-0 top-full mt-2 w-[320px] rounded-none border-2 border-primary/20 bg-black p-3 z-50 transform-gpu shadow-2xl overflow-hidden max-h-[70vh] overflow-y-auto youtube-scrollbar">
                        {sidebarConfig.map((section, si) => (
                          <div key={si} className="mb-3 last:mb-0">
                            {section.title && (
                              <div className="text-[10px] font-black tracking-widest uppercase text-muted-foreground/70 px-2 mb-1">
                                {section.title}
                              </div>
                            )}
                            <div className="grid grid-cols-1 gap-0.5">
                              {section.items.map((it: any) => (
                                <button
                                  key={it.href}
                                  onClick={() => {
                                    setIsModuleOpen(false);
                                    router.push(it.href);
                                  }}
                                  className="w-full text-left px-2 py-1.5 rounded-none hover:bg-primary/5 hover:text-primary transition duration-150 flex items-center gap-2.5 text-xs text-foreground/80 uppercase tracking-wider"
                                >
                                  {it.icon && (
                                    <it.icon className="h-3.5 w-3.5 text-muted-foreground/60" />
                                  )}
                                  <span className="truncate">{it.title}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              )}
            </div> */}

            {(activeUserRole === "master-admin" ||
              activeUserRole === "admin") && (
              <ModuleTabs
                modules={MODULES}
                activeModule={activeModule}
                onNavigate={(href) => router.push(href)}
              />
            )}
          </div>

          {/* RIGHT SECTION */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Global AI Command Center */}
            <CommandCenterInput />

            <GlobalSearch sidebarConfig={sidebarConfig} />

            <WorkspaceSwitcher />

            <HeaderActions
              isRefreshing={isRefreshing}
              onRefresh={handleRefresh}
              onToggleAi={onToggleAi}
              userName={userName}
              userEmail={userEmail}
              userRole={userRole}
              profilePath={profilePath}
              onSignOut={handleSignOut}
            />

            <div className="hover:scale-105 transition-transform duration-200">
              <ThemeToggle />
            </div>

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
                    onClick={() => {
                      setPreviewModuleId(m.id);
                      if (m.landingHref) {
                        setIsMobileNavOpen(false);
                        router.push(m.landingHref);
                      }
                    }}
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