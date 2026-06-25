"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Mail,
  Phone,
  Pencil,
  Trash2,
} from "lucide-react";

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

interface UserRowProps {
  user: User;
  onEdit: (user: User) => void;
  onDelete: (userId: string) => void;
  onToggleActive: (userId: string, status: string) => void;
  getRoleBadgeColor: (role: string) => string;
}

export function UserRow({
  user,
  onEdit,
  onDelete,
  onToggleActive,
  getRoleBadgeColor,
}: UserRowProps) {
  return (
    <tr className="group transition-colors duration-300 hover:bg-white/[0.015]">
      {/* USER */}
      <td className="px-8 py-7">
        <div className="space-y-1">
          <h3 className="text-[18px] font-medium tracking-[-0.03em]">
            {user.name}
          </h3>

          {user.designation && (
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground/55">
              {user.designation}
            </p>
          )}
        </div>
      </td>

      {/* CONTACT */}
      <td className="px-8 py-7">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-3.5 w-3.5 text-muted-foreground/40" />
            <span>{user.email}</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-3.5 w-3.5 text-muted-foreground/40" />
            <span>{user.phone}</span>
          </div>
        </div>
      </td>

      {/* EMPLOYEE */}
      <td className="px-8 py-7">
        <span className="font-mono text-sm text-muted-foreground">
          {user.employeeId ?? "—"}
        </span>
      </td>

      {/* ROLE */}
      <td className="px-8 py-7">
        <Badge
          className={`
            rounded-none
            border-0
            bg-transparent
            px-0
            font-mono
            text-[12px]
            uppercase
            tracking-[0.12em]
            hover:bg-transparent
            shadow-none
            ${getRoleBadgeColor(user.role)}
          `}
        >
          {user.role}
        </Badge>
      </td>

      {/* DEPARTMENT */}
      <td className="px-8 py-7">
        <span className="text-sm text-muted-foreground">
          {user.department ?? "—"}
        </span>
      </td>

      {/* STATUS */}
      <td className="px-8 py-7">
        <div className="flex items-center justify-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              user.status === "active"
                ? "bg-[#8AE06C]"
                : "bg-[#F56868]"
            }`}
          />

          <span
            className={`font-mono text-[11px] uppercase tracking-[0.15em] ${
              user.status === "active"
                ? "text-[#8AE06C]"
                : "text-[#F56868]"
            }`}
          >
            {user.status}
          </span>
        </div>
      </td>

      {/* ACTIONS */}
      <td className="px-8 py-7">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(user)}
            className="h-8 w-8 rounded-none hover:bg-white/5"
          >
            <Pencil className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              onToggleActive(user._id, user.status)
            }
            className="h-8 w-8 rounded-none hover:bg-white/5"
          >
            <div
              className={`h-2 w-2 rounded-full ${
                user.status === "active"
                  ? "bg-[#F56868]"
                  : "bg-[#8AE06C]"
              }`}
            />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(user._id)}
            className="h-8 w-8 rounded-none text-[#F56868] hover:bg-white/5"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}