'use client';

import { useState, useEffect, useRef } from "react";
import { Search, Loader2, FileText, Target, Users, Phone, X, DollarSign } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    // Keyboard shortcut CMD+K or CTRL+K
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/crm/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.success) {
          setResults(data.data);
        }
      } catch (e) {
        console.error("Search error", e);
      } finally {
        setLoading(false);
      }
    }, 400); // Debounce
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (url: string) => {
    setIsOpen(false);
    setQuery("");
    router.push(url);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "Lead": return <Users className="w-4 h-4 text-blue-400" />;
      case "Account": return <Target className="w-4 h-4 text-purple-400" />;
      case "Opportunity": return <DollarSign className="w-4 h-4 text-yellow-400" />;
      case "Quote": return <FileText className="w-4 h-4 text-orange-400" />;
      default: return <FileText className="w-4 h-4 text-neutral-400" />;
    }
  };

  return (
    <div className="relative w-full max-w-md" ref={wrapperRef}>
      <div className="relative" onClick={() => setIsOpen(true)}>
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
        <Input 
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          placeholder="Global Search (Ctrl+K)..." 
          className="pl-9 bg-neutral-900 border-neutral-700 h-9 text-sm" 
        />
        {query && (
           <X className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 cursor-pointer" onClick={() => { setQuery(""); setResults([]); }} />
        )}
      </div>

      {isOpen && (query.length >= 2 || loading) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-50 max-h-[400px] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center p-4 text-neutral-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Searching...
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="p-4 text-center text-sm text-neutral-500">No results found for &quot;{query}&quot;</div>
          )}
          {!loading && results.length > 0 && (
            <div className="py-2">
              {results.map((r, idx) => (
                <div 
                  key={`${r.type}-${r.id}-${idx}`}
                  onClick={() => handleSelect(r.url)}
                  className="px-4 py-2 hover:bg-neutral-800 cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-neutral-950 p-1.5 rounded">
                       {/* Hardcode an icon mapping here since we didn't import DollarSign inside getIcon */}
                       <div className="w-4 h-4 text-neutral-400 font-bold flex items-center justify-center text-[10px]">{r.type[0]}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-neutral-200 group-hover:text-primary transition-colors">{r.title}</div>
                      <div className="text-xs text-neutral-500">{r.subtitle}</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] h-5">{r.type}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
