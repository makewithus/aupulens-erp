'use client';

import { useState, useEffect } from "react";
import { Zap, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { NewAutomationRuleModal } from "@/components/crm/NewAutomationRuleModal";

export default function AutomationsPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    const res = await fetch("/api/crm/automations");
    const data = await res.json();
    if (data.success) {
      setRules(data.data);
    }
    setLoading(false);
  };

  const toggleRule = async (id: string, currentState: boolean) => {
    const res = await fetch(`/api/crm/automations/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !currentState })
    });
    if (res.ok) fetchRules();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-500" />
            Automation Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build and manage workflow rules, triggers, and actions.
          </p>
        </div>
        <NewAutomationRuleModal onCreated={fetchRules} />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Rule Name</TableHead>
              <TableHead className="text-muted-foreground">Entity</TableHead>
              <TableHead className="text-muted-foreground">Trigger</TableHead>
              <TableHead className="text-muted-foreground">Actions</TableHead>
              <TableHead className="text-muted-foreground text-right">Executions</TableHead>
              <TableHead className="text-muted-foreground text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : rules.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground border border-dashed border-border">No automation rules configured. Seed required for testing.</TableCell></TableRow>
            ) : rules.map(rule => (
              <TableRow key={rule._id} className="border-border hover:bg-accent/50 text-sm">
                <TableCell className="font-semibold text-foreground">{rule.name}</TableCell>
                <TableCell><Badge variant="outline" className="border-blue-900/50 text-blue-400 bg-blue-900/10">{rule.entity}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{rule.trigger}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{rule.actions?.length || 0} Actions</TableCell>
                <TableCell className="text-right font-sans tabular-nums">{rule.executionCount}</TableCell>
                <TableCell className="text-center">
                  <Button 
                    variant={rule.enabled ? "default" : "outline"}
                    className={`h-6 px-2 text-[10px] uppercase ${rule.enabled ? 'bg-green-600 hover:bg-green-700' : 'text-muted-foreground'}`}
                    onClick={() => toggleRule(rule._id, rule.enabled)}
                  >
                    {rule.enabled ? "Active" : "Disabled"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
