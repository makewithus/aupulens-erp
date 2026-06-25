"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UsersToolbarProps {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  roleFilter: string;
  setRoleFilter: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
}

export function UsersToolbar({
  searchQuery,
  setSearchQuery,
  roleFilter,
  setRoleFilter,
  statusFilter,
  setStatusFilter,
}: UsersToolbarProps) {
  return (
    <div className="border-b border-border/40 px-8 py-6">
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />

          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users..."
            className="
              h-12
              rounded-none
              border-border/50
              bg-transparent
              pl-11
              text-sm
              shadow-none

              placeholder:text-muted-foreground/40

              focus-visible:ring-0
              focus-visible:border-primary
            "
          />
        </div>

        {/* Role */}
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger
            className="
              h-12
              w-full
              rounded-none
              border-border/50
              bg-transparent
              shadow-none
              lg:w-52
            "
          >
            <SelectValue placeholder="Role" />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="master-admin">Master Admin</SelectItem>
            <SelectItem value="finance">Finance</SelectItem>
            <SelectItem value="hr">HR</SelectItem>
            <SelectItem value="sales">Sales</SelectItem>
            <SelectItem value="inventory">Inventory</SelectItem>
            <SelectItem value="project">Project</SelectItem>
            <SelectItem value="manufacturing">
              Manufacturing
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Status */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            className="
              h-12
              w-full
              rounded-none
              border-border/50
              bg-transparent
              shadow-none
              lg:w-52
            "
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}