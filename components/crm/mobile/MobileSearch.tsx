'use client';

import { Input } from "@/components/ui/input";
import { Search, Clock, Star } from "lucide-react";

export default function MobileSearch() {
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input 
          placeholder="Search Leads, Contacts..." 
          className="pl-9 bg-card border-border rounded-full h-10"
        />
      </div>
      
      <div className="flex justify-between items-center px-1">
        <div className="text-xs text-muted-foreground font-medium flex items-center gap-1">
          <Clock className="w-3 h-3" /> Recent Records
        </div>
        <div className="text-xs text-muted-foreground font-medium flex items-center gap-1">
          <Star className="w-3 h-3" /> Favorites
        </div>
      </div>
    </div>
  );
}
