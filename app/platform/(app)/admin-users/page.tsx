"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPlatformTimestamp } from "@/lib/platform/formatting/orgTimezone";
import { TypeToConfirm } from "@/components/platform/TypeToConfirm";
import { ADMIN_ROLE_VALUES, ADMIN_ROLE_LABELS } from "@/lib/constants/statuses";

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "suspended";
  mfaEnabled: boolean;
  failedLoginCount: number;
  lastLoginAt?: string;
  lastLoginIp?: string;
  createdAt: string;
}

/**
 * Phase 11 Part 1.6 (user decision, this session): the only prior path to
 * creating an admin was scripts/seed-platform-admin.ts — this page is the
 * first way to add a colleague, revoke a leaver, or reset MFA without
 * server access. Every mutating action is confirmation-gated (source doc
 * §25) and only ever reaches a GLOBAL_SUPER_ADMIN backend capability.
 */
export default function AdminUsersPage() {
  const [admins, setAdmins] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", role: "" });
  const [createReason, setCreateReason] = useState("");

  const [roleTarget, setRoleTarget] = useState<AdminUserRow | null>(null);
  const [newRole, setNewRole] = useState("");
  const [roleReason, setRoleReason] = useState("");

  const [suspendTarget, setSuspendTarget] = useState<AdminUserRow | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  const [mfaResetTarget, setMfaResetTarget] = useState<AdminUserRow | null>(null);
  const [mfaResetReason, setMfaResetReason] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/platform/admin-users");
      const body = await res.json();
      if (body.success) setAdmins(body.data);
      else setError(body.message ?? "Failed to load admins.");
    } catch {
      setError("Failed to load admins.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/platform/admin-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...createForm, reason: createReason }),
      });
      const body = await res.json();
      if (!body.success) {
        setError(body.message ?? "Failed to create admin.");
        return;
      }
      setCreateOpen(false);
      setCreateForm({ name: "", email: "", password: "", role: "" });
      setCreateReason("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRoleChange() {
    if (!roleTarget) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/platform/admin-users/${roleTarget.id}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole, reason: roleReason }),
      });
      const body = await res.json();
      if (!body.success) {
        setError(body.message ?? "Failed to change role.");
        return;
      }
      setRoleTarget(null);
      setRoleReason("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSuspendToggle() {
    if (!suspendTarget) return;
    setSubmitting(true);
    try {
      const nextStatus = suspendTarget.status === "active" ? "suspended" : "active";
      const res = await fetch(`/api/platform/admin-users/${suspendTarget.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, reason: suspendReason }),
      });
      const body = await res.json();
      if (!body.success) {
        setError(body.message ?? "Failed to change status.");
        return;
      }
      setSuspendTarget(null);
      setSuspendReason("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMfaReset() {
    if (!mfaResetTarget) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/platform/admin-users/${mfaResetTarget.id}/reset-mfa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: mfaResetReason }),
      });
      const body = await res.json();
      if (!body.success) {
        setError(body.message ?? "Failed to reset MFA.");
        return;
      }
      setMfaResetTarget(null);
      setMfaResetReason("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Admin Users</h1>
          <p className="text-sm text-neutral-500">
            Global Admin accounts — create, change role, suspend/reactivate, and reset MFA
            enrollment. Suspended, never deleted (an admin record is an audit actor and must stay
            resolvable).
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New admin</Button>
      </div>

      {error && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-red-600">{error}</p>
          <Button size="sm" variant="outline" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>MFA</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins === null && !error && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-neutral-500 py-8">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {admins !== null && admins.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-neutral-500 py-8">
                    No admin accounts found.
                  </TableCell>
                </TableRow>
              )}
              {admins?.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div>{a.name}</div>
                    <div className="text-xs text-neutral-400">{a.email}</div>
                  </TableCell>
                  <TableCell className="text-xs uppercase">{ADMIN_ROLE_LABELS[a.role as keyof typeof ADMIN_ROLE_LABELS] ?? a.role}</TableCell>
                  <TableCell>
                    <Badge variant={a.status === "suspended" ? "destructive" : "secondary"}>{a.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{a.mfaEnabled ? "Enrolled" : "Not enrolled"}</TableCell>
                  <TableCell className="text-xs">
                    {a.lastLoginAt ? formatPlatformTimestamp(a.lastLoginAt) : "Never"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRoleTarget(a);
                          setNewRole(a.role);
                          setRoleReason("");
                        }}
                      >
                        Change role
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSuspendTarget(a);
                          setSuspendReason("");
                        }}
                      >
                        {a.status === "active" ? "Suspend" : "Reactivate"}
                      </Button>
                      {a.mfaEnabled && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setMfaResetTarget(a);
                            setMfaResetReason("");
                          }}
                        >
                          Reset MFA
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New admin</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Temporary password (12+ characters)</Label>
              <Input type="password" value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {ADMIN_ROLE_VALUES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ADMIN_ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-neutral-500">
              MFA enrollment is mandatory on first login — the new admin will be walked through it
              automatically, the same as every other account.
            </p>
            <div className="space-y-1">
              <Label>Reason (required, audited)</Label>
              <Textarea value={createReason} onChange={(e) => setCreateReason(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                submitting ||
                !createForm.name.trim() ||
                !createForm.email.trim() ||
                createForm.password.length < 12 ||
                !createForm.role ||
                !createReason.trim()
              }
              onClick={handleCreate}
            >
              {submitting ? "Creating…" : "Create admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(roleTarget)} onOpenChange={(v) => !v && setRoleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role — {roleTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>New role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADMIN_ROLE_VALUES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ADMIN_ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reason (required, audited)</Label>
              <Textarea value={roleReason} onChange={(e) => setRoleReason(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleTarget(null)}>
              Cancel
            </Button>
            <Button disabled={submitting || !newRole || !roleReason.trim()} onClick={handleRoleChange}>
              {submitting ? "Saving…" : "Change role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TypeToConfirm
        open={Boolean(suspendTarget)}
        onOpenChange={(v) => !v && setSuspendTarget(null)}
        title={suspendTarget?.status === "active" ? "Suspend admin" : "Reactivate admin"}
        consequence={
          suspendTarget?.status === "active"
            ? `${suspendTarget?.name} will immediately lose all platform access and every active session of theirs will stop working on their next request.`
            : `${suspendTarget?.name} will regain platform access immediately.`
        }
        confirmText={suspendTarget?.email ?? ""}
        reason={suspendReason}
        onReasonChange={setSuspendReason}
        submitting={submitting}
        confirmLabel={suspendTarget?.status === "active" ? "Suspend" : "Reactivate"}
        onConfirm={handleSuspendToggle}
      />

      <TypeToConfirm
        open={Boolean(mfaResetTarget)}
        onOpenChange={(v) => !v && setMfaResetTarget(null)}
        title="Reset MFA enrollment"
        consequence={`${mfaResetTarget?.name}'s current authenticator will stop working immediately. They will be walked through MFA enrollment again the next time they log in.`}
        confirmText="RESET"
        reason={mfaResetReason}
        onReasonChange={setMfaResetReason}
        submitting={submitting}
        confirmLabel="Reset MFA"
        onConfirm={handleMfaReset}
      />
    </div>
  );
}
