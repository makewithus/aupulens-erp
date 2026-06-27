"use client";

import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { WorkflowChecklist } from "./WorkflowChecklist";

interface Employee {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  designation?: string;
  departmentId?: {
    name: string;
  };
  lifecycleStatus: string;
  dateOfJoining?: string;
}

interface WorkflowCardProps {
  employee: Employee;
  checks: boolean[];
  checklist: string[];
  onToggle: (index: number) => void;
  actionLabel: string;
  onAction: () => void;
}

export function WorkflowCard({
  employee,
  checks,
  checklist,
  onToggle,
}: WorkflowCardProps) {
  const completed = checks.filter(Boolean).length;

  const progress = Math.round(
    (completed / checklist.length) * 100
  );

  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="group overflow-hidden border-border/40 shadow-none transition-colors">
      <CardContent className="p-6">
        {/* Header */}

        <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between gap-8 cursor-pointer"
        >
        {/* Left */}

        <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
            <h3 className="truncate text-[24px] font-medium tracking-[-0.04em] transition-opacity duration-500 group-hover:opacity-80">
                {employee.firstName} {employee.lastName}
            </h3>

            <p className="mt-1 font-mono text-[11px] text-muted-foreground/45">
                {employee.employeeCode}
                {employee.designation && (
                <>
                    {" "}
                    • {employee.designation}
                </>
                )}
            </p>
            </div>
        </div>

        {/* Right */}

        <div className="flex items-center gap-6">

            <div className="w-60">

            <div className="mb-2 flex items-center justify-between">

                <span className="font-mono text-[10px] text-muted-foreground/45">
                Progress
                </span>

                <span className="text-sm font-medium transition-opacity duration-500 group-hover:opacity-80">
                {completed}/{checklist.length}
                </span>

            </div>

            <div className="h-[3px] overflow-hidden bg-border/40">

                <motion.div
                initial={false}
                animate={{
                    width: `${progress}%`,
                }}
                transition={{
                    duration: 0.5,
                }}
                className="h-full bg-primary"
                />

            </div>

            <p className="mt-2 text-right font-mono text-[10px] text-muted-foreground/45">
                {progress}% Complete
            </p>

            </div>

            <ChevronDown
            className={`h-5 w-5 shrink-0 transition-transform duration-300 ${
                expanded ? "rotate-180" : ""
            }`}
            />

        </div>
        </div>

        <AnimatePresence initial={false}>
            {expanded && (
                <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                    duration: 0.3,
                    ease: "easeInOut",
                }}
                className="overflow-hidden"
        >

        {/* Meta */}

        <div className="mt-8 flex flex-wrap gap-8">

          {employee.departmentId && (

            <div>
              <p className="font-mono text-[10px] text-muted-foreground/45">
                Department
              </p>
              <p className="mt-1 text-sm">
                {employee.departmentId.name}
              </p>
            </div>
          )}

          {employee.dateOfJoining && (
            <div>
              <p className="font-mono text-[10px] text-muted-foreground/45">
                Joining
              </p>

              <p className="mt-1 text-sm">
                {new Date(
                  employee.dateOfJoining
                ).toLocaleDateString()}
              </p>

            </div>

          )}

          <div>

            <p className="font-mono text-[10px] text-muted-foreground/45">
              Status
            </p>

            <p className="mt-1 capitalize text-sm">
              {employee.lifecycleStatus}
            </p>

          </div>

        </div>

        {/* Checklist */}

        <div className="mt-10">

          <WorkflowChecklist
            items={checklist}
            checks={checks}
            onToggle={onToggle}
          />

        </div>

        </motion.div>
    )}
    </AnimatePresence>

      </CardContent>

    </Card>
  );
}