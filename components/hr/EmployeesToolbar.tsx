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

interface EmployeeToolbarProps {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  lifecycleFilter: string;
  setLifecycleFilter: (value: string) => void;
  accountFilter: string;
  setAccountFilter: (value: string) => void;
}

export function EmployeeToolbar({
  searchQuery,
  setSearchQuery,
  lifecycleFilter,
  setLifecycleFilter,
  accountFilter,
  setAccountFilter,
}: EmployeeToolbarProps) {
  return (
    <div className="px-8 py-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/35 transition-colors" />

          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search employees..."
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

        {/* Lifecycle */}
        <Select
          value={lifecycleFilter}
          onValueChange={setLifecycleFilter}
        >
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
              lg:w-[210px]
            "
          >
            <SelectValue placeholder="Lifecycle" />
          </SelectTrigger>

          <SelectContent className="rounded-none border-border/30">
            <SelectItem value="all">All Lifecycle</SelectItem>
            <SelectItem value="candidate">Candidate</SelectItem>
            <SelectItem value="onboarding">Onboarding</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_notice">On Notice</SelectItem>
            <SelectItem value="exit_initiated">
              Exit Initiated
            </SelectItem>
            <SelectItem value="clearance">Clearance</SelectItem>
            <SelectItem value="exited">Exited</SelectItem>
          </SelectContent>
        </Select>

        {/* Account */}
        <Select
          value={accountFilter}
          onValueChange={setAccountFilter}
        >
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
              lg:w-[210px]
            "
          >
            <SelectValue placeholder="Account" />
          </SelectTrigger>

          <SelectContent className="rounded-none border-border/30">
            <SelectItem value="all">All Accounts</SelectItem>
            <SelectItem value="linked">Has User Account</SelectItem>
            <SelectItem value="unlinked">No User Account</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}