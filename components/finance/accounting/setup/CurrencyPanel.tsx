"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal } from "lucide-react";
import { useAccountingSettings } from "./useAccountingSettings";
import { useAccountingCurrencyStore } from "@/store/useAccountingCurrencyStore";

type Currency = { code: string; symbol: string; name: string; exchangeRate: number };

const CURRENCY_CATALOG: Omit<Currency, "exchangeRate">[] = [
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "AUD", symbol: "$", name: "Australian Dollar" },
  { code: "CAD", symbol: "$", name: "Canadian Dollar" },
  { code: "CNY", symbol: "¥", name: "Yuan Renminbi" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "SAR", symbol: "SAR", name: "Saudi Riyal" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
];

export function CurrencyPanel() {
  const { settings, loading, saving, save } = useAccountingSettings();
  const [baseCurrency, setBaseCurrency] = useState("INR");
  const [enabledCurrencies, setEnabledCurrencies] = useState<Currency[]>([]);
  const [feedsEnabled, setFeedsEnabled] = useState(true);

  const [newModalOpen, setNewModalOpen] = useState(false);
  const [addCode, setAddCode] = useState("");
  const [addRate, setAddRate] = useState("1");

  useEffect(() => {
    if (settings?.currency) {
      setBaseCurrency(settings.currency.baseCurrency);
      setEnabledCurrencies(settings.currency.enabledCurrencies || []);
      setFeedsEnabled(settings.currency.exchangeRateFeedsEnabled ?? true);
    }
  }, [settings]);

  if (loading) return <div className="text-muted-foreground text-sm py-8 text-center">Loading...</div>;

  const available = CURRENCY_CATALOG.filter((c) => !enabledCurrencies.some((e) => e.code === c.code));

  const persist = async (patch: Partial<{ baseCurrency: string; enabledCurrencies: Currency[]; exchangeRateFeedsEnabled: boolean }>) => {
    const ok = await save("currency", {
      baseCurrency: patch.baseCurrency ?? baseCurrency,
      enabledCurrencies: patch.enabledCurrencies ?? enabledCurrencies,
      exchangeRateFeedsEnabled: patch.exchangeRateFeedsEnabled ?? feedsEnabled,
    });
    // Refresh the shared store so every other accounting screen picks up the change immediately.
    if (ok) await useAccountingCurrencyStore.getState().fetchCurrency(true);
    return ok;
  };

  const addCurrency = async () => {
    const curr = CURRENCY_CATALOG.find((c) => c.code === addCode);
    if (!curr) return;
    const next = [...enabledCurrencies, { ...curr, exchangeRate: Number(addRate) || 1 }];
    setEnabledCurrencies(next);
    setNewModalOpen(false);
    setAddCode("");
    setAddRate("1");
    await persist({ enabledCurrencies: next });
  };

  const setAsBase = async (code: string) => {
    setBaseCurrency(code);
    await persist({ baseCurrency: code });
    toast.success(`${code} set as base currency`);
  };

  const removeCurrency = async (code: string) => {
    if (code === baseCurrency) return toast.error("Cannot remove the base currency");
    const next = enabledCurrencies.filter((c) => c.code !== code);
    setEnabledCurrencies(next);
    await persist({ enabledCurrencies: next });
  };

  const toggleFeeds = async () => {
    const next = !feedsEnabled;
    setFeedsEnabled(next);
    await persist({ exchangeRateFeedsEnabled: next });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Currencies</h3>
        <div className="flex items-center gap-2">
          <Button onClick={() => setNewModalOpen(true)} disabled={available.length === 0}>
            <Plus className="h-4 w-4 mr-2" /> New Currency
          </Button>
          <Button variant="outline" onClick={toggleFeeds} disabled={saving}>
            {feedsEnabled ? "Disable Exchange Rate Feeds" : "Enable Exchange Rate Feeds"}
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>NAME</TableHead>
            <TableHead>SYMBOL</TableHead>
            <TableHead>EXCHANGE RATE</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {enabledCurrencies.map((c) => (
            <TableRow key={c.code}>
              <TableCell className="font-medium">
                {c.code}- {c.name}
                {c.code === baseCurrency && (
                  <span className="ml-2 text-xs bg-green-600/15 text-green-500 px-2 py-0.5 rounded">Base Currency</span>
                )}
              </TableCell>
              <TableCell>{c.symbol}</TableCell>
              <TableCell>{c.code === baseCurrency ? "1.00" : (c.exchangeRate ?? 1).toString()}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {c.code !== baseCurrency && <DropdownMenuItem onClick={() => setAsBase(c.code)}>Set as Base Currency</DropdownMenuItem>}
                    {c.code !== baseCurrency && (
                      <DropdownMenuItem className="text-red-600" onClick={() => removeCurrency(c.code)}>
                        Remove
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={newModalOpen} onOpenChange={setNewModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Currency</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Currency</label>
              <Select value={addCode} onValueChange={setAddCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a currency" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Exchange Rate (1 {addCode || "—"} = ? {baseCurrency})</label>
              <Input type="number" step="0.000001" value={addRate} onChange={(e) => setAddRate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addCurrency} disabled={!addCode}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
