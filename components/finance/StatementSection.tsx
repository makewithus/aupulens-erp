import { cn } from "@/lib/utils";

export const formatInr = (n: number | undefined | null) =>
  `${(n ?? 0) < 0 ? "-" : ""}₹${Math.abs(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One block of a financial statement (Income, Assets, …) in the app's flat mono/uppercase style. */
export function StatementSection({
  title,
  section,
  tone = "neutral",
  emptyText = "No posted entries in this period",
}: {
  title: string;
  section?: { total?: number; accounts?: Record<string, any> };
  tone?: "positive" | "negative" | "neutral";
  emptyText?: string;
}) {
  const accounts = Object.values(section?.accounts || {}).sort((a: any, b: any) => String(a.code).localeCompare(String(b.code)));
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
      {accounts.length === 0 ? (
        <p className="py-6 text-center font-mono text-xs text-muted-foreground/50">{emptyText}</p>
      ) : (
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
      )}
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
