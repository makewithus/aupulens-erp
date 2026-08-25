'use client';

import { useState, useEffect, useCallback } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, FileText, Download, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AuditCenterPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [recordTypeFilter, setRecordTypeFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (recordTypeFilter) params.set("record_type", recordTypeFilter);
    if (actionFilter) params.set("action", actionFilter);
    
    const res = await fetch(`/api/crm/audit?${params}`);
    const data = await res.json();
    if (data.success) {
      setLogs(data.data.logs || []);
    }
    setLoading(false);
  }, [search, recordTypeFilter, actionFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Audit Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            System-wide immutable trail of all CRM changes.
          </p>
        </div>
        <Button variant="outline" className="text-xs h-8">
          <Download className="w-3 h-3 mr-2" /> Export
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input 
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search old/new values..." 
            className="pl-9 bg-card border-border" 
          />
        </div>
        <select 
          value={recordTypeFilter} onChange={(e) => setRecordTypeFilter(e.target.value)}
          className="bg-card border border-border rounded px-3 text-sm"
        >
          <option value="">All Record Types</option>
          {['Lead','Account','Contact','Opportunity','Quote','Contract','Campaign'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select 
          value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
          className="bg-card border border-border rounded px-3 text-sm"
        >
          <option value="">All Actions</option>
          {['created','updated','deleted','status_changed','bulk_update','merged'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground w-48">Timestamp</TableHead>
              <TableHead className="text-muted-foreground">User</TableHead>
              <TableHead className="text-muted-foreground">Action</TableHead>
              <TableHead className="text-muted-foreground">Record</TableHead>
              <TableHead className="text-muted-foreground">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            )}
            {!loading && logs.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No logs found.</TableCell></TableRow>
            )}
            {!loading && logs.map((log) => (
              <TableRow key={log._id} className="border-border/50 hover:bg-accent/20 text-sm">
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {new Date(log.timestamp).toLocaleString()}
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  {/* In a real app we populate user_id */}
                  {log.user_id?.toString().slice(-6) || 'System'}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${
                    log.action === 'deleted' ? 'border-red-900/50 text-red-400 bg-red-900/10' :
                    log.action === 'created' ? 'border-green-900/50 text-green-400 bg-green-900/10' :
                    'border-blue-900/50 text-blue-400 bg-blue-900/10'
                  }`}>
                    {log.action.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-foreground">{log.record_type}</span>
                  <div className="text-[10px] text-muted-foreground font-mono">{log.record_id}</div>
                </TableCell>
                <TableCell>
                  {log.field_name && (
                    <div className="mb-1 text-xs text-muted-foreground">Field: <span className="font-mono text-foreground">{log.field_name}</span></div>
                  )}
                  <div className="flex items-center gap-2 text-xs">
                    {log.old_value && (
                      <span className="text-red-400 line-through bg-red-950 px-1 rounded truncate max-w-[150px]" title={log.old_value}>{log.old_value}</span>
                    )}
                    {log.old_value && log.new_value && <span className="text-muted-foreground">→</span>}
                    {log.new_value && (
                      <span className="text-green-400 bg-green-950 px-1 rounded truncate max-w-[250px]" title={log.new_value}>{log.new_value}</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
