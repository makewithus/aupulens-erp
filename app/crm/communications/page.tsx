'use client';

import { useState, useEffect } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function CommunicationHubPage() {
  const [comms, setComms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/crm/communications")
      .then(res => res.json())
      .then(data => {
        if (data.success) setComms(data.data);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-primary" />
          Omnichannel Hub
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Global view of all communications across Emails, SMS, WhatsApp, and Calls.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-card p-4 rounded border border-border"><h3 className="text-sm text-muted-foreground">Total Sent</h3><p className="text-2xl font-bold">{comms.length}</p></div>
        <div className="bg-card p-4 rounded border border-border"><h3 className="text-sm text-muted-foreground">Emails</h3><p className="text-2xl font-bold text-blue-400">{comms.filter(c => c.channel==='Email').length}</p></div>
        <div className="bg-card p-4 rounded border border-border"><h3 className="text-sm text-muted-foreground">WhatsApp</h3><p className="text-2xl font-bold text-green-400">{comms.filter(c => c.channel==='WhatsApp').length}</p></div>
        <div className="bg-card p-4 rounded border border-border"><h3 className="text-sm text-muted-foreground">Failed</h3><p className="text-2xl font-bold text-red-400">0</p></div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Date</TableHead>
              <TableHead className="text-muted-foreground">Channel</TableHead>
              <TableHead className="text-muted-foreground">To / From</TableHead>
              <TableHead className="text-muted-foreground">Subject</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Record</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : comms.map(comm => (
              <TableRow key={comm._id} className="border-border hover:bg-accent/50 text-sm">
                <TableCell className="font-mono text-xs text-muted-foreground">{new Date(comm.createdAt).toLocaleString()}</TableCell>
                <TableCell>{comm.channel}</TableCell>
                <TableCell>
                  <div className="font-medium">{comm.direction === 'inbound' ? 'From: ' + comm.sender : 'To: ' + comm.recipient}</div>
                </TableCell>
                <TableCell className="max-w-[200px] truncate">{comm.subject || comm.message}</TableCell>
                <TableCell><Badge variant="outline">{comm.status}</Badge></TableCell>
                <TableCell><Badge className="bg-accent">{comm.recordType}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
