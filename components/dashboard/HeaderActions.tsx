"use client";

import { RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { UserNav } from "./UserNav";
import { cn } from "@/lib/utils";

interface HeaderActionsProps {
  isRefreshing: boolean;
  onRefresh: () => void;
  onToggleAi?: () => void;

  userName?: string;
  userEmail?: string;
  userRole?: string;

  profilePath?: string;
  onSignOut: () => void;
}

export function HeaderActions({
  isRefreshing,
  onRefresh,
  onToggleAi,
  userName,
  userEmail,
  userRole,
  profilePath,
  onSignOut,
}: HeaderActionsProps) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {/* Refresh */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onRefresh}
        disabled={isRefreshing}
        className={cn(
          "h-8 w-8 sm:h-9 sm:w-9 rounded-none transition-all duration-200",
          "hover:bg-accent hover:shadow-sm hover:scale-105",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        )}
        title="Refresh page"
      >
        <RefreshCw
          className={cn(
            "h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground transition-all duration-500",
            isRefreshing && "animate-spin text-primary",
            !isRefreshing && "hover:text-foreground"
          )}
        />
      </Button>

      {/* AI */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleAi}
        className="h-8 w-8 sm:h-9 sm:w-9 rounded-none transition-all duration-200 hover:bg-accent hover:shadow-sm hover:scale-105"
        title="Aupulens Copilot"
      >
        <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground transition-all duration-300 hover:text-primary" />
      </Button>

      
      {userName && (
        <UserNav
          userName={userName}
          userEmail={userEmail}
          userRole={userRole}
          onSignOut={onSignOut}
          profilePath={profilePath}
        />
      )}
    </div>
  );
}