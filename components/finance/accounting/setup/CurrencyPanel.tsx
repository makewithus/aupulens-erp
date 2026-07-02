"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { useAccountingSettings } from "./useAccountingSettings";

const CURRENCY_CATALOG = [
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
];

export function CurrencyPanel() {
  const { settings, loading, saving, save } = useAccountingSettings();
  const [baseCurrency, setBaseCurrency] = useState("INR");
  const [enabledCurrencies, setEnabledCurrencies] = useState<{ code: string; symbol: string; name: string }[]>([]);
  const [addCode, setAddCode] = useState("");

  useEffect(() => {
    if (settings?.currency) {
      setBaseCurrency(settings.currency.baseCurrency);
      setEnabledCurrencies(settings.currency.enabledCurrencies || []);
    }
  }, [settings]);

  if (loading) return <div className="text-muted-foreground text-sm py-8 text-center">Loading...</div>;

  const available = CURRENCY_CATALOG.filter((c) => !enabledCurrencies.some((e) => e.code === c.code));

  const addCurrency = () => {
    const curr = CURRENCY_CATALOG.find((c) => c.code === addCode);
    if (!curr) return;
    setEnabledCurrencies([...enabledCurrencies, curr]);
    setAddCode("");
  };

  const removeCurrency = (code: string) => {
    if (code === baseCurrency) return;
    setEnabledCurrencies(enabledCurrencies.filter((c) => c.code !== code));
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div className="space-y-2">
        <label className="text-sm font-medium">Base Currency</label>
        <Select value={baseCurrency} onValueChange={setBaseCurrency}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {enabledCurrencies.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.code} - {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Enabled Currencies</label>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>CODE</TableHead>
              <TableHead>SYMBOL</TableHead>
              <TableHead>NAME</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {enabledCurrencies.map((c) => (
              <TableRow key={c.code}>
                <TableCell className="font-medium">{c.code}</TableCell>
                <TableCell>{c.symbol}</TableCell>
                <TableCell>{c.name}</TableCell>
                <TableCell>
                  {c.code !== baseCurrency && (
                    <Button variant="ghost" size="icon" onClick={() => removeCurrency(c.code)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {available.length > 0 && (
          <div className="flex items-center gap-2 pt-2">
            <Select value={addCode} onValueChange={setAddCode}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Add a currency" />
              </SelectTrigger>
              <SelectContent>
                {available.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} - {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={addCurrency} disabled={!addCode}>
              <Plus className="h-4 w-4 mr-2" /> Add
            </Button>
          </div>
        )}
      </div>

      <Button disabled={saving} onClick={() => save("currency", { baseCurrency, enabledCurrencies })}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
