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
import { DateRangeFilter } from "@/components/shared/DateRangeFilter";

interface UsersToolbarProps {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  roleFilter: string;
  setRoleFilter: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
}

export function UsersToolbar({
  searchQuery,
  setSearchQuery,
  roleFilter,
  setRoleFilter,
  statusFilter,
  setStatusFilter,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}: UsersToolbarProps) {
  return (
    <div className="px-8 py-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/35 transition-colors" />

          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users..."
            className="
              h-11
              rounded-none
              border-border/40
              bg-transparent
              pl-11
              pr-4

              text-[14px]
              tracking-tight

              shadow-none
              transition-all
              duration-300

              placeholder:text-muted-foreground/60

              hover:border-border/40

              focus-visible:border-primary/40
              focus-visible:bg-white/[0.015]
              focus-visible:ring-0
            "
          />
        </div>

        {/* Role */}
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger
            className="
              h-11
              w-full
              rounded-none

              border-border/20
              bg-transparent

              text-[14px]
              tracking-tight

              shadow-none
              transition-all
              duration-300

              hover:border-border/40

              focus:ring-0
              lg:w-[190px]
            "
          >
            <SelectValue placeholder="Role" />
          </SelectTrigger>

          <SelectContent className="rounded-none border-border/30">
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
              h-11
              w-full
              rounded-none

              border-border/20
              bg-transparent

              text-[14px]
              tracking-tight

              shadow-none
              transition-all
              duration-300

              hover:border-border/40

              focus:ring-0
              lg:w-[190px]
            "
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>

          <SelectContent className="rounded-none border-border/30">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
        />
      </div>
    </div>
  );
}