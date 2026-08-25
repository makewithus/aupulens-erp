'use client';

import { useState, useEffect } from "react";
import { Link2, RefreshCcw, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function IntegrationsDashboard() {
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/crm/integrations").then(r => r.json()).then(d => {
      if (d.success) setLinks(d.data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Link2 className="w-8 h-8 text-cyan-400" /> ERP Integration Center
          </h1>
          <p className="text-muted-foreground mt-1">Manage external system links, synchronization status, and failures.</p>
        </div>
        <Button className="bg-primary text-primary-foreground"><RefreshCcw className="w-4 h-4 mr-2" /> Force Sync All</Button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">System</TableHead>
              <TableHead className="text-muted-foreground">ERP ID</TableHead>
              <TableHead className="text-muted-foreground">CRM Record</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Last Sync</TableHead>
              <TableHead className="text-muted-foreground text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} className="text-center py-6"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow> :
             links.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground border border-dashed border-border">No active ERP integration links.</TableCell></TableRow> :
             links.map(link => (
                 <TableRow key={link._id} className="border-border hover:bg-accent/50">
                   <TableCell className="font-semibold">{link.erpSystem}</TableCell>
                   <TableCell className="font-mono text-xs">{link.erpRecordId}</TableCell>
                   <TableCell className="text-sm">{link.crmRecordType}</TableCell>
                   <TableCell>
                     <Badge variant="outline" className={`text-xs ${
                       link.syncStatus === 'Failed' ? 'text-red-400 border-red-900/50' : 
                       link.syncStatus === 'Success' ? 'text-green-400 border-green-900/50' : 'text-yellow-400 border-yellow-900/50'
                     }`}>{link.syncStatus}</Badge>
                   </TableCell>
                   <TableCell className="text-xs text-muted-foreground">{new Date(link.lastSyncAt).toLocaleString()}</TableCell>
                   <TableCell className="text-right">
                     <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">Retry</Button>
                   </TableCell>
                 </TableRow>
               ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
