"use client";

// Developer reference: every shared container, navigation pattern and UI primitive used across the ERP,
// rendered from the real components (not copies). Import paths are shown next to each demo.
import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { toast } from "sonner";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  Boxes, Building2, ChevronDown, ChevronRight, FileText, Inbox, LayoutDashboard, MoreHorizontal, Plus, Receipt,
  RotateCcw, Settings, ShoppingCart, TrendingUp, Users, Wallet, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateField } from "@/components/ui/date-field";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StatsRowSkeleton, TableSkeleton } from "@/components/ui/loading-skeletons";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SearchInput } from "@/components/SearchInput";
import { DashboardSidebar, type SidebarSection } from "@/components/dashboard/DashboardSidebar";
import { ModuleTabs } from "@/components/dashboard/ModuleTabs";
import { StatCard as FinanceStatCard } from "@/components/finance/StatCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

// Chart builds its dataset from the local clock/timezone, so render it client-only to avoid hydration mismatches.
const AnalyticsExplorerChart = dynamic(
  () => import("@/components/charts/AnalyticsExplorerChart").then((m) => m.AnalyticsExplorerChart),
  { ssr: false, loading: () => <Skeleton className="h-[640px] w-full rounded-none" /> },
);

const TOC = [
  ["brand", "Brandbook"],
  ["tokens", "Theme tokens"],
  ["navigation", "Navigation"],
  ["containers", "Containers & layout"],
  ["actions", "Buttons & badges"],
  ["forms", "Forms"],
  ["overlays", "Overlays & feedback"],
  ["data", "Data display"],
  ["charts", "Charts & analytics"],
  ["pie", "Pie chart"],
  ["motion", "Motion · entrance"],
  ["interaction", "Motion · interaction"],
  ["preloader", "Preloader"],
] as const;

const SIDEBAR: SidebarSection[] = [
  { items: [{ title: "Dashboard", href: "/ui-kit", icon: LayoutDashboard }] },
  {
    title: "Finance",
    items: [
      { title: "Invoices", href: "/ui-kit#invoices", icon: Receipt, badge: 12 },
      { title: "Payments", href: "/ui-kit#payments", icon: Wallet },
      { title: "Reports", href: "/ui-kit#reports", icon: FileText },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Inventory", href: "/ui-kit#inventory", icon: Boxes },
      { title: "Purchase", href: "/ui-kit#purchase", icon: ShoppingCart },
      { title: "Settings", href: "/ui-kit#settings", icon: Settings, disabled: true },
    ],
  },
];

const MODULES = [
  { id: "finance", title: "Finance", href: "finance" },
  { id: "sales", title: "Sales", href: "sales" },
  { id: "crm", title: "CRM", href: "crm" },
  { id: "inventory", title: "Inventory", href: "inventory" },
  { id: "hr", title: "HR", href: "hr" },
];

const INVOICES = [
  { no: "INV-2026-0142", party: "Northstar Retail Pvt Ltd", date: "18 Nov 2026", amount: 248500, status: "Paid" },
  { no: "INV-2026-0141", party: "Kavya Textiles", date: "16 Nov 2026", amount: 96200, status: "Overdue" },
  { no: "INV-2026-0140", party: "Bluepeak Logistics", date: "12 Nov 2026", amount: 1312000, status: "Draft" },
  { no: "INV-2026-0139", party: "Arora & Sons", date: "09 Nov 2026", amount: 54750, status: "Paid" },
];
const STATUS_TONE: Record<string, string> = {
  Paid: "border-(--positive)/40 text-(--positive)",
  Overdue: "border-(--negative)/40 text-(--negative-text)",
  Draft: "border-border text-muted-foreground",
};
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function UiKitPage() {
  const [moduleId, setModuleId] = useState("finance");
  const [search, setSearch] = useState("");
  const [analyticsTab, setAnalyticsTab] = useState<"overview" | "modules" | "flows">("modules");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-8 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <Logo width={110} height={28} />
          <div className="flex items-center gap-3 font-mono text-[12px] text-muted-foreground">
            {/* CSS-driven label so the server render (dark default) never mismatches a persisted light theme */}
            <span className="dark:hidden">Light mode</span><span className="hidden dark:inline">Dark mode</span>
            <ThemeToggle />
          </div>
        </div>
        <p className="mt-8 font-mono text-[11px] uppercase text-muted-foreground">Aupulens ERP · Developer reference</p>
        <h1 className="mt-2 text-4xl tracking-[-0.05em]">UI Kit</h1>
        <p className="mt-2 max-w-3xl font-mono text-sm text-muted-foreground">
          Every shared container, navigation pattern and primitive used in the ERP, rendered from the real components.
          Copy the import path shown under each block.
        </p>
      </header>

      <div className="lg:grid lg:grid-cols-[220px_1fr]">
        {/* In-page navigation: sticky rail on desktop, scrolling strip on mobile */}
        <nav aria-label="UI kit sections" className="sticky top-0 z-10 border-b border-border bg-background lg:h-screen lg:border-b-0 lg:border-r">
          <ul className="flex gap-1 overflow-x-auto px-4 py-3 font-mono text-[13px] lg:flex-col lg:px-4 lg:py-6">
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block whitespace-nowrap px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">{label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 space-y-16 px-4 py-10 sm:px-8">
          {/* ───────────────────────── Brandbook ───────────────────────── */}
          <Section id="brand" title="Brandbook" note="From brandbook/aupulens-branding.pdf (2025). The brand palette below is fixed and is the dark-surface identity; it does not change with the theme toggle.">
            <BrandBook />
          </Section>

          {/* ───────────────────────── Theme tokens ───────────────────────── */}
          <Section id="tokens" title="Theme tokens" note="What developers actually use. Semantic classes switch between light and dark automatically (toggle at the top of the page). Never hard-code brand hex in components — light mode uses the brand off-white #F2F2F2 canvas and darkened accents to stay readable.">
            <ThemeTokens />
            <div className="space-y-3 border border-border p-6">
              <p className="font-sans text-4xl tracking-[-0.05em]">Page title · Roboto 400 · 36px</p>
              <p className="font-sans text-2xl tracking-[-0.05em]">Section title · Roboto 400 · 24px</p>
              <p className="font-sans text-lg tracking-[-0.05em]">Card title · Roboto 400 · 18px</p>
              <p className="font-mono text-sm">Body · Roboto Mono 400 · 14px — descriptions and paragraphs.</p>
              <p className="font-mono text-sm font-medium tabular-nums">₹ 12,48,500.00 · Roboto Mono 500 for amounts</p>
              <p className="font-mono text-[11px] uppercase text-muted-foreground">Compact label · Roboto Mono · 11px uppercase</p>
            </div>
          </Section>

          {/* ───────────────────────── Navigation ───────────────────────── */}
          <Section id="navigation" title="Navigation">
            <Demo label="Module sidebar" path="@/components/dashboard/DashboardSidebar">
              <div className="h-[420px] w-full max-w-[280px] overflow-hidden border border-border">
                <DashboardSidebar sections={SIDEBAR} />
              </div>
            </Demo>
            <Demo label="Top module tabs (header)" path="@/components/dashboard/ModuleTabs" note="Hidden below lg, like in the real header.">
              <div className="border border-border px-4">
                <ModuleTabs modules={MODULES} activeModule={moduleId} onNavigate={setModuleId} />
              </div>
            </Demo>
            <Demo label="Breadcrumbs" path="pattern (inline)">
              <nav aria-label="Breadcrumb" className="flex items-center gap-2 font-mono text-[13px] text-muted-foreground">
                <a href="#navigation" className="hover:text-foreground">Finance</a><ChevronRight className="h-3.5 w-3.5" />
                <a href="#navigation" className="hover:text-foreground">Accounting</a><ChevronRight className="h-3.5 w-3.5" />
                <span aria-current="page" className="text-foreground">Journal entries</span>
              </nav>
            </Demo>
            <Demo label="Page tabs" path="@/components/ui/tabs">
              <Tabs defaultValue="summary">
                <TabsList>
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="ledger">Ledger</TabsTrigger>
                  <TabsTrigger value="audit">Audit log</TabsTrigger>
                </TabsList>
                <TabsContent value="summary" className="font-mono text-sm text-muted-foreground">Summary panel content.</TabsContent>
                <TabsContent value="ledger" className="font-mono text-sm text-muted-foreground">Ledger panel content.</TabsContent>
                <TabsContent value="audit" className="font-mono text-sm text-muted-foreground">Audit log content.</TabsContent>
              </Tabs>
            </Demo>
            <Demo label="Analytics section tabs" path="pattern (used above charts, see Charts)">
              <UnderlineTabs value={analyticsTab} onChange={setAnalyticsTab} />
            </Demo>
            <Demo label="Pagination" path="pattern (inline)">
              <div className="flex items-center justify-between font-mono text-[13px] text-muted-foreground">
                <span>Showing 1–20 of 248</span>
                <div className="flex border border-border">
                  {["‹", "1", "2", "3", "…", "13", "›"].map((p, i) => (
                    <button key={i} type="button" aria-current={p === "1" ? "page" : undefined}
                      className={cn("h-8 min-w-8 border-l border-border px-2 first:border-l-0 hover:bg-muted", p === "1" && "bg-muted text-foreground")}>{p}</button>
                  ))}
                </div>
              </div>
            </Demo>
          </Section>

          {/* ───────────────────────── Containers ───────────────────────── */}
          <Section id="containers" title="Containers & layout">
            <Demo label="Page header" path="pattern (top of every module page)">
              <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-[11px] uppercase text-muted-foreground">Finance · Receivables</p>
                  <h2 className="mt-1 text-3xl tracking-[-0.05em]">Invoices</h2>
                  <p className="mt-1 font-mono text-sm text-muted-foreground">Track billing, collections and overdue accounts.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">Export</Button>
                  <Button size="sm"><Plus className="mr-1.5 h-4 w-4" />New invoice</Button>
                </div>
              </div>
            </Demo>
            <Demo label="Stat cards row" path="@/components/finance/StatCard">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <FinanceStatCard title="Revenue (MTD)" value="₹ 48.2L" icon={TrendingUp} change={{ value: "+12.4%", isPositive: true }} accentColor="success" />
                <FinanceStatCard title="Receivables" value="₹ 16.9L" icon={Wallet} change={{ value: "-3.1%", isPositive: false }} accentColor="warning" />
                <FinanceStatCard title="Active customers" value="1,284" icon={Users} accentColor="primary" />
                <FinanceStatCard title="Branches" value="6" icon={Building2} accentColor="muted" />
              </div>
            </Demo>
            <Demo label="Card" path="@/components/ui/card">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Cash position</CardTitle><CardDescription>Across 4 bank accounts</CardDescription></CardHeader>
                  <CardContent className="font-mono text-2xl tabular-nums">₹ 1,24,80,200</CardContent>
                  <CardFooter className="justify-between font-mono text-xs text-muted-foreground"><span>Updated 2 min ago</span><Button variant="link" size="sm" className="px-0">View ledger</Button></CardFooter>
                </Card>
                <div className="border border-border bg-card p-6">
                  <p className="font-mono text-[11px] uppercase text-muted-foreground">Plain panel</p>
                  <p className="mt-2 font-mono text-sm">bg-card + border-border. Use for grouped content that is not a Card (filters, side info).</p>
                </div>
              </div>
            </Demo>
            <Demo label="Grid layouts" path="Tailwind grid">
              <div className="space-y-3 font-mono text-[11px] text-muted-foreground">
                {[2, 3, 4].map((n) => (
                  <div key={n} className={cn("grid gap-3", n === 2 ? "grid-cols-2" : n === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
                    {Array.from({ length: n }, (_, i) => <div key={i} className="border border-dashed border-border p-4">{n}-col · {i + 1}</div>)}
                  </div>
                ))}
                <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
                  <div className="border border-dashed border-border p-4">Main (2fr) — tables, charts</div>
                  <div className="border border-dashed border-border p-4">Aside (1fr) — summary, activity</div>
                </div>
              </div>
            </Demo>
            <Demo label="Resizable split view" path="@/components/ui/resizable">
              <div className="h-48 border border-border">
                <ResizablePanelGroup direction="horizontal">
                  <ResizablePanel defaultSize={35} className="p-4 font-mono text-sm text-muted-foreground">List</ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={65} className="p-4 font-mono text-sm text-muted-foreground">Detail — drag the handle</ResizablePanel>
                </ResizablePanelGroup>
              </div>
            </Demo>
          </Section>

          {/* ───────────────────────── Actions ───────────────────────── */}
          <Section id="actions" title="Buttons & badges">
            <Demo label="Button variants" path="@/components/ui/button">
              <div className="flex flex-wrap gap-3">
                <Button>Default</Button><Button variant="secondary">Secondary</Button><Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button><Button variant="link">Link</Button><Button variant="destructive">Delete</Button>
                <Button disabled>Disabled</Button>
              </div>
            </Demo>
            <Demo label="Button sizes" path="@/components/ui/button">
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">Small</Button><Button>Default</Button><Button size="lg">Large</Button>
                <Button size="icon" variant="outline" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>
              </div>
            </Demo>
            <Demo label="Badges & status pills" path="@/components/ui/badge">
              <div className="flex flex-wrap gap-3">
                <Badge>Default</Badge><Badge variant="secondary">Secondary</Badge><Badge variant="outline">Outline</Badge><Badge variant="destructive">Destructive</Badge>
                {Object.entries(STATUS_TONE).map(([s, cls]) => <Badge key={s} variant="outline" className={cls}>{s}</Badge>)}
              </div>
            </Demo>
          </Section>

          {/* ───────────────────────── Forms ───────────────────────── */}
          <Section id="forms" title="Forms">
            <div className="grid gap-x-8 gap-y-6 border border-border p-6 md:grid-cols-2">
              <Field label="Customer name" path="@/components/ui/input"><Input placeholder="Northstar Retail Pvt Ltd" /></Field>
              <Field label="GSTIN (error state)" path="@/components/ui/input">
                <Input aria-invalid defaultValue="27AAAC" className="border-(--negative)" />
                <p className="font-mono text-[11px] text-(--negative-text)">GSTIN must be 15 characters.</p>
              </Field>
              <Field label="Payment terms" path="@/components/ui/select">
                <Select defaultValue="net30">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="due">Due on receipt</SelectItem><SelectItem value="net15">Net 15</SelectItem>
                    <SelectItem value="net30">Net 30</SelectItem><SelectItem value="net60">Net 60</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Invoice date" path="@/components/ui/date-field"><DateField defaultValue="2026-11-21" /></Field>
              <Field label="Period" path="@/components/ui/date-range-picker"><DateRangePicker onUpdate={() => {}} className="[&_button]:w-full" /></Field>
              <Field label="Search" path="@/components/SearchInput"><SearchInput value={search} onChange={setSearch} placeholder="Search invoices..." /></Field>
              <Field label="Notes" path="@/components/ui/textarea" className="md:col-span-2"><Textarea placeholder="Internal notes for this invoice" /></Field>
              <Field label="Options" path="@/components/ui/checkbox · switch">
                <div className="space-y-3 font-mono text-sm">
                  <label className="flex items-center gap-2"><Checkbox defaultChecked /> Send copy to customer</label>
                  <label className="flex items-center gap-2"><Switch defaultChecked /> Auto-reminders</label>
                </div>
              </Field>
              <Field label="Tax treatment" path="@/components/ui/radio-group">
                <RadioGroup defaultValue="intra" className="font-mono text-sm">
                  <label className="flex items-center gap-2"><RadioGroupItem value="intra" /> Intra-state (CGST + SGST)</label>
                  <label className="flex items-center gap-2"><RadioGroupItem value="inter" /> Inter-state (IGST)</label>
                </RadioGroup>
              </Field>
            </div>
          </Section>

          {/* ───────────────────────── Overlays ───────────────────────── */}
          <Section id="overlays" title="Overlays & feedback">
            <div className="flex flex-wrap gap-3">
              <Dialog>
                <DialogTrigger asChild><Button variant="outline">Dialog</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Record payment</DialogTitle><DialogDescription>Apply a receipt against INV-2026-0141.</DialogDescription></DialogHeader>
                  <Input placeholder="Amount" />
                  <DialogFooter><Button>Save</Button></DialogFooter>
                </DialogContent>
              </Dialog>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="outline">Confirm dialog</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Void this invoice?</AlertDialogTitle><AlertDialogDescription>The ledger entries will be reversed. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction>Void invoice</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Sheet>
                <SheetTrigger asChild><Button variant="outline">Side sheet</Button></SheetTrigger>
                <SheetContent><SheetHeader><SheetTitle>Invoice details</SheetTitle><SheetDescription>Drawer used for record previews and filters.</SheetDescription></SheetHeader></SheetContent>
              </Sheet>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline">Dropdown menu</Button></DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Invoice</DropdownMenuLabel><DropdownMenuSeparator />
                  <DropdownMenuItem>Duplicate<DropdownMenuShortcut>⌘D</DropdownMenuShortcut></DropdownMenuItem>
                  <DropdownMenuItem>Download PDF</DropdownMenuItem>
                  <DropdownMenuItem className="text-(--negative-text)">Void</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Popover>
                <PopoverTrigger asChild><Button variant="outline">Popover</Button></PopoverTrigger>
                <PopoverContent className="font-mono text-sm">Inline help, quick filters or a small form.</PopoverContent>
              </Popover>
              <Button variant="outline" onClick={() => toast.success("Invoice saved", { description: "INV-2026-0143 created." })}>Toast: success</Button>
              <Button variant="outline" onClick={() => toast.error("Payment failed", { description: "Bank rejected the mandate." })}>Toast: error</Button>
            </div>
            <Demo label="Inline alerts" path="pattern (inline)">
              <div className="space-y-2 font-mono text-sm">
                {[["var(--info)", "Info", "GST returns for October are ready to file."], ["var(--warning)", "Warning", "3 invoices are due in 2 days."], ["var(--negative-text)", "Error", "Bank feed disconnected. Re-authenticate to resume sync."]].map(([c, t, m]) => (
                  <div key={t} role={t === "Error" ? "alert" : "status"} className="border border-border border-l-2 bg-card px-4 py-3" style={{ borderLeftColor: c }}>
                    <span style={{ color: c }}>{t}</span> <span className="text-muted-foreground">— {m}</span>
                  </div>
                ))}
              </div>
            </Demo>
          </Section>

          {/* ───────────────────────── Data display ───────────────────────── */}
          <Section id="data" title="Data display">
            <Demo label="Data table" path="@/components/ui/table" note="Right-align amounts; use tabular-nums.">
              <div className="border border-border">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Invoice</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow>
                  </TableHeader>
                  <TableBody className="font-mono text-[13px]">
                    {INVOICES.map((r) => (
                      <TableRow key={r.no}>
                        <TableCell>{r.no}</TableCell><TableCell>{r.party}</TableCell><TableCell className="text-muted-foreground">{r.date}</TableCell>
                        <TableCell className="text-right tabular-nums">{inr.format(r.amount)}</TableCell>
                        <TableCell><Badge variant="outline" className={STATUS_TONE[r.status]}>{r.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Demo>
            <Demo label="Avatars, separators, key-value list" path="@/components/ui/avatar · separator">
              <div className="flex flex-wrap items-center gap-6 font-mono text-sm">
                <div className="flex -space-x-2">{["AS", "RK", "MP"].map((i) => <Avatar key={i} className="border border-background"><AvatarFallback>{i}</AvatarFallback></Avatar>)}</div>
                <Separator orientation="vertical" className="h-10" />
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
                  <dt className="text-muted-foreground">Owner</dt><dd>Accounts team</dd>
                  <dt className="text-muted-foreground">Due</dt><dd>30 Nov 2026</dd>
                </dl>
              </div>
            </Demo>
            <Demo label="Loading skeletons" path="@/components/ui/loading-skeletons">
              <div className="space-y-4"><StatsRowSkeleton count={4} /><TableSkeleton rows={3} columns={4} /></div>
            </Demo>
            <Demo label="Empty state" path="pattern (inline)">
              <div className="flex flex-col items-center border border-dashed border-border px-6 py-12 text-center">
                <Inbox className="h-6 w-6 text-muted-foreground" />
                <p className="mt-3 font-sans text-lg tracking-[-0.05em]">No invoices yet</p>
                <p className="mt-1 max-w-sm font-mono text-sm text-muted-foreground">Create your first invoice or import from Tally to see it here.</p>
                <Button size="sm" className="mt-4"><Plus className="mr-1.5 h-4 w-4" />New invoice</Button>
              </div>
            </Demo>
          </Section>

          {/* ───────────────────────── Charts ───────────────────────── */}
          <Section id="charts" title="Charts & analytics" note="Stock-chart style explorer with dummy data (3 years of inter-module transactions). Scroll to zoom, drag to pan, use the navigator strip to jump through history.">
            <div>
              <p className="font-mono text-[12px] text-muted-foreground">Charts &amp; Analytics</p>
              <UnderlineTabs value={analyticsTab} onChange={setAnalyticsTab} large />
            </div>
            <Demo label="Analytics explorer" path="@/components/charts/AnalyticsExplorerChart · data/logic: @/lib/charts/flowExplorer">
              <AnalyticsExplorerChart key={analyticsTab} defaultType={analyticsTab === "overview" ? "line" : analyticsTab === "flows" ? "area" : "bar"} />
            </Demo>
          </Section>

          {/* ───────────────────────── Pie chart ───────────────────────── */}
          <Section id="pie" title="Pie chart" note="Part-to-whole only, at most 5–6 slices; group the rest into “Others”. Colours come from --chart-1…5 so they switch with the theme. Always pair the chart with a legend that shows exact values.">
            <Demo label="Donut with legend" path="recharts · PieChart + Pie + Cell · colours: var(--chart-1…5)" note="Hover a slice or a legend row to focus it.">
              <ExpensePie />
            </Demo>
          </Section>

          {/* ───────────────────────── Motion · entrance ───────────────────────── */}
          <Section id="motion" title="Motion · entrance & status" note="CSS utilities from app/globals.css. Entrances use cubic-bezier(0.16, 1, 0.3, 1) over 750ms with 60–80ms staggers. Motion is skipped when the OS asks for reduced motion.">
            <MotionEntrance />
          </Section>

          {/* ───────────────────────── Motion · interaction ───────────────────────── */}
          <Section id="interaction" title="Motion · interaction" note="framer-motion for state changes. Keep UI transitions at 150–250ms; indicators use the ModuleTabs spring (stiffness 450, damping 36, mass 0.7). Wrapped in <MotionConfig reducedMotion=&quot;user&quot;>.">
            <MotionConfig reducedMotion="user">
              <MotionInteraction />
            </MotionConfig>
          </Section>

          {/* ───────────────────────── Preloader ───────────────────────── */}
          <Section id="preloader" title="Preloader" note="App start splash, shown once while the workspace boots. Fixed dark brand surface (like the brandbook plates): a blurred field of black/grey/white/blue pixels (with sparse purple) sweeps in left to right, the status line names the current step and a 1px bar tracks progress. With reduced motion it renders complete.">
            <Demo label="Start-up splash" path="pattern (inline) · brand palette, not theme tokens">
              <Preloader />
            </Demo>
          </Section>
        </main>
      </div>
    </div>
  );
}

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-6">
      <div className="border-b border-border pb-3">
        <h2 className="text-2xl tracking-[-0.05em]">{title}</h2>
        {note && <p className="mt-1 max-w-3xl font-mono text-[13px] text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Demo({ label, path, note, children }: { label: string; path: string; note?: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-sans text-lg tracking-[-0.05em]">{label}</p>
        <code className="font-mono text-[11px] text-muted-foreground">{path}</code>
      </div>
      {note && <p className="font-mono text-[12px] text-muted-foreground">{note}</p>}
      {children}
    </div>
  );
}

function Field({ label, path, className, children }: { label: string; path: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label className="font-mono text-[12px]">{label}</Label>
        <code className="truncate font-mono text-[10px] text-muted-foreground">{path}</code>
      </div>
      {children}
    </div>
  );
}

type AnalyticsTab = "overview" | "modules" | "flows";
function UnderlineTabs({ value, onChange, large }: { value: AnalyticsTab; onChange: (v: AnalyticsTab) => void; large?: boolean }) {
  const tabs: [AnalyticsTab, string][] = [["overview", "Overview"], ["modules", "Modules"], ["flows", "Module Flows"]];
  return (
    <div role="tablist" className="flex items-center overflow-x-auto">
      {tabs.map(([k, label], i) => (
        <span key={k} className="flex items-center">
          {i > 0 && <span className="mx-5 h-5 w-px bg-border" />}
          <button type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}
            className={cn("whitespace-nowrap font-sans tracking-[-0.05em] transition-colors", large ? "text-3xl" : "text-xl",
              value === k ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        </span>
      ))}
    </div>
  );
}

// ───────────────────────── Brandbook (brandbook/aupulens-branding.pdf) ─────────────────────────
const LOGO_RATIO = 890 / 228; // public/logo-white.png & logo-dark.png
const EMBLEM_RATIO = 428 / 397; // public/logo.png

const BRAND_COLORS: { group: string; items: [string, string, string, string][] }[] = [
  { group: "A/ Text", items: [["Primary", "#F2F2F2", "242, 242, 242", "0, 0%, 94.9%"], ["Secondary", "#757575", "117, 117, 117", "0, 0%, 45.9%"], ["Tertiary", "#525252", "82, 82, 82", "0, 0%, 32.2%"]] },
  { group: "B/ Background", items: [["Primary", "#0A0A0A", "10, 10, 10", "0, 0%, 3.9%"], ["Secondary", "#161616", "22, 22, 22", "0, 0%, 8.6%"]] },
  { group: "C/ Lines", items: [["Primary", "#272727", "39, 39, 39", "0, 0%, 15.3%"]] },
  {
    group: "D/ Code / Accent", items: [
      ["Yellow", "#F1DF38", "241, 223, 56", "54.2, 86.9%, 58.2%"], ["Red", "#F56868", "245, 104, 104", "0, 87.6%, 68.4%"],
      ["Purple", "#A77DFF", "167, 125, 255", "259.4, 100%, 74.5%"], ["Blue", "#6CADF5", "108, 173, 245", "211.5, 87.3%, 69.2%"],
      ["Green", "#8AE06C", "138, 224, 108", "104.5, 65.2%, 65.1%"],
    ],
  },
];

const KW = "#A77DFF", STR = "#6CADF5", FN = "#F56868", TXT = "#F2F2F2", CMT = "#757575", PUN = "#525252";
const CODE: [string, string][][] = [
  [["// Post a sales invoice to the ledger", CMT]],
  [["import", KW], [" { postVoucher } ", TXT], ["from", KW], [" \"@/lib/finance\"", STR], [";", PUN]],
  [["export async function", KW], [" postInvoice", FN], ["(", PUN], ["id: string", TXT], [") {", PUN]],
  [["  const", KW], [" total = ", TXT], ["await", KW], [" sumLines", FN], ["(", PUN], ["id", TXT], [");", PUN]],
  [["  return", KW], [" postVoucher", FN], ["({ ", PUN], ["type: ", TXT], ["\"sales\"", STR], [", ", PUN], ["total", TXT], [" });", PUN]],
  [["}", PUN]],
];

function Plate({ label, light, children, className }: { label: string; light?: boolean; children: ReactNode; className?: string }) {
  return (
    <figure className="border border-border">
      <div className={cn("flex min-h-40 items-center justify-center p-8", light ? "bg-[#F2F2F2]" : "bg-[#0A0A0A]", className)}>{children}</div>
      <figcaption className="border-t border-border px-4 py-3 font-mono text-[11px] uppercase text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

function BrandLogo({ h, light }: { h: number; light?: boolean }) {
  return <Image src={light ? "/logo-dark.png" : "/logo-white.png"} alt="Aupulens" height={h} width={Math.round(h * LOGO_RATIO)} unoptimized />;
}

const TYPE_SPECS: { name: string; use: string; spec: string; sample: ReactNode }[] = [
  { name: "A/ Roboto", use: "Headlines", spec: "Regular only · letter spacing −5%", sample: <p className="font-sans text-4xl tracking-[-0.05em]">Planning systems</p> },
  { name: "B/ Roboto Mono", use: "Description, paragraphs, code", spec: "Regular & Medium · letter spacing 0%", sample: <p className="font-mono text-sm">Make data-driven decisions <span className="font-medium">faster</span>.</p> },
  { name: "C/ Roboto Mono (caps)", use: "Small headings, buttons, highlights", spec: "Regular & Medium · letter spacing 0%", sample: <p className="font-mono text-sm font-medium uppercase">Post voucher</p> },
];

function BrandBook() {
  return (
    <div className="space-y-12">
      <p className="max-w-3xl font-mono text-sm text-muted-foreground">
        Aupulens is an AI-native ERP: <span className="text-foreground">powerful and user-friendly</span>. The identity is restrained and
        technical — near-black surfaces, near-white type, thin lines and small, meaningful accents.
      </p>

      <Demo label="Logo versions" path="public/logo-white.png · logo-dark.png · logo.png — <Logo /> picks by theme">
        <div className="grid gap-4 md:grid-cols-3">
          <Plate label="A/ Logo · white on dark (primary)"><BrandLogo h={40} /></Plate>
          <Plate label="A/ Logo · black on off-white" light><BrandLogo h={40} light /></Plate>
          <Plate label="B/ Emblem · avatars only"><Image src="/logo.png" alt="Aupulens emblem" height={64} width={Math.round(64 * EMBLEM_RATIO)} unoptimized /></Plate>
        </div>
        <ul className="grid gap-x-8 gap-y-1 font-mono text-[13px] text-muted-foreground md:grid-cols-2">
          <li>— Use the full logo first; the emblem only where the name cannot fit (e.g. social avatar).</li>
          <li>— White logo on black/dark surfaces; black logo on white/light surfaces.</li>
          <li>— No effects, shadows, gradients or opacity changes.</li>
          <li>— Never outline, recolour, stretch or redraw the logo.</li>
        </ul>
      </Demo>

      <div className="grid gap-8 lg:grid-cols-2">
        <Demo label="Safe zone" path="brandbook p.5">
          <Plate label="Clear space = letters “a” / “l” of the wordmark">
            <div className="border border-dashed border-[#757575] p-5"><div className="outline outline-1 outline-[#525252]"><BrandLogo h={40} /></div></div>
          </Plate>
          <p className="font-mono text-[12px] text-muted-foreground">In code: keep at least half the logo height free on every side (implementation approximation).</p>
        </Demo>
        <Demo label="Minimum size" path="brandbook p.6">
          <Plate label="Logo ≥ 24px · Emblem ≥ 16px" className="flex-col items-start gap-5">
            {[40, 32, 24].map((h) => (
              <div key={h} className="flex items-center gap-4 font-mono text-[11px] text-[#757575]">
                <span className="w-14">{h}px</span><BrandLogo h={h} />
              </div>
            ))}
            <div className="flex items-end gap-4 font-mono text-[11px] text-[#757575]">
              <span className="w-14">emblem</span>
              {[32, 24, 16].map((h) => <Image key={h} src="/logo.png" alt="" height={h} width={Math.round(h * EMBLEM_RATIO)} unoptimized />)}
            </div>
          </Plate>
        </Demo>
      </div>

      <Demo label="Typography" path="brandbook p.8 · fonts loaded in app/fonts.ts">
        <div className="grid gap-4 lg:grid-cols-3">
          {TYPE_SPECS.map(({ name, use, spec, sample }) => (
            <div key={name} className="space-y-4 border border-border bg-card p-6">
              <p className="font-mono text-[11px] uppercase text-muted-foreground">{name}</p>
              <div className="min-h-12">{sample}</div>
              <div className="font-mono text-[12px]"><p>{use}</p><p className="text-muted-foreground">{spec}</p></div>
            </div>
          ))}
        </div>
      </Demo>

      <Demo label="Typography colour" path="brandbook p.9–10">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4 border border-border bg-[#0A0A0A] p-6">
            <p className="font-mono text-[11px] uppercase text-[#757575]">A/ Headlines</p>
            <p className="font-sans text-3xl tracking-[-0.05em] text-[#F2F2F2]">Powering the <span className="text-[#757575]">planning systems</span></p>
            <p className="font-mono text-[12px] text-[#757575]">#F2F2F2 for the headline · #757575 to highlight a word · #525252 when a darker gray is needed.</p>
          </div>
          <div className="space-y-4 border border-border bg-[#0A0A0A] p-6">
            <p className="font-mono text-[11px] uppercase text-[#757575]">B/ Paragraphs</p>
            <p className="font-mono text-sm leading-relaxed text-[#757575]">
              Aupulens ERP integrates with the tools you rely on<span className="text-[#525252]">:</span> connect <span className="text-[#F2F2F2]">Excel</span> for
              imports<span className="text-[#525252]">,</span> <span className="text-[#F2F2F2]">Razorpay</span> for payments <span className="text-[#525252]">(</span>secure<span className="text-[#525252]">)</span> and
              Google Drive for documents<span className="text-[#525252]">.</span>
            </p>
            <p className="font-mono text-[12px] text-[#757575]">Gray #757575 is the paragraph colour · white #F2F2F2 highlights words · dark gray #525252 only for punctuation.</p>
          </div>
        </div>
      </Demo>

      <Demo label="Code" path="brandbook p.11">
        <pre className="overflow-x-auto border border-border bg-[#0A0A0A] p-5 font-mono text-[13px] leading-6">
          {CODE.map((line, i) => (
            <div key={i}><span className="mr-5 inline-block w-4 select-none text-right text-[#525252]">{i + 1}</span>{line.map(([t, c], j) => <span key={j} style={{ color: c }}>{t}</span>)}</div>
          ))}
        </pre>
        <p className="font-mono text-[12px] text-muted-foreground">String #6CADF5 · keyword #A77DFF · function #F56868 · text #F2F2F2 · comment #757575 · line number &amp; punctuation #525252.</p>
      </Demo>

      <Demo label="Digital colours" path="brandbook p.12">
        <div className="space-y-6">
          {BRAND_COLORS.map(({ group, items }) => (
            <div key={group}>
              <p className="mb-2 font-mono text-[11px] uppercase text-muted-foreground">{group}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {items.map(([name, hex, rgb, hsl]) => (
                  <div key={group + name} className="border border-border">
                    <div className="h-16 border-b border-border" style={{ background: hex }} />
                    <div className="space-y-0.5 p-3 font-mono text-[11px]">
                      <p className="text-foreground">{name}</p>
                      <p className="text-muted-foreground">HEX {hex}</p>
                      <p className="text-muted-foreground">RGB {rgb}</p>
                      <p className="text-muted-foreground">HSL {hsl}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Demo>
    </div>
  );
}

// Values mirror app/globals.css (:root = light, .dark = dark). Light accents are darkened for contrast on white.
const TOKENS: [string, string, string, string, string][] = [
  ["bg-background", "--background", "Canvas (off-white in light)", "#F2F2F2", "#0A0A0A"],
  ["bg-card", "--card", "Panels, popovers", "#FAFAFA", "#161616"],
  ["bg-muted", "--muted", "Hover, subtle fill", "#E8E8E8", "#161616"],
  ["border-border", "--border", "Lines, dividers", "#DCDCDC", "#272727"],
  ["text-foreground", "--foreground", "Primary text", "#0A0A0A", "#F2F2F2"],
  ["text-muted-foreground", "--muted-foreground", "Secondary text", "#6B6B6B", "#757575"],
  ["text-(--tertiary-foreground)", "--tertiary-foreground", "Tertiary, punctuation", "#525252", "#525252"],
  ["text-(--positive)", "--positive", "Success, gains", "#2E6F1F", "#8AE06C"],
  ["text-(--warning)", "--warning", "Warnings", "#8A6D00", "#F1DF38"],
  ["text-(--negative-text)", "--negative-text", "Errors, losses", "#B3261E", "#F56868"],
  ["text-(--info)", "--info", "Information", "#1F5FA8", "#6CADF5"],
  ["text-(--ai)", "--ai", "AI features", "#6B46C9", "#A77DFF"],
];

function ThemeTokens() {
  return (
    <div className="overflow-x-auto border border-border">
      <Table>
        <TableHeader>
          <TableRow><TableHead>Live</TableHead><TableHead>Class</TableHead><TableHead>Role</TableHead><TableHead>Light</TableHead><TableHead>Dark</TableHead></TableRow>
        </TableHeader>
        <TableBody className="font-mono text-[13px]">
          {TOKENS.map(([cls, v, role, light, dark]) => (
            <TableRow key={v}>
              <TableCell><span className="block h-6 w-10 border border-border" style={{ background: `var(${v})` }} /></TableCell>
              <TableCell><code>{cls}</code></TableCell>
              <TableCell className="text-muted-foreground">{role}</TableCell>
              {[light, dark].map((hex, i) => (
                <TableCell key={i}><span className="flex items-center gap-2"><span className="h-3 w-3 border border-border" style={{ background: hex }} />{hex}</span></TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ───────────────────────── Pie chart ─────────────────────────
const EXPENSES = [
  { name: "Payroll", value: 1840000, color: "var(--chart-4)" },
  { name: "Inventory", value: 1260000, color: "var(--chart-1)" },
  { name: "Rent & utilities", value: 420000, color: "var(--chart-2)" },
  { name: "Marketing", value: 310000, color: "var(--chart-5)" },
  { name: "Logistics", value: 270000, color: "var(--chart-3)" },
];
const EXPENSE_TOTAL = EXPENSES.reduce((s, e) => s + e.value, 0);

function ExpensePie() {
  const [active, setActive] = useState<number | null>(null);
  const reduce = useReducedMotion();
  const dim = (i: number) => (active === null || active === i ? 1 : 0.3);
  return (
    <div className="grid items-center gap-6 border border-border bg-card p-6 lg:grid-cols-[280px_1fr]">
      <div role="img" aria-label={`Expenses by category, total ${inr.format(EXPENSE_TOTAL)}`} className="relative mx-auto h-[260px] w-full max-w-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={EXPENSES} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={1}
              stroke="var(--card)" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={!reduce}
              onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(null)}>
              {EXPENSES.map((e, i) => <Cell key={e.name} fill={e.color} fillOpacity={dim(i)} />)}
            </Pie>
            <Tooltip content={({ active: on, payload }) => on && payload?.[0] ? (
              <div className="border border-border bg-card px-3 py-2 font-mono text-[13px] text-card-foreground">
                <span className="text-muted-foreground">{payload[0].name}:</span> {inr.format(Number(payload[0].value))}
              </div>
            ) : null} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-mono text-[11px] uppercase text-muted-foreground">Total · Nov</p>
          <p className="font-mono text-lg font-medium tabular-nums">{inr.format(EXPENSE_TOTAL)}</p>
        </div>
      </div>
      <ul className="font-mono text-[13px]" onMouseLeave={() => setActive(null)}>
        {EXPENSES.map((e, i) => (
          <li key={e.name} onMouseEnter={() => setActive(i)} style={{ opacity: dim(i) }}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 border-b border-border py-2.5 transition-opacity last:border-b-0">
            <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0" style={{ background: e.color }} />{e.name}</span>
            <span className="text-right tabular-nums text-muted-foreground">{((e.value / EXPENSE_TOTAL) * 100).toFixed(1)}%</span>
            <span className="text-right tabular-nums">{inr.format(e.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────────────────── Motion ─────────────────────────
// Literal class names so the delays stay greppable next to app/globals.css.
const DELAYS = ["chart-delay-1", "chart-delay-2", "chart-delay-3", "chart-delay-4", "chart-delay-5", "chart-delay-6"];

function MotionEntrance() {
  const [run, setRun] = useState(0);
  const reduce = useReducedMotion();
  return (
    <>
      <Demo label="Staggered entrance" path=".chart-animate-in + .chart-delay-1…6" note="Use for cards and charts on first paint, never on every re-render.">
        <Button variant="outline" size="sm" onClick={() => setRun((r) => r + 1)}><RotateCcw className="mr-1.5 h-4 w-4" />Replay</Button>
        <div key={run} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {DELAYS.map((d, i) => (
            <div key={d} className={cn("border border-border bg-card p-4", !reduce && cn("chart-animate-in", d))}>
              <p className="font-mono text-[11px] uppercase text-muted-foreground">Card {i + 1}</p>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </Demo>
      <div className="grid gap-8 lg:grid-cols-2">
        <Demo label="Live status beacon" path=".chart-beacon">
          <div className="flex items-center gap-3 border border-border bg-card px-4 py-3 font-mono text-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className={cn("absolute inset-0 bg-(--positive)", !reduce && "chart-beacon")} />
              <span className="relative h-2.5 w-2.5 bg-(--positive)" />
            </span>
            Bank feed syncing <span className="text-muted-foreground">— HDFC ••4021</span>
          </div>
        </Demo>
        <Demo label="AI accent sweep" path=".chart-shimmer-border" note="Reserved for AI-generated content.">
          <div className={cn("border border-border bg-card px-4 py-3 font-mono text-sm", !reduce && "chart-shimmer-border")}>
            <span className="text-(--ai)">AI</span> <span className="text-muted-foreground">— Receivables are 3.1% lower than last month.</span>
          </div>
        </Demo>
      </div>
    </>
  );
}

const SEGMENTS = ["Day", "Week", "Month", "Quarter"] as const;
const SAMPLE_LINES = ["Cotton fabric · 120 m", "Zip fasteners · 500 pcs", "Packaging boxes · 80 pcs", "Thread spools · 40 pcs"];

function MotionInteraction() {
  const [segment, setSegment] = useState<(typeof SEGMENTS)[number]>("Week");
  const [lines, setLines] = useState([{ id: 1, item: SAMPLE_LINES[0] }, { id: 2, item: SAMPLE_LINES[1] }]);
  const [open, setOpen] = useState(false);
  const addLine = () => setLines((ls) => {
    const id = Math.max(0, ...ls.map((l) => l.id)) + 1;
    return [...ls, { id, item: SAMPLE_LINES[(id - 1) % SAMPLE_LINES.length] }];
  });
  return (
    <>
      <Demo label="Sliding indicator" path="framer-motion · layoutId (same spring as ModuleTabs)">
        <div role="tablist" aria-label="Period" className="inline-flex border border-border font-mono text-[13px]">
          {SEGMENTS.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={segment === s} onClick={() => setSegment(s)}
              className={cn("relative px-4 py-2 transition-colors", segment === s ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {segment === s && <motion.span layoutId="ui-kit-segment" className="absolute inset-x-0 bottom-0 h-[2px] bg-primary" transition={{ type: "spring", stiffness: 450, damping: 36, mass: 0.7 }} />}
              {s}
            </button>
          ))}
        </div>
      </Demo>
      <div className="grid gap-8 lg:grid-cols-2">
        <Demo label="List enter / exit" path="framer-motion · AnimatePresence">
          <div className="border border-border bg-card">
            <ul className="font-mono text-[13px]">
              <AnimatePresence initial={false}>
                {lines.map((l) => (
                  <motion.li key={l.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
                    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                      <span>{l.item}</span>
                      <button type="button" aria-label={`Remove ${l.item}`} onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                        className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            <div className="p-3"><Button variant="ghost" size="sm" onClick={addLine}><Plus className="mr-1.5 h-4 w-4" />Add line</Button></div>
          </div>
        </Demo>
        <Demo label="Expand / collapse" path="framer-motion · height auto">
          <div className="border border-border bg-card font-mono text-[13px]">
            <button type="button" aria-expanded={open} aria-controls="ui-kit-collapse" onClick={() => setOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-3 hover:bg-muted">
              <span>INV-2026-0141 · Kavya Textiles</span>
              <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}><ChevronDown className="h-4 w-4 text-muted-foreground" /></motion.span>
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div id="ui-kit-collapse" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 border-t border-border px-4 py-3">
                    <dt className="text-muted-foreground">Amount</dt><dd className="tabular-nums">{inr.format(96200)}</dd>
                    <dt className="text-muted-foreground">Due</dt><dd className="text-(--negative-text)">Overdue by 8 days</dd>
                  </dl>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Demo>
      </div>
    </>
  );
}

// ───────────────────────── Preloader ─────────────────────────
const BOOT_STEPS = ["Initializing workspace…", "Reading preferences…", "Loading modules: Finance, Sales, CRM…", "Syncing ledgers…", "Connecting bank feeds…", "Ready"];
const PX_COLS = 30, PX_ROWS = 20; // in the 360×420 portrait box each pixel is a tall ~12×21px rectangle
const PX_RAMP = ["#0A0A0A", "#161616", "#272727", "#525252", "#757575", "#6CADF5", "#F2F2F2"]; // dark → light
const SCAN_SPAN = 85; // the scan crosses the box over 0–85% progress; jitter fills the remaining 15%
// Integer hash (murmur3 fmix) so server and client render identical pixels — Math.random would break hydration.
const hash = (n: number) => {
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b); n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 2 ** 32;
};
const PIXELS = Array.from({ length: PX_COLS * PX_ROWS }, (_, i) => {
  const x = i % PX_COLS, y = Math.floor(i / PX_COLS), r = hash(i + 1);
  // A bright diagonal streak (white/blue core fading to grey/black) plus per-pixel noise, with sparse purple.
  const light = 1 - Math.abs(x / PX_COLS - (y / PX_ROWS) * 0.4 - 0.4) * 2.2 + (r - 0.5) * 0.4;
  const color = r < 0.06 ? "#A77DFF" : PX_RAMP[Math.min(PX_RAMP.length - 1, Math.max(0, Math.round(light * (PX_RAMP.length - 1))))];
  return { color, at: scanAt(x, hash(i + 50_000)) };
});
const PX_GRID = "absolute inset-0 grid gap-px grid-cols-[repeat(30,minmax(0,1fr))] grid-rows-[repeat(20,minmax(0,1fr))]";
function scanAt(x: number, jitter: number) { return (x / PX_COLS) * SCAN_SPAN + jitter * (100 - SCAN_SPAN); }

function Preloader() {
  const [p, setP] = useState(0);
  const reduce = useReducedMotion();
  const shown = reduce ? 100 : p;
  useEffect(() => {
    if (reduce || p >= 100) return;
    const t = setTimeout(() => setP((v) => Math.min(100, v + 1)), 35);
    return () => clearTimeout(t);
  }, [p, reduce]);
  const step = BOOT_STEPS[Math.floor((shown / 100) * (BOOT_STEPS.length - 1))];
  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={() => setP(0)}><RotateCcw className="mr-1.5 h-4 w-4" />Replay</Button>
      <div className="mx-auto max-w-[360px] border border-[#272727] bg-[#0A0A0A]">
        <div className="relative h-[420px] overflow-hidden border-b border-[#272727]" aria-hidden>
          {/* Pixels reveal left → right, flash white, then settle; scale-110 pushes the blur's soft edges outside the clip */}
          <div className={cn(PX_GRID, "scale-110")} style={{ filter: "blur(6px)" }}>
            {PIXELS.map((px, i) => (
              <div key={i} className="transition-colors duration-300"
                style={{ background: shown <= px.at ? "#0A0A0A" : shown - px.at < 3 ? "#F2F2F2" : px.color }} />
            ))}
          </div>
        </div>
        <div className="space-y-6 p-6">
          <div className="flex items-end justify-between gap-4">
            <BrandLogo h={28} />
            <p className="font-mono text-[11px] uppercase text-[#757575]">ERP · 2026.11</p>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between gap-4 font-mono text-[12px]">
              <span className="truncate text-[#757575]" aria-live="polite">{step}</span>
              <span className="tabular-nums text-[#F2F2F2]">{shown}%</span>
            </div>
            <div role="progressbar" aria-label="Starting Aupulens" aria-valuemin={0} aria-valuemax={100} aria-valuenow={shown} className="h-px bg-[#272727]">
              <div className="h-px bg-[#F2F2F2]" style={{ width: `${shown}%` }} />
            </div>
          </div>
          <p className="font-mono text-[11px] text-[#525252]">© 2026 Aupulens. Powering the planning systems.</p>
        </div>
      </div>
    </div>
  );
}
