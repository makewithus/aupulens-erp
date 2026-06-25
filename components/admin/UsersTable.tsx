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
    <Card className="overflow-hidden border-border/40 shadow-none">
      {/* Header */}
      <div className="flex items-end justify-between border-b border-border/40 px-8 py-6">
        <div>
          <h2 className="text-[24px] font-medium tracking-[-0.04em]">
            All Users
          </h2>

          <p className="mt-1 text-xs text-muted-foreground">
            {users.length} user{users.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <UsersToolbar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        roleFilter={roleFilter}
        setRoleFilter={setRoleFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
      />

      <CardContent className="p-0">
        {isLoading ? (
          <TableSkeleton rows={5} columns={7} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border/40">
                <tr className="text-left">
                  <th className="px-8 py-5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
                    User
                  </th>

                  <th className="px-8 py-5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
                    Contact
                  </th>

                  <th className="px-8 py-5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
                    Employee ID
                  </th>

                  <th className="px-8 py-5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
                    Role
                  </th>

                  <th className="px-8 py-5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
                    Department
                  </th>

                  <th className="px-8 py-5 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
                    Status
                  </th>

                  <th className="px-8 py-5 text-right font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
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