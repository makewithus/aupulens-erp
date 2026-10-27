import { cn } from "@/lib/utils";

export const formatInr = (n: number | undefined | null) =>
  `${(n ?? 0) < 0 ? "-" : ""}₹${Math.abs(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SubtotalBar({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between border-t border-border/40 bg-white/[0.02] px-3 py-2 mt-2">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-sans text-sm font-bold tabular-nums",
          tone === "positive" && "text-emerald-500",
          tone === "negative" && "text-red-500",
        )}
      >
        {formatInr(value)}
      </span>
    </div>
  );
}

function AccountList({
  accounts,
  emptyText,
}: {
  accounts: any[];
  emptyText: string;
}) {
  if (accounts.length === 0) {
    return <p className="py-4 text-center font-mono text-xs text-muted-foreground/60">{emptyText}</p>;
  }
  return (
    <ul className="divide-y divide-border/20">
      {accounts.map((acc: any) => (
        <li key={acc.id || acc.code} className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-white/[0.02]">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{acc.name}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">{acc.code}</p>
          </div>
          <span className="font-sans text-sm font-semibold tabular-nums">{formatInr(acc.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

/** One block of a financial statement (Assets, Liabilities, Equity) with optional Current vs Non-Current breakdown */
export function StatementSection({
  title,
  section,
  tone = "neutral",
  emptyText = "No posted entries in this period",
  subtitles,
}: {
  title: string;
  section?: {
    total?: number;
    accounts?: Record<string, any>;
    current?: { total?: number; accounts?: Record<string, any> };
    nonCurrent?: { total?: number; accounts?: Record<string, any> };
  };
  tone?: "positive" | "negative" | "neutral";
  emptyText?: string;
  subtitles?: {
    currentTitle?: string;
    currentDesc?: string;
    nonCurrentTitle?: string;
    nonCurrentDesc?: string;
  };
}) {
  const hasSubBreakdown = Boolean(section?.current || section?.nonCurrent);

  if (!hasSubBreakdown) {
    const accounts = Object.values(section?.accounts || {}).sort((a: any, b: any) =>
      String(a.code).localeCompare(String(b.code)),
    );
    return (
      <div>
        <div className="flex items-baseline justify-between border-b border-border/40 pb-3">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{title}</h3>
          <span
            className={cn(
              "font-sans text-lg font-semibold tabular-nums",
              tone === "positive" && "text-emerald-500",
              tone === "negative" && "text-red-500",
            )}
          >
            {formatInr(section?.total)}
          </span>
        </div>
        <AccountList accounts={accounts} emptyText={emptyText} />
      </div>
    );
  }

  const currentAccounts = Object.values(section?.current?.accounts || {}).sort((a: any, b: any) =>
    String(a.code).localeCompare(String(b.code)),
  );
  const nonCurrentAccounts = Object.values(section?.nonCurrent?.accounts || {}).sort((a: any, b: any) =>
    String(a.code).localeCompare(String(b.code)),
  );

  const currentTitle = subtitles?.currentTitle || `Current ${title}`;
  const currentDesc = subtitles?.currentDesc || "Obligations or assets realizable/payable up to or under 12 months";
  const nonCurrentTitle = subtitles?.nonCurrentTitle || `Non-Current ${title}`;
  const nonCurrentDesc = subtitles?.nonCurrentDesc || "Long-term obligations or capital assets held beyond 12 months";

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between border-b border-border/40 pb-3">
        <h3 className="font-mono text-[12px] uppercase tracking-[0.2em] font-black text-primary">{title}</h3>
        <span
          className={cn(
            "font-sans text-lg font-semibold tabular-nums",
            tone === "positive" && "text-emerald-500",
            tone === "negative" && "text-red-500",
          )}
        >
          {formatInr(section?.total)}
        </span>
      </div>

      {/* Current Breakdown */}
      <div className="rounded border border-border/30 bg-muted/5 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-border/20 pb-2">
          <div>
            <h4 className="font-mono text-[11px] font-bold uppercase tracking-wider text-foreground">
              {currentTitle}
            </h4>
            <p className="text-[10px] text-muted-foreground">{currentDesc}</p>
          </div>
          <span className="font-sans text-xs font-semibold tabular-nums text-muted-foreground">
            {formatInr(section?.current?.total)}
          </span>
        </div>
        <AccountList accounts={currentAccounts} emptyText="No current accounts recorded" />
        <SubtotalBar label={`Total ${currentTitle}`} value={section?.current?.total ?? 0} tone={tone} />
      </div>

      {/* Non-Current Breakdown */}
      <div className="rounded border border-border/30 bg-muted/5 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-border/20 pb-2">
          <div>
            <h4 className="font-mono text-[11px] font-bold uppercase tracking-wider text-foreground">
              {nonCurrentTitle}
            </h4>
            <p className="text-[10px] text-muted-foreground">{nonCurrentDesc}</p>
          </div>
          <span className="font-sans text-xs font-semibold tabular-nums text-muted-foreground">
            {formatInr(section?.nonCurrent?.total)}
          </span>
        </div>
        <AccountList accounts={nonCurrentAccounts} emptyText="No non-current accounts recorded" />
        <SubtotalBar label={`Total ${nonCurrentTitle}`} value={section?.nonCurrent?.total ?? 0} tone={tone} />
      </div>
    </div>
  );
}

export function TotalBar({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "positive" | "negative" | "neutral" }) {
  return (
    <div className="flex items-center justify-between border-t-2 border-foreground/70 bg-white/[0.02] px-4 py-4">
      <span className="font-mono text-xs uppercase tracking-[0.18em]">{label}</span>
      <span
        className={cn(
          "font-sans text-2xl font-bold tabular-nums",
          tone === "positive" && "text-emerald-500",
          tone === "negative" && "text-red-500",
        )}
      >
        {formatInr(value)}
      </span>
    </div>
  );
}
