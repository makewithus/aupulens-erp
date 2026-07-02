"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

const SETUP_GROUPS: { title: string; items: { label: string; href: string }[] }[] = [
  {
    title: "CHART OF ACCOUNTS",
    items: [
      { label: "General", href: "/finance/accounting/setup/chart-of-accounts/general" },
      { label: "Account Mapping", href: "/finance/accounting/setup/chart-of-accounts/account-mapping" },
      { label: "Custom Fields", href: "/finance/accounting/setup/chart-of-accounts/custom-fields" },
    ],
  },
  {
    title: "JOURNALS",
    items: [
      { label: "General", href: "/finance/accounting/setup/journals/general" },
      { label: "Custom Fields", href: "/finance/accounting/setup/journals/custom-fields" },
      { label: "Approvals", href: "/finance/accounting/setup/journals/approvals" },
      { label: "Validation Rules", href: "/finance/accounting/setup/journals/validation-rules" },
    ],
  },
  {
    title: "INDIRECT TAXES",
    items: [
      { label: "Tax Rates", href: "/finance/accounting/setup/taxes/tax-rates" },
      { label: "Tax Settings", href: "/finance/accounting/setup/taxes/tax-settings" },
    ],
  },
  {
    title: "DIRECT TAXES",
    items: [
      { label: "Income TDS Settings", href: "/finance/accounting/setup/direct-taxes/tds-settings" },
      { label: "Income TDS Rates", href: "/finance/accounting/setup/direct-taxes/tds-rates" },
      { label: "Income TCS Rates", href: "/finance/accounting/setup/direct-taxes/tcs-rates" },
    ],
  },
  {
    title: "CURRENCIES",
    items: [{ label: "Currency", href: "/finance/accounting/setup/currencies/currency" }],
  },
];

export function AccountingSubNav() {
  const pathname = usePathname();
  const [setupSearch, setSetupSearch] = useState("");

  const filteredSetupGroups = useMemo(() => {
    if (!setupSearch.trim()) return SETUP_GROUPS;
    const q = setupSearch.trim().toLowerCase();
    return SETUP_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((i) => i.label.toLowerCase().includes(q) || g.title.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [setupSearch]);

  const isActive = (matcher: string) => pathname?.startsWith(matcher);

  const tabClass = (active: boolean) =>
    `pb-2 cursor-pointer transition-colors flex items-center gap-1 ${
      active ? "border-b-2 border-blue-600 font-semibold text-blue-600" : "text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div className="flex space-x-6 border-b pb-2">
      <Link
        href="/finance/accounting/chart-of-accounts"
        className={tabClass(pathname === "/finance/accounting/chart-of-accounts" && !pathname.includes("account-types"))}
      >
        Chart of Accounts
      </Link>

      <Link
        href="/finance/accounting/chart-of-accounts?tab=Journals"
        className={tabClass(false)}
      >
        Journals
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={tabClass(isActive("/finance/accounting/banking"))}>
            Banking <span className="text-xs align-middle">▾</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem asChild>
            <Link href="/finance/accounting/banking">Banking</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/finance/accounting/banking/rules">Banking Rules</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Link href="/finance/accounting/budgets" className={tabClass(isActive("/finance/accounting/budgets"))}>
        Budgets
      </Link>

      <Link
        href="/finance/accounting/transaction-locking"
        className={tabClass(isActive("/finance/accounting/transaction-locking"))}
      >
        Transaction Locking
      </Link>

      <Link
        href="/finance/accounting/period-end-closing"
        className={tabClass(isActive("/finance/accounting/period-end-closing"))}
      >
        Period End Closing
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={tabClass(isActive("/finance/accounting/setup"))}>
            Setup <span className="text-xs align-middle">▾</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[560px] max-h-[70vh] overflow-y-auto p-3">
          <div className="flex items-center border rounded-md px-2 mb-2 bg-background">
            <Search className="h-4 w-4 text-muted-foreground mr-2" />
            <Input
              value={setupSearch}
              onChange={(e) => setSetupSearch(e.target.value)}
              placeholder="Search settings..."
              className="border-0 focus-visible:ring-0 shadow-none px-0 h-9"
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {filteredSetupGroups.map((group) => (
              <div key={group.title}>
                <DropdownMenuLabel className="text-xs text-muted-foreground px-0 py-1">
                  {group.title}
                </DropdownMenuLabel>
                {group.items.map((item) => (
                  <DropdownMenuItem key={item.href} asChild className="cursor-pointer">
                    <Link href={item.href}>{item.label}</Link>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
            {filteredSetupGroups.length === 0 && (
              <div className="col-span-2 text-sm text-muted-foreground py-4 text-center">No settings found</div>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export { SETUP_GROUPS };
