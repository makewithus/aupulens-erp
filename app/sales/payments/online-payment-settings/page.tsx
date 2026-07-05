"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { salesSidebarConfig } from "@/config/sidebar/sales";
import { SalesTabNav } from "@/components/sales/SalesTabNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { CreditCard } from "lucide-react";

interface GatewayRow {
  _id: string;
  name: string;
  provider: string;
  status: "connected" | "disconnected";
  isDefault: boolean;
  connectedAt?: string;
}

export default function OnlinePaymentSettingsPage() {
  const { data: session } = useSession();
  const [gateways, setGateways] = useState<GatewayRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [connectTarget, setConnectTarget] = useState<GatewayRow | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [connecting, setConnecting] = useState(false);

  const [disconnectTarget, setDisconnectTarget] = useState<GatewayRow | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sales/online-payment-gateways");
      const data = await res.json();
      if (data.success) {
        setGateways(data.data);
      } else {
        toast.error(data.message || "Failed to load payment gateways");
      }
    } catch {
      toast.error("Failed to load payment gateways");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openConnect = (gateway: GatewayRow) => {
    setConnectTarget(gateway);
    setApiKey("");
    setApiSecret("");
  };

  const handleConnect = async () => {
    if (!connectTarget) return;
    if (!apiKey.trim() || !apiSecret.trim()) {
      toast.error("API Key and API Secret are required");
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch(`/api/sales/online-payment-gateways/${connectTarget._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "connect",
          credentials: { apiKey: apiKey.trim(), apiSecret: apiSecret.trim() },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to connect");
      toast.success(`${connectTarget.name} connected`);
      setConnectTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to connect");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectTarget) return;
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/sales/online-payment-gateways/${disconnectTarget._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to disconnect");
      toast.success(`${disconnectTarget.name} disconnected`);
      setDisconnectTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <DashboardLayout
      sidebarSections={salesSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Sales"
      pageName="Online Payments"
      breadcrumbs={[
        { label: "Sales", href: "/sales/summary" },
        { label: "Payments", href: "/sales/payments" },
        { label: "Online Payments" },
      ]}
      userName={session?.user?.name ?? "User"}
      userEmail={session?.user?.email ?? ""}
    >
      <div className="p-6 space-y-4">
        <SalesTabNav />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <CreditCard className="w-5 h-5" /> Online Payments
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Connect a payment gateway so customers can pay invoices online.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gateway</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gateways.map((g) => (
                <TableRow key={g._id}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        g.status === "connected"
                          ? "border-green-600 text-green-600"
                          : "border-muted-foreground/40 text-muted-foreground"
                      }
                    >
                      {g.status === "connected" ? "Connected" : "Disconnected"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {g.status === "connected" ? (
                      <Button variant="outline" size="sm" onClick={() => setDisconnectTarget(g)}>
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => openConnect(g)}
                      >
                        Connect
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {gateways.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-10">
                    No payment gateways found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Connect dialog — placeholder credential fields since there is no real gateway
          to call in this environment; see lib/sales/paymentGatewayService.ts's stub note. */}
      <Dialog open={!!connectTarget} onOpenChange={(v) => !v && setConnectTarget(null)}>
        <DialogContent className="max-w-md">
          <h2 className="text-lg font-semibold mb-1">Connect {connectTarget?.name}</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Enter your {connectTarget?.name} API credentials to connect this gateway.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter API Key" />
            </div>
            <div className="space-y-1.5">
              <Label>API Secret</Label>
              <Input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Enter API Secret"
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setConnectTarget(null)}>
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect confirmation */}
      <Dialog open={!!disconnectTarget} onOpenChange={(v) => !v && setDisconnectTarget(null)}>
        <DialogContent className="max-w-md">
          <h2 className="text-lg font-semibold mb-1">Disconnect {disconnectTarget?.name}?</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Customers will no longer be able to pay via {disconnectTarget?.name} until you reconnect it.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisconnectTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
