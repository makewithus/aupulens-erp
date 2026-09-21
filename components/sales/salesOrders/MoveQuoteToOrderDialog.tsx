"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const formatInr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n || 0);

/** Lists quotes that have no sales order yet and moves the chosen one to a Sales Order. */
export function MoveQuoteToOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/sales/quotes?limit=100");
        const json = await res.json();
        if (!json.success) throw new Error();
        if (!cancelled) {
          setQuotes((json.data || []).filter((q: any) => !q.saleOrderId && q.status !== "invoiced" && q.status !== "rejected"));
        }
      } catch {
        if (!cancelled) toast.error("We couldn't load your quotes. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const move = async (quote: any) => {
    setBusyId(quote._id);
    try {
      const res = await fetch(`/api/sales/quotes/${quote._id}/convert-to-order`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Could not create the sales order.");
      toast.success(`Sales order ${json.data.order.header.name} created from ${quote.quoteNumber}`);
      onOpenChange(false);
      router.push(`/sales/sales-orders/${json.data.order._id}`);
    } catch (e: any) {
      toast.error(e.message);
      setBusyId(null);
    }
  };

  const term = search.trim().toLowerCase();
  const visible = quotes.filter(
    (q) =>
      !term ||
      q.quoteNumber?.toLowerCase().includes(term) ||
      q.customerId?.header?.name?.toLowerCase().includes(term),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none max-w-xl">
        <DialogHeader>
          <DialogTitle>Move a quote to a sales order</DialogTitle>
          <DialogDescription>Pick a quote — a sales order is created from it and the deal continues on the Q2C pipeline.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Search by quote number or customer…" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-none" />
        <div className="max-h-[50vh] overflow-y-auto space-y-2">
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No quotes are waiting to become a sales order.</p>
          ) : (
            visible.map((q) => (
              <div key={q._id} className="flex items-center justify-between gap-3 border border-border/30 p-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold">{q.quoteNumber}</p>
                  <p className="text-xs text-muted-foreground truncate">{q.customerId?.header?.name || "No customer"}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-semibold tabular-nums">{formatInr(q.totalAmount)}</span>
                  <Button size="sm" className="rounded-none" disabled={busyId !== null} onClick={() => move(q)}>
                    {busyId === q._id ? "Creating…" : "Move to Order"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
