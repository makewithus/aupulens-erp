"use client";

export function NetworkDiagram() {
  return (
    <div className="w-full max-w-lg aspect-[1.7/1] relative select-none opacity-80 dark:opacity-90">
      <svg
        viewBox="0 0 440 260"
        className="w-full h-full text-foreground"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="chart-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.08" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Outer Analytics Card */}
        <rect
          x="2"
          y="2"
          width="436"
          height="256"
          rx="8"
          className="stroke-foreground/10 bg-background"
          strokeWidth="1.5"
        />

        {/* Card Header */}
        <text
          x="20"
          y="30"
          className="font-mono text-[9px] uppercase tracking-[0.25em] font-bold fill-foreground/60"
        >
          Charts & Analytics
        </text>

        {/* Active Tabs */}
        <g className="font-mono text-[8px] uppercase tracking-wider font-semibold">
          <text x="20" y="52" className="fill-foreground">Overview</text>
          <text x="75" y="52" className="fill-foreground/30">|</text>
          <text x="90" y="52" className="fill-foreground/30">Integrations</text>
          <text x="170" y="52" className="fill-foreground/30">|</text>
          <text x="185" y="52" className="fill-foreground/30">Departments</text>
          <text x="260" y="52" className="fill-foreground/30">|</text>
          <text x="275" y="52" className="fill-foreground/30">Advanced</text>
        </g>

        {/* Divider below tabs */}
        <line x1="20" y1="62" x2="420" y2="62" className="stroke-foreground/5" strokeWidth="1" />

        {/* Grid Lines */}
        <line x1="20" y1="100" x2="420" y2="100" className="stroke-foreground/5" strokeWidth="0.75" />
        <line x1="20" y1="140" x2="420" y2="140" className="stroke-foreground/5" strokeWidth="0.75" />
        <line x1="20" y1="180" x2="420" y2="180" className="stroke-foreground/5" strokeWidth="0.75" />
        <line x1="20" y1="220" x2="420" y2="220" className="stroke-foreground/5" strokeWidth="0.75" />

        {/* Chart Area Fill */}
        <path
          d="M20,210 L60,205 L100,212 L140,185 L180,192 L220,160 L260,172 L300,125 L340,140 L380,105 L420,115 L420,220 L20,220 Z"
          fill="url(#chart-area-grad)"
          className="text-foreground"
        />

        {/* Chart Line Path */}
        <path
          d="M20,210 L60,205 L100,212 L140,185 L180,192 L220,160 L260,172 L300,125 L340,140 L380,105 L420,115"
          stroke="currentColor"
          className="text-foreground/70"
          strokeWidth="1.5"
          fill="none"
        />

        {/* Crosshair indicator */}
        <line x1="300" y1="78" x2="300" y2="220" stroke="currentColor" className="text-foreground/15" strokeWidth="1" strokeDasharray="3 3" />
        
        {/* Pulsing indicator point */}
        <circle cx="300" cy="125" r="8" stroke="currentColor" strokeWidth="0.5" className="text-foreground/20">
          <animate attributeName="r" values="3;10;3" dur="4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="4s" repeatCount="indefinite" />
        </circle>
        <circle cx="300" cy="125" r="2.5" className="fill-foreground" />

        {/* Tooltip marker indicator text */}
        <text x="300" y="74" textAnchor="middle" className="font-mono text-[7px] tracking-wider fill-foreground/45 uppercase">
          Value: ₹4.20L
        </text>

        {/* Bottom label metrics */}
        <g className="font-mono text-[7px] fill-foreground/30 tracking-widest uppercase">
          <text x="20" y="240">Range: 365 Days</text>
          <text x="420" y="240" textAnchor="end">Metric: Sales Pipeline Trend</text>
        </g>
      </svg>
    </div>
  );
}
