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

interface EmployeeToolbarProps {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  lifecycleFilter: string;
  setLifecycleFilter: (value: string) => void;
  accountFilter: string;
  setAccountFilter: (value: string) => void;
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
}

export function EmployeeToolbar({
  searchQuery,
  setSearchQuery,
  lifecycleFilter,
  setLifecycleFilter,
  accountFilter,
  setAccountFilter,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}: EmployeeToolbarProps) {
  return (
    <div className="w-full">
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(200px,1fr)_140px_140px_minmax(290px,330px)] xl:items-center">
        {/* Search */}
        <div className="relative w-full min-w-0 sm:col-span-2 xl:col-span-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/45 transition-colors" />

          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, employee code, email, or phone"
            className="
              h-11
              rounded-none
              border-border/45
              bg-transparent
              pl-12
              pr-5

              text-[14px]
              tracking-tight

              shadow-none
              transition-all
              duration-300

              placeholder:text-muted-foreground/70

              hover:border-border/55

              focus-visible:border-primary/45
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

        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          className="min-w-0 sm:col-span-2 xl:col-span-1"
          inputClassName="w-full min-w-0"
        />
      </div>
    </div>
  );
}
