"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { LogOut, Shield, User, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface UserNavProps {
  userName: string;
  userEmail?: string;
  userRole?: string;
  onSignOut?: () => void;
  profilePath?: string;
}

export function UserNav({
  userName,
  userEmail,
  userRole,
  onSignOut,
  profilePath,
}: UserNavProps) {
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Default profile path based on user role
  const defaultProfilePath =
    userRole === "master-admin"
      ? "/master-admin/profile"
      : userRole === "admin"
        ? "/admin/profile"
        : "/finance/profile";
  const profileLink = profilePath || defaultProfilePath;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "relative h-8 sm:h-10 gap-1 sm:gap-2 rounded-none px-1.5 sm:px-2 hover:bg-accent/50",
            "transition-all duration-200 hover:shadow-sm",
          )}
        >
          <Avatar className="h-7 w-7 sm:h-8 sm:w-8 ring-2 ring-border/50 hover:ring-primary/50 transition-all duration-200">
            <AvatarFallback className="bg-linear-to-br from-primary to-primary/80 text-primary-foreground text-xs font-semibold">
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
          <ChevronDown className="hidden sm:block h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56 sm:w-64 p-2"
        align="end"
        forceMount
        sideOffset={8}
      >
        <DropdownMenuLabel className="font-normal p-3">
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10 ring-2 ring-primary/20">
              <AvatarFallback className="bg-linear-to-br from-primary to-primary/80 text-primary-foreground font-semibold">
                {getInitials(userName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col space-y-1 flex-1 min-w-0">
              <p className="text-sm font-semibold leading-none truncate">
                {userName}
              </p>
              {userEmail && (
                <p className="text-xs leading-none text-muted-foreground truncate">
                  {userEmail}
                </p>
              )}
              {userRole && (
                <Badge
                  variant="secondary"
                  className="mt-1.5 w-fit text-[10px] px-2 py-0.5 font-semibold bg-primary/10 text-primary border-primary/20"
                >
                  <Shield className="mr-1 h-3 w-3" />
                  {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
                </Badge>
              )}
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="my-2 bg-border/60" />

        <DropdownMenuItem asChild>
          <Link
            href={profileLink}
            className={cn(
              "cursor-pointer rounded-none px-3 py-2",
              "hover:bg-accent transition-colors duration-200",
              "group",
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-none bg-muted group-hover:bg-primary/10 transition-colors">
                  <User className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <span className="text-sm font-medium">Profile Settings</span>
              </div>
            </div>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-2 bg-border/60" />

        <DropdownMenuItem
          className={cn(
            "text-destructive focus:text-destructive focus:bg-destructive/10",
            "rounded-none px-3 py-2 cursor-pointer",
            "transition-colors duration-200",
            "group",
          )}
          onClick={onSignOut}
        >
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-none bg-destructive/10 group-hover:bg-destructive/20 transition-colors">
              <LogOut className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-medium">Sign out</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
