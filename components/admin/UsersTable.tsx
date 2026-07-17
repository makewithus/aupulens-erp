"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users as UsersIcon } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

import { UserRow } from "./UserRow";
import { UsersToolbar } from "./UsersToolbar";

interface User {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  department?: string;
  employeeId?: string;
  designation?: string;
  status: string;
}

interface UsersTableProps {
  users: User[];
  isLoading: boolean;
  hasFilters: boolean;

  searchQuery: string;
  setSearchQuery: (value: string) => void;

  roleFilter: string;
  setRoleFilter: (value: string) => void;

  statusFilter: string;
  setStatusFilter: (value: string) => void;

  onEdit: (user: User) => void;
  onDelete: (userId: string) => void;
  onToggleActive: (userId: string, status: string) => void;
  getRoleBadgeColor: (role: string) => string;
}

export function UsersTable({
  users,
  isLoading,
  hasFilters,

  searchQuery,
  setSearchQuery,

  roleFilter,
  setRoleFilter,

  statusFilter,
  setStatusFilter,

  onEdit,
  onDelete,
  onToggleActive,
  getRoleBadgeColor,
}: UsersTableProps) {
  return (
    <Card className="overflow-hidden border-border/40 shadow-none bg-background">
      {/* Header */}
      <div className="border-b border-border/20 px-8 py-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="shrink-0">
            <h2 className="text-[30px] font-medium tracking-[-0.05em]">
              All Users
            </h2>

            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/45">
              {users.length} {users.length === 1 ? "User" : "Users"}
            </p>
          </div>

          <div className="w-full max-w-3xl">
            <UsersToolbar
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              roleFilter={roleFilter}
              setRoleFilter={setRoleFilter}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
            />
          </div>
        </div>
      </div>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table className="w-full">
            <TableHeader className="border-b border-border/40">
              <TableRow className="text-left">
                <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                  User
                </TableHead>

                <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                  Contact
                </TableHead>

                <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                  Employee ID
                </TableHead>

                <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                  Role
                </TableHead>

                <TableHead className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                  Department
                </TableHead>

                <TableHead className="px-8 py-5 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                  Status
                </TableHead>

                <TableHead className="px-8 py-5 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y divide-border/30">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="group">
                    {/* USER */}
                    <TableCell className="px-8 py-7">
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-3 w-20 opacity-55" />
                      </div>
                    </TableCell>

                    {/* CONTACT */}
                    <TableCell className="px-8 py-7">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-3.5 w-3.5 opacity-40" />
                          <Skeleton className="h-4 w-40" />
                        </div>
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-3.5 w-3.5 opacity-40" />
                          <Skeleton className="h-4 w-28" />
                        </div>
                      </div>
                    </TableCell>

                    {/* EMPLOYEE */}
                    <TableCell className="px-8 py-7">
                      <Skeleton className="h-4 w-20" />
                    </TableCell>

                    {/* ROLE */}
                    <TableCell className="px-8 py-7">
                      <Skeleton className="h-5 w-16" />
                    </TableCell>

                    {/* DEPARTMENT */}
                    <TableCell className="px-8 py-7">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>

                    {/* STATUS */}
                    <TableCell className="px-8 py-7">
                      <div className="flex items-center justify-center gap-2">
                        <Skeleton className="h-2 w-2 rounded-full" />
                        <Skeleton className="h-3.5 w-12" />
                      </div>
                    </TableCell>

                    {/* ACTIONS */}
                    <TableCell className="px-8 py-7">
                      <div className="flex justify-end gap-1">
                        <Skeleton className="h-8 w-8" />
                        <Skeleton className="h-8 w-8" />
                        <Skeleton className="h-8 w-8 text-[#F56868]" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-24 text-center">
                    <UsersIcon className="mx-auto mb-5 h-12 w-12 text-muted-foreground/20" />

                    <h3 className="text-lg font-medium">
                      {hasFilters
                        ? "No users match your filters"
                        : "No users found"}
                    </h3>

                    <p className="mt-2 text-sm text-muted-foreground">
                      {hasFilters
                        ? "Try adjusting your search or filters."
                        : "Create your first user to get started."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <UserRow
                    key={user._id}
                    user={user}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onToggleActive={onToggleActive}
                    getRoleBadgeColor={getRoleBadgeColor}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}