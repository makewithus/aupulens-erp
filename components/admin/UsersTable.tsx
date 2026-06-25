"use client";

import { Card, CardContent } from "@/components/ui/card";
import { TableSkeleton } from "@/components/ui/loading-skeletons";
import { Users as UsersIcon } from "lucide-react";

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
        {isLoading ? (
          <TableSkeleton rows={5} columns={7} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border/40">
                <tr className="text-left">
                  <th className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                    User
                  </th>

                  <th className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                    Contact
                  </th>

                  <th className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                    Employee ID
                  </th>

                  <th className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                    Role
                  </th>

                  <th className="px-8 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                    Department
                  </th>

                  <th className="px-8 py-5 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                    Status
                  </th>

                  <th className="px-8 py-5 text-right font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground/50">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border/30">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-24 text-center">
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
                    </td>
                  </tr>
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
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}