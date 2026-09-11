"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface SearchResult {
  type: string;
  id: string;
  label: string;
  detail: string;
  link: string;
}

export default function GlobalSearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/platform/search?q=${encodeURIComponent(query)}`);
      const body = await res.json();
      if (body.success) setResults(body.data.results);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Global Search</h1>
        <p className="text-sm text-neutral-500">
          Searches organisations, users, admin users, audit events, subscription events, AI usage
          records, and API keys — across every tenant. This search is itself audited.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="Search by name, email, subdomain, ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>

      {loading && <p className="text-sm text-neutral-500">Searching…</p>}

      {searched && !loading && results.length === 0 && (
        <p className="text-sm text-neutral-400 italic">No matches found for &quot;{query}&quot;.</p>
      )}

      <div className="space-y-2">
        {results.map((r) => (
          <Link key={`${r.type}-${r.id}`} href={r.link}>
            <Card className="hover:bg-neutral-50 dark:hover:bg-neutral-900">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-neutral-500">{r.detail}</p>
                </div>
                <Badge variant="secondary">{r.type.replace(/_/g, " ")}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
