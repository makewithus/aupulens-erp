"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths,
} from "date-fns";
import {
  ArrowDown, ArrowUp, CalendarDays, ChartArea, ChartColumnStacked, ChartSpline, ChevronDown, ChevronLeft, ChevronRight,
  ChevronsRight, Eye, EyeOff, ZoomIn, ZoomOut,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  DAY_MS, FLOW_MODULES, aggregate, bucketStart, clampView, generateFlowDataset, minSpan, panView, zoomView,
  type Interval, type ModuleKey, type View,
} from "@/lib/charts/flowExplorer";

type ChartType = "area" | "line" | "bar";
type ShowBy = "source" | "destination";

const ALL = FLOW_MODULES.map((m) => m.key) as ModuleKey[];
const Y_AXIS_W = 56; // keep in sync with <YAxis width>; used to map pointer x → plot fraction
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-IN");

const PRESETS: { label: string; range: (end: number) => View }[] = [
  { label: "Today", range: (e) => ({ from: e, to: e }) },
  { label: "Yesterday", range: (e) => ({ from: e - DAY_MS, to: e - DAY_MS }) },
  { label: "Last week", range: (e) => ({ from: e - 7 * DAY_MS, to: e }) },
  { label: "Last month", range: (e) => ({ from: subMonths(e, 1).getTime(), to: e }) },
  { label: "Last 3 months", range: (e) => ({ from: subMonths(e, 3).getTime(), to: e }) },
  { label: "Last 6 months", range: (e) => ({ from: subMonths(e, 6).getTime(), to: e }) },
  { label: "Last year", range: (e) => ({ from: subMonths(e, 12).getTime(), to: e }) },
];

export function AnalyticsExplorerChart({ defaultType = "bar" }: { defaultType?: ChartType }) {
  const ds = useMemo(() => generateFlowDataset(), []);
  const lo = ds.start;
  const hi = ds.start + (ds.days - 1) * DAY_MS; // midnight of the last (today's) bucket
  const defaultView = PRESETS[6].range(hi);

  const [type, setType] = useState<ChartType>(defaultType);
  const [interval, setIntervalKind] = useState<Interval>("day");
  const [showBy, setShowBy] = useState<ShowBy>("source");
  const [src, setSrc] = useState(() => new Set(ALL));
  const [dst, setDst] = useState(() => new Set(ALL));
  const [showSrc, setShowSrc] = useState(true);
  const [showDst, setShowDst] = useState(true);
  const [view, setView] = useState<View>(defaultView);

  const rows = useMemo(() => aggregate(ds, interval, src, dst, showBy), [ds, interval, src, dst, showBy]);
  const first = bucketStart(view.from, interval);
  const visible = useMemo(() => rows.filter((r) => r.t >= first && r.t <= view.to), [rows, first, view.to]);
  const windowTotal = visible.reduce((a, r) => a + r.total, 0);
  const stacked = FLOW_MODULES.filter((m) => (showBy === "source" ? src : dst).has(m.key));
  const ticks = useMemo(() => axisLabels(visible, view), [visible, view]);
  const min = minSpan(interval);

  const reset = () => {
    setType(defaultType); setIntervalKind("day"); setShowBy("source");
    setSrc(new Set(ALL)); setDst(new Set(ALL)); setShowSrc(true); setShowDst(true); setView(defaultView);
  };
  const zoom = (f: number, anchor = 0.5) => setView((v) => zoomView(v, f, anchor, lo, hi, min));
  const pan = (fraction: number) => setView((v) => panView(v, fraction, lo, hi, min));

  // Wheel must be a native non-passive listener so the page doesn't scroll while zooming.
  const plotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const w = rect.width - Y_AXIS_W;
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const d = e.shiftKey ? e.deltaY : e.deltaX;
        setView((v) => panView(v, d / w, lo, hi, min));
      } else {
        const anchor = Math.min(1, Math.max(0, (e.clientX - rect.left) / w));
        setView((v) => zoomView(v, Math.exp(e.deltaY * 0.0015), anchor, lo, hi, min));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [lo, hi, min]);

  const drag = useRef<{ x: number; v: View } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, v: view };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const w = e.currentTarget.getBoundingClientRect().width - Y_AXIS_W;
    setView(panView(drag.current.v, -(e.clientX - drag.current.x) / w, lo, hi, min));
  };
  const endDrag = () => { drag.current = null; };

  const onKeyDown = (e: KeyboardEvent) => {
    const actions: Record<string, () => void> = {
      ArrowLeft: () => pan(-0.1), ArrowRight: () => pan(0.1),
      "+": () => zoom(0.8), "=": () => zoom(0.8), "-": () => zoom(1.25), "0": () => setView(defaultView),
    };
    if (actions[e.key]) { e.preventDefault(); actions[e.key](); }
  };

  const changeInterval = (next: Interval) => {
    setIntervalKind(next);
    setView((v) => clampView(v, lo, hi, minSpan(next)));
  };

  return (
    <div className="border border-border bg-background text-foreground">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-stretch gap-y-3 border-b border-border px-4 py-4 sm:px-6">
        <DateRangeControl view={view} lo={lo} hi={hi} defaultView={defaultView} onApply={(v) => setView(clampView(v, lo, hi, 0))} />
        <ToolbarField label="Source" eye={showSrc} onEye={() => setShowSrc((s) => !s)}>
          <ModuleFilter value={src} onChange={setSrc} />
        </ToolbarField>
        <ToolbarField label="Destination" eye={showDst} onEye={() => setShowDst((s) => !s)}>
          <ModuleFilter value={dst} onChange={setDst} />
        </ToolbarField>
        <ToolbarField label="Show by">
          <Choice value={showBy} onChange={(v) => setShowBy(v as ShowBy)} options={{ source: "Source Module", destination: "Destination Module" }} />
        </ToolbarField>
        <ToolbarField label="Interval">
          <Choice value={interval} onChange={(v) => changeInterval(v as Interval)} options={{ day: "Day", week: "Week", month: "Month" }} />
        </ToolbarField>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex border border-border" role="radiogroup" aria-label="Chart type">
            {([
              ["area", ChartArea, "Stacked Area Chart"],
              ["line", ChartSpline, "Line Chart"],
              ["bar", ChartColumnStacked, "Stacked Bar Chart"],
            ] as const).map(([k, Icon, label]) => (
              <button
                key={k} type="button" role="radio" aria-checked={type === k} aria-label={label} title={label}
                onClick={() => setType(k)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center border-l border-border first:border-l-0 transition-colors",
                  type === k ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          <button type="button" onClick={reset} className="font-mono text-sm text-muted-foreground hover:text-foreground">Reset</button>
        </div>
      </div>

      {/* ── Legend rows + window total ── */}
      <div className="flex flex-col gap-2 px-4 pt-4 font-mono text-[13px] sm:flex-row sm:items-start sm:px-6">
        <div className="min-w-0 flex-1 space-y-2">
          {showSrc && <LegendRow icon={<ArrowUp className="h-3.5 w-3.5" />} label="Src" keys={src} chips={type !== "line" && showBy === "source"} />}
          {showDst && <LegendRow icon={<ArrowDown className="h-3.5 w-3.5" />} label="Dst" keys={dst} chips={type !== "line" && showBy === "destination"} />}
        </div>
        <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
          <span className="text-muted-foreground">Transactions</span>
          <span className="h-4 w-px bg-border" />
          <span className="font-medium">{full.format(windowTotal)}</span>
        </div>
      </div>

      {/* ── Plot (wheel = zoom, drag = pan, shift+wheel = pan, dbl-click = reset) ── */}
      <div
        ref={plotRef}
        tabIndex={0}
        role="application"
        aria-label="Transactions chart. Scroll to zoom, drag or use arrow keys to move through time, plus and minus keys to zoom, 0 to reset."
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => setView(defaultView)}
        className="h-[420px] cursor-grab touch-none select-none px-2 pt-4 outline-none focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing sm:px-4"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={visible} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barCategoryGap={visible.length > 60 ? 1 : "20%"}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="t" interval={0} tickLine={false} axisLine={false} tickMargin={12} height={36}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12, fontFamily: "var(--font-roboto-mono)" }}
              tickFormatter={(t: number) => ticks.get(t) ?? ""}
            />
            <YAxis
              orientation="right" width={Y_AXIS_W} tickLine={false} axisLine={false} tickCount={7}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12, fontFamily: "var(--font-roboto-mono)" }}
              tickFormatter={(v: number) => compact.format(v)}
            />
            <Tooltip
              isAnimationActive={false}
              cursor={type === "line" ? { stroke: "var(--muted-foreground)", strokeWidth: 1 } : { fill: "var(--muted)", opacity: 0.4 }}
              content={({ active, payload }) => active && payload?.length
                ? <FlowTooltip row={payload[0].payload} interval={interval} series={stacked} showBy={showBy} /> : null}
            />
            {type === "bar" && stacked.map((m) => (
              <Bar key={m.key} dataKey={m.key} stackId="s" fill={m.color} isAnimationActive={false} maxBarSize={120} />
            ))}
            {type === "area" && stacked.map((m) => (
              <Area key={m.key} dataKey={m.key} stackId="s" type="monotone" stroke={m.color} fill={m.color} fillOpacity={0.35} strokeWidth={1} isAnimationActive={false} />
            ))}
            {type === "line" && (
              <Line dataKey="total" type="linear" stroke="var(--foreground)" strokeWidth={1.5} dot={false}
                activeDot={{ r: 3, fill: "var(--background)", stroke: "var(--foreground)" }} isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Stock-style navigation: buttons + overview navigator ── */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 sm:px-6">
        <div className="flex border border-border">
          <NavButton label="Jump to start" onClick={() => setView((v) => clampView({ from: lo, to: lo + v.to - v.from }, lo, hi, min))}><ChevronsRight className="h-4 w-4 rotate-180" /></NavButton>
          <NavButton label="Move to the past" onClick={() => pan(-0.25)}><ChevronLeft className="h-4 w-4" /></NavButton>
          <NavButton label="Zoom out" onClick={() => zoom(1.5)}><ZoomOut className="h-4 w-4" /></NavButton>
          <NavButton label="Zoom in" onClick={() => zoom(1 / 1.5)}><ZoomIn className="h-4 w-4" /></NavButton>
          <NavButton label="Move to the future" onClick={() => pan(0.25)}><ChevronRight className="h-4 w-4" /></NavButton>
          <NavButton label="Jump to latest" onClick={() => setView((v) => clampView({ from: hi - (v.to - v.from), to: hi }, lo, hi, min))}><ChevronsRight className="h-4 w-4" /></NavButton>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">
          Scroll to zoom · drag or ←/→ to move · Shift+scroll to pan · double-click to reset
        </p>
      </div>
      <Navigator rows={rows} view={view} lo={lo} hi={hi} onChange={(v) => setView(clampView(v, lo, hi, min))} />
    </div>
  );
}

/** Pick ~10 calendar-aligned tick labels for the visible window. */
function axisLabels(rows: { t: number }[], view: View): Map<number, string> {
  const span = view.to - view.from;
  const unit = span > 120 * DAY_MS ? "month" : span > 21 * DAY_MS ? "week" : "day";
  const fmt = unit === "month" ? "MMM ''yy" : "d MMM";
  const candidates = rows.filter((r, i) => {
    if (i === 0) return unit === "day";
    const prev = new Date(rows[i - 1].t), cur = new Date(r.t);
    if (unit === "month") return prev.getMonth() !== cur.getMonth();
    if (unit === "week") return startOfWeek(prev).getTime() !== startOfWeek(cur).getTime();
    return true;
  });
  const stride = Math.max(1, Math.ceil(candidates.length / 10));
  return new Map(candidates.filter((_, i) => i % stride === 0).map((r) => [r.t, format(r.t, fmt)]));
}

function FlowTooltip({ row, interval, series, showBy }: {
  row: Record<string, number>; interval: Interval; series: readonly (typeof FLOW_MODULES)[number][]; showBy: ShowBy;
}) {
  const label = interval === "month" ? format(row.t, "MMMM yyyy") : interval === "week" ? `Week of ${format(row.t, "d MMMM yyyy")}` : format(row.t, "d MMMM yyyy");
  return (
    <div className="min-w-[240px] border border-border bg-card px-4 py-3 font-mono text-[13px] text-card-foreground">
      <p className="mb-2 text-muted-foreground">{label}</p>
      <div className="flex justify-between gap-6">
        <span className="flex items-center gap-2 text-muted-foreground"><span className="h-2.5 w-2.5 bg-foreground" />Total transactions:</span>
        <span>{full.format(row.total)}</span>
      </div>
      <p className="mb-1 mt-2">{showBy === "source" ? "Source modules:" : "Destination modules:"}</p>
      <ul className="space-y-1">
        {series.map((m) => (
          <li key={m.key} className="flex justify-between gap-6">
            <span className="flex items-center gap-2 text-muted-foreground"><span className="h-2.5 w-2.5" style={{ background: m.color }} />{m.name}:</span>
            <span>{row[m.key] ? full.format(row[m.key]) : "-"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LegendRow({ icon, label, keys, chips }: { icon: ReactNode; label: string; keys: Set<ModuleKey>; chips: boolean }) {
  const mods = FLOW_MODULES.filter((m) => keys.has(m.key));
  return (
    <div className="flex items-start gap-3 text-muted-foreground">
      <span className="flex shrink-0 items-center gap-1 border-r border-border pr-3">{icon}{label}</span>
      {chips ? (
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          {mods.map((m) => <span key={m.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5" style={{ background: m.color }} />{m.name}</span>)}
        </span>
      ) : <span>{mods.map((m) => m.name).join(", ")}</span>}
    </div>
  );
}

function ToolbarField({ label, eye, onEye, children }: { label: string; eye?: boolean; onEye?: () => void; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-border px-4 sm:border-l sm:first:border-l-0">
      <div>
        <p className="font-mono text-[12px] text-muted-foreground">{label}</p>
        {children}
      </div>
      {onEye && (
        <button type="button" onClick={onEye} aria-pressed={eye} aria-label={`${eye ? "Hide" : "Show"} ${label} legend`}
          className="mt-0.5 text-muted-foreground hover:text-foreground">
          {eye ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

const valueTrigger = "flex items-center gap-1.5 py-0.5 text-[15px] text-foreground outline-none focus-visible:underline";

function ModuleFilter({ value, onChange }: { value: Set<ModuleKey>; onChange: (s: Set<ModuleKey>) => void }) {
  const label = value.size === ALL.length ? "All Modules" : value.size === 1 ? FLOW_MODULES.find((m) => value.has(m.key))!.name : `${value.size} Modules`;
  const toggle = (k: ModuleKey) => {
    const next = new Set(value);
    if (next.has(k)) next.delete(k); else next.add(k);
    if (next.size) onChange(next); // keep at least one module selected
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={valueTrigger}>{label}<ChevronDown className="h-4 w-4" /></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 font-mono">
        <DropdownMenuCheckboxItem checked={value.size === ALL.length} onSelect={(e) => e.preventDefault()} onCheckedChange={() => onChange(new Set(ALL))}>
          All Modules
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {FLOW_MODULES.map((m) => (
          <DropdownMenuCheckboxItem key={m.key} checked={value.has(m.key)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => toggle(m.key)}>
            <span className="mr-2 h-2.5 w-2.5" style={{ background: m.color }} />{m.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Choice({ value, options, onChange }: { value: string; options: Record<string, string>; onChange: (v: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={valueTrigger}>{options[value]}<ChevronDown className="h-4 w-4" /></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="font-mono">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {Object.entries(options).map(([k, l]) => <DropdownMenuRadioItem key={k} value={k}>{l}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className="flex h-8 w-8 items-center justify-center border-l border-border text-muted-foreground first:border-l-0 hover:bg-muted hover:text-foreground">
      {children}
    </button>
  );
}

/** Overview strip of the full history with a draggable / resizable window, like a stock-chart navigator. */
function Navigator({ rows, view, lo, hi, onChange }: { rows: { t: number; total: number }[]; view: View; lo: number; hi: number; onChange: (v: View) => void }) {
  const range = hi - lo || 1;
  const left = ((view.from - lo) / range) * 100;
  const width = Math.max(((view.to - view.from) / range) * 100, 0.5);
  const drag = useRef<{ mode: "move" | "l" | "r"; x: number; v: View; w: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mode = (e.target as HTMLElement).dataset.role as "move" | "l" | "r" | undefined;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!mode) { // clicked the track: centre the window there
      const t = lo + ((e.clientX - rect.left) / rect.width) * range, half = (view.to - view.from) / 2;
      onChange({ from: t - half, to: t + half });
      drag.current = { mode: "move", x: e.clientX, v: { from: t - half, to: t + half }, w: rect.width };
      return;
    }
    drag.current = { mode, x: e.clientX, v: view, w: rect.width };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dt = ((e.clientX - d.x) / d.w) * range;
    if (d.mode === "move") onChange({ from: d.v.from + dt, to: d.v.to + dt });
    else if (d.mode === "l") onChange({ from: Math.min(d.v.from + dt, d.v.to), to: d.v.to });
    else onChange({ from: d.v.from, to: Math.max(d.v.to + dt, d.v.from) });
  };
  const end = () => { drag.current = null; };

  return (
    <div className="px-4 pb-4 sm:px-6">
      <div
        className="relative h-12 cursor-pointer touch-none select-none border border-border"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end}
        aria-hidden // keyboard users have the buttons and arrow keys above
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <Area dataKey="total" type="linear" stroke="var(--muted-foreground)" fill="var(--muted-foreground)" fillOpacity={0.15} strokeWidth={1} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div data-role="move" className="absolute inset-y-0 cursor-grab border-x border-foreground/60 bg-foreground/10 active:cursor-grabbing" style={{ left: `${left}%`, width: `${width}%` }}>
          <div data-role="l" className="absolute -left-1.5 inset-y-0 w-3 cursor-ew-resize" />
          <div data-role="r" className="absolute -right-1.5 inset-y-0 w-3 cursor-ew-resize" />
        </div>
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground">
        <span>{format(lo, "MMM yyyy")}</span><span>{format(hi, "MMM yyyy")}</span>
      </div>
    </div>
  );
}

/** Date range button + popover: presets, two-month range calendar, or typed custom dates. */
function DateRangeControl({ view, lo, hi, defaultView, onApply }: { view: View; lo: number; hi: number; defaultView: View; onApply: (v: View) => void }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<string>("Last year");
  const [draft, setDraft] = useState<{ from?: number; to?: number }>(view);
  const [month, setMonth] = useState(() => startOfMonth(view.from));
  const [custom, setCustom] = useState({ from: "", to: "" });

  const openChange = (o: boolean) => {
    if (o) { setDraft(view); setMonth(startOfMonth(view.from)); setCustom({ from: format(view.from, "yyyy-MM-dd"), to: format(view.to, "yyyy-MM-dd") }); }
    setOpen(o);
  };
  const apply = (v: View) => { onApply(v); setOpen(false); };
  const pick = (d: number) => setDraft((r) => (!r.from || r.to !== undefined ? { from: d } : d < r.from ? { from: d, to: r.from } : { from: r.from, to: d }));

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger className="flex items-center gap-3 pr-4 text-[15px] outline-none">
        <CalendarDays className="h-5 w-5 text-muted-foreground" />
        <span className="border-b border-foreground/60 font-mono">{format(view.from, "MMM d, yyyy")} – {format(view.to, "MMM d, yyyy")}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-auto max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-none border-border bg-card p-0 font-mono sm:flex-row">
        <ul className="flex shrink-0 overflow-x-auto bg-background/40 sm:block sm:w-48">
          {[...PRESETS.map((p) => p.label), "Custom"].map((label) => (
            <li key={label}>
              <button type="button"
                onClick={() => { setPreset(label); const p = PRESETS.find((x) => x.label === label); if (p) { const r = p.range(hi); setDraft(r); setMonth(startOfMonth(subMonths(r.to, 1))); } }}
                className={cn("flex w-full items-center justify-between whitespace-nowrap px-5 py-3.5 text-left text-sm", preset === label ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {label}{preset === label && <ChevronRight className="ml-3 hidden h-4 w-4 sm:block" />}
              </button>
            </li>
          ))}
        </ul>
        <div className="p-4 sm:p-5">
          {preset === "Custom" ? (
            <div className="w-[min(560px,80vw)] space-y-4">
              <p className="font-sans text-2xl tracking-[-0.05em]">Enter Date Range</p>
              {(["from", "to"] as const).map((k) => (
                <label key={k} className="block space-y-2 text-sm">
                  <span>{k === "from" ? "Start Date" : "End Date"}</span>
                  <input type="date" value={custom[k]} min={format(lo, "yyyy-MM-dd")} max={format(hi, "yyyy-MM-dd")}
                    onChange={(e) => setCustom((c) => ({ ...c, [k]: e.target.value }))}
                    className="block h-12 w-full border-0 bg-muted px-4 text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring dark:[color-scheme:dark]" />
                </label>
              ))}
              <Footer
                onClear={() => setCustom({ from: "", to: "" })}
                onReset={() => setCustom({ from: format(defaultView.from, "yyyy-MM-dd"), to: format(defaultView.to, "yyyy-MM-dd") })}
                doneLabel="Save" disabled={!custom.from || !custom.to || custom.from > custom.to}
                onDone={() => apply({ from: new Date(custom.from + "T00:00").getTime(), to: new Date(custom.to + "T00:00").getTime() })}
              />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-6 md:flex-row">
                {[month, addMonths(month, 1)].map((m, i) => (
                  <MonthGrid key={i} month={m} draft={draft} lo={lo} hi={hi} onPick={pick}
                    onPrev={i === 0 ? () => setMonth((x) => subMonths(x, 1)) : undefined}
                    onNext={i === 1 ? () => setMonth((x) => addMonths(x, 1)) : undefined} />
                ))}
              </div>
              <Footer
                onClear={() => setDraft({})} onReset={() => { setDraft(defaultView); setPreset("Last year"); }}
                doneLabel="Done" disabled={!draft.from}
                onDone={() => apply({ from: draft.from!, to: draft.to ?? draft.from! })}
              />
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Footer({ onClear, onReset, onDone, doneLabel, disabled }: { onClear: () => void; onReset: () => void; onDone: () => void; doneLabel: string; disabled: boolean }) {
  return (
    <div className="mt-4 flex items-center text-sm">
      <button type="button" onClick={onClear} className="px-3 py-2 text-muted-foreground hover:text-foreground">Clear</button>
      <button type="button" onClick={onReset} className="ml-auto px-3 py-2 text-muted-foreground hover:text-foreground">Reset</button>
      <button type="button" onClick={onDone} disabled={disabled} className="ml-2 bg-foreground px-4 py-2.5 font-medium text-background disabled:opacity-40">{doneLabel}</button>
    </div>
  );
}

function MonthGrid({ month, draft, lo, hi, onPick, onPrev, onNext }: {
  month: Date; draft: { from?: number; to?: number }; lo: number; hi: number; onPick: (t: number) => void; onPrev?: () => void; onNext?: () => void;
}) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) });
  const end = draft.to ?? draft.from;
  return (
    <div className="w-[300px]">
      <div className="mb-3 flex h-9 items-center">
        {onPrev ? <NavButton label="Previous month" onClick={onPrev}><ChevronLeft className="h-4 w-4" /></NavButton> : <span className="w-8" />}
        <p className="flex-1 text-center text-sm font-medium">{format(month, "MMMM   yyyy")}</p>
        {onNext ? <NavButton label="Next month" onClick={onNext}><ChevronRight className="h-4 w-4" /></NavButton> : <span className="w-8" />}
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <span key={d} className="py-2">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
        {days.map((d) => {
          const t = d.getTime();
          const inMonth = isSameMonth(d, month);
          const edge = (draft.from !== undefined && isSameDay(t, draft.from)) || (end !== undefined && isSameDay(t, end));
          const inRange = draft.from !== undefined && end !== undefined && t > draft.from && t < end;
          return (
            <button key={t} type="button" disabled={t < lo || t > hi} onClick={() => onPick(t)}
              className={cn(
                "h-10 disabled:cursor-not-allowed disabled:opacity-30",
                !inMonth && "text-muted-foreground/50",
                inRange && "bg-muted",
                edge ? "bg-foreground text-background" : "hover:bg-muted",
              )}>
              {format(d, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
