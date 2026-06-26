"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SidebarItem {
  title: string;
  href: string;
  icon?: any;
}

interface SidebarSection {
  title?: string;
  items: SidebarItem[];
}

interface GlobalSearchProps {
  sidebarConfig: SidebarSection[];
  className?: string;
}

export function GlobalSearch({
  sidebarConfig,
  className,
}: GlobalSearchProps) {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const allPages = sidebarConfig.flatMap((section) =>
    section.items.map((item) => ({
      title: item.title,
      href: item.href,
      section: section.title || "",
      icon: item.icon,
    })),
  );

  const filteredPages = searchQuery.trim()
    ? allPages.filter(
        (page) =>
          page.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          page.section.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : [];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowSearchResults(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSearchSelect(href: string) {
    router.push(href);
    setSearchQuery("");
    setShowSearchResults(false);
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    setShowSearchResults(value.trim().length > 0);
  }

  if (sidebarConfig.length === 0) return null;

  return (
    <div
      ref={searchRef}
      className={cn("relative hidden lg:block", className)}
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

        <Input
          type="text"
          placeholder="Search"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          onFocus={() =>
            searchQuery && setShowSearchResults(true)
          }
          className="
            h-9
            w-48
            xl:w-64
            rounded-none
            border-border/60
            bg-muted/50
            pl-9
            pr-9
            shadow-none
            transition-all
            focus:bg-background
            focus:border-primary
            focus:ring-0
          "
        />

        {searchQuery && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSearchQuery("");
              setShowSearchResults(false);
            }}
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {showSearchResults && filteredPages.length > 0 && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden border border-border bg-background shadow-lg">
          <div
            className={cn(
              "youtube-scrollbar max-h-96 overflow-y-auto",
              isScrolling && "is-scrolling",
            )}
            onScroll={() => {
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
                  onClick={() =>
                    handleSearchSelect(page.href)
                  }
                  className="
                    flex
                    w-full
                    items-center
                    gap-3
                    border-b
                    border-border/40
                    px-4
                    py-3
                    text-left
                    transition-colors
                    hover:bg-muted/50
                    last:border-0
                  "
                >
                  {Icon && (
                    <div className="flex h-8 w-8 items-center justify-center bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {page.title}
                    </div>

                    <div className="truncate text-xs text-muted-foreground">
                      {page.section}
                    </div>
                  </div>

                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showSearchResults &&
        searchQuery &&
        filteredPages.length === 0 && (
          <div className="absolute right-0 top-full z-50 mt-2 w-80 border border-border bg-background p-4 shadow-lg">
            <p className="text-center text-sm text-muted-foreground">
              No pages found for "{searchQuery}"
            </p>
          </div>
        )}
    </div>
  );
}