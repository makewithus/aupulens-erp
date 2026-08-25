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
    href: "/sales/sales-orders",
    dropdown: [
      { label: "All Sales Orders", href: "/sales/sales-orders" },
      { label: "+ New Sales Order", href: "/sales/sales-orders/new" },
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
    dropdown: [
      { label: "All Payments", href: "/sales/payments" },
      { label: "+ New Payment", href: "/sales/payments/new" },
    ],
  },
  { key: "e-invoices", label: "E-Invoicing", href: "/sales/e-invoices" },
];

export function SalesTabNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-stretch gap-1 border-b overflow-x-auto">
      {SALES_TABS.map((tab) => {
        const isActive = pathname === tab.href || pathname?.startsWith(tab.href + "/");
        const activeClasses = isActive
          ? "border-blue-600 text-blue-600"
          : "border-transparent text-muted-foreground hover:text-foreground";

        if (!tab.dropdown) {
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={`flex h-11 items-center px-4 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${activeClasses}`}
            >
              {tab.label}
            </Link>
          );
        }

        return (
          <div
            key={tab.key}
            className={`flex h-11 items-center border-b-2 -mb-px whitespace-nowrap transition-colors ${activeClasses}`}
          >
            <Link
              href={tab.href}
              className="flex h-full items-center pl-4 pr-1 text-sm font-medium"
            >
              {tab.label}
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex h-full items-center justify-center pl-1 pr-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label={`${tab.label} options`}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
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
          </div>
        );
      })}
    </div>
  );
}
