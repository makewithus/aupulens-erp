"use client";

import { Card, CardContent } from "@/components/ui/card";
import { TableSkeleton } from "@/components/ui/loading-skeletons";
import { Users as UsersIcon } from "lucide-react";

import { UserRow } from "./UserRow";

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
  onEdit: (user: User) => void;
  onDelete: (userId: string) => void;
  onToggleActive: (userId: string, status: string) => void;
  getRoleBadgeColor: (role: string) => string;
}

export function UsersTable({
  users,
  isLoading,
  hasFilters,
  onEdit,
  onDelete,
  onToggleActive,
  getRoleBadgeColor,
}: UsersTableProps) {
  return (
    <Card className="none-4xl border-2 shadow-xl overflow-hidden">
      <div className="p-6 border-b-2 bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UsersIcon className="h-5 w-5 text-primary" />

          <div>
            <h3 className="text-sm font-black uppercase tracking-tight">
              All Users
            </h3>

            <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">
              {users.length} user{users.length !== 1 ? "s" : ""} found
            </p>
          </div>
        </div>
      </div>

      <CardContent className="p-0">
        {isLoading ? (
          <TableSkeleton rows={5} columns={7} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b-2">
                <tr className="text-left text-[10px] font-black uppercase tracking-widest opacity-40">
                  <th className="p-6">User</th>
                  <th className="p-6">Contact</th>
                  <th className="p-6">Employee ID</th>
                  <th className="p-6">Role</th>
                  <th className="p-6">Department</th>
                  <th className="p-6 text-center">Status</th>
                  <th className="p-6 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y-2 border-primary/5">
                {users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-20 text-center opacity-20"
                    >
                      <UsersIcon className="h-20 w-20 mx-auto mb-4" />

                      <p className="font-black uppercase tracking-widest">
                        {hasFilters
                          ? "No users match your filters"
                          : "No users found"}
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