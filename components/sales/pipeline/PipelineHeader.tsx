import { SearchInput } from "@/components/SearchInput";

interface PipelineHeaderProps {
  query: string;
  setQuery: (val: string) => void;
}

export function PipelineHeader({ query, setQuery }: PipelineHeaderProps) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between pb-2">
      <div className="shrink-0">
        <h2 className="text-4xl md:text-[56px] font-black tracking-tighter text-primary">
          Quote-to-Cash Pipeline
        </h2>
      </div>

      <div className="w-full max-w-sm">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search deals..."
        />
      </div>
    </div>
  );
}
