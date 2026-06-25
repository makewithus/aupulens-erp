"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
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
    <tr className="hover:bg-primary/5 transition-colors group">
      <td className="p-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 none-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-black text-primary">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>

          <div>
            <p className="font-black text-sm">{user.name}</p>

            {user.designation && (
              <p className="text-xs text-muted-foreground font-bold">
                {user.designation}
              </p>
            )}
          </div>
        </div>
      </td>

      <td className="p-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold">
            <Mail className="h-3 w-3 text-muted-foreground" />
            {user.email}
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
            <Phone className="h-3 w-3" />
            {user.phone}
          </div>
        </div>
      </td>

      <td className="p-6">
        {user.employeeId ? (
          <Badge className="none-full px-3 py-1 uppercase text-[9px] font-black border-2 bg-muted/50">
            {user.employeeId}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs font-bold">
            N/A
          </span>
        )}
      </td>

      <td className="p-6">
        <Badge
          className={`none-full px-3 py-1 uppercase text-[9px] font-black border-2 ${getRoleBadgeColor(
            user.role
          )}`}
        >
          {user.role}
        </Badge>
      </td>

      <td className="p-6">
        {user.department ? (
          <div className="flex items-center gap-2 text-xs font-bold">
            <Briefcase className="h-3 w-3 text-muted-foreground" />
            {user.department}
          </div>
        ) : (
          <span className="text-muted-foreground text-xs font-bold">
            N/A
          </span>
        )}
      </td>

      <td className="p-6 text-center">
        <Badge
          className={`none-full px-3 py-1 uppercase text-[9px] font-black border-2 ${
            user.status === "active"
              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
              : "bg-rose-500/10 text-rose-600 border-rose-500/20"
          }`}
        >
          {user.status}
        </Badge>
      </td>

      <td className="p-6 text-right">
        <div className="flex items-center justify-end gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onEdit(user)}
            className="h-9 w-9 none-xl hover:bg-primary/10"
          >
            <Pencil className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onToggleActive(user._id, user.status)
            }
            className={`none-xl h-9 px-4 font-black text-[9px] uppercase tracking-widest ${
              user.status === "active"
                ? "border-rose-500/20 text-rose-600 hover:bg-rose-500/10"
                : "border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/10"
            }`}
          >
            {user.status === "active"
              ? "Deactivate"
              : "Activate"}
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={() => onDelete(user._id)}
            className="h-9 w-9 none-xl text-rose-600 hover:bg-rose-500/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}