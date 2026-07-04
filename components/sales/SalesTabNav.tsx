"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SalesTab {
  key: string;
  label: string;
  href: string;
  dropdown?: { label: string; href: string }[];
}

const SALES_TABS: SalesTab[] = [
  { key: "customers", label: "Customers", href: "/sales/customers" },
  { key: "quotes", label: "Quotes", href: "/sales/quotes" },
  { key: "subscriptions", label: "Subscriptions", href: "/sales/subscriptions" },
  {
    key: "sales-orders",
    label: "Sales Orders",
    href: "/sales/orders",
    dropdown: [
      { label: "All Sales Orders", href: "/sales/orders" },
      { label: "+ New Sales Order", href: "/sales/orders" },
    ],
  },
  {
    key: "invoices",
    label: "Invoices",
    href: "/sales/invoices",
    dropdown: [
      { label: "All Invoices", href: "/sales/invoices" },
      { label: "+ New Invoice", href: "/sales/invoices/new" },
      { label: "Templates", href: "/sales/invoices/templates" },
    ],
  },
  {
    key: "payments",
    label: "Payments",
    href: "/sales/payments",
    dropdown: [{ label: "All Payments", href: "/sales/payments" }],
  },
];

export function SalesTabNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 border-b overflow-x-auto">
      {SALES_TABS.map((tab) => {
        const isActive = pathname === tab.href || pathname?.startsWith(tab.href + "/");
        return (
          <div key={tab.key} className="flex items-center">
            <Link
              href={tab.href}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                isActive
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
            {tab.dropdown && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`px-1 py-3 -ml-2 border-b-2 -mb-px ${
                      isActive ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground"
                    }`}
                    aria-label={`${tab.label} options`}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {tab.dropdown.map((item) => (
                    <DropdownMenuItem key={item.href + item.label} asChild>
                      <Link href={item.href}>{item.label}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      })}
    </div>
  );
}
