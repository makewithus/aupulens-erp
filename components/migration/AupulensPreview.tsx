"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from "lucide-react";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const ZOOM_OPTIONS = [0.75, 1, 1.25, 1.5];

type PreviewColumn = {
  key: string;
  label: string;
  source: "mapped" | "source";
  sourceColumn?: string | null;
};

function titleCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizePhoneLikeValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(trimmed)) {
    const expanded = Number(trimmed);
    if (Number.isFinite(expanded)) return formatIndianPhone(expanded.toFixed(0));
  }
  return formatIndianPhone(trimmed);
}

function formatIndianPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2)}`;
  }
  if (digits.length === 10) {
    return `+91 ${digits}`;
  }
  return value.trim();
}

function formatPreviewValue(column: PreviewColumn, value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  if (/phone|mobile|contact/i.test(column.key) || /phone|mobile|contact/i.test(column.label)) {
    return normalizePhoneLikeValue(raw);
  }
  return raw;
}

function previewCellValue(record: any, column: PreviewColumn): unknown {
  if (column.source === "source") return record.sourceData?.[column.key];
  const mappedValue = record.mappedData?.[column.key];
  if (mappedValue !== null && mappedValue !== undefined && String(mappedValue).trim() !== "") {
    return mappedValue;
  }
  return column.sourceColumn ? record.sourceData?.[column.sourceColumn] : mappedValue;
}

export function AupulensPreview({
  batchId,
  showInitialLoader = true,
}: {
  batchId: string;
  showInitialLoader?: boolean;
}) {
  const [entities, setEntities] = useState<{ _id: string, count: number }[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [columns, setColumns] = useState<PreviewColumn[]>([]);

  useEffect(() => {
    fetch(`/api/migration/batches/${batchId}/preview`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data.length > 0) {
          setEntities(data.data);
          setActiveTab(data.data[0]._id);
        }
      })
      .finally(() => setLoading(false));
  }, [batchId]);

  useEffect(() => {
    if (!activeTab) return;
    setRecordsLoading(true);
    const params = new URLSearchParams({
      entityType: activeTab,
      page: String(page),
      pageSize: String(pageSize),
    });
    fetch(`/api/migration/batches/${batchId}/preview?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setRecords(Array.isArray(data.data) ? data.data : []);
          setTotalRecords(data.meta?.total ?? data.data?.length ?? 0);
          setTotalPages(data.meta?.totalPages ?? 1);
          setColumns(Array.isArray(data.meta?.columns) ? data.meta.columns : []);
        }
      })
      .finally(() => setRecordsLoading(false));
  }, [batchId, activeTab, page, pageSize]);

  const activeEntityCount = entities.find(e => e._id === activeTab)?.count ?? totalRecords;
  const firstRow = totalRecords === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, totalRecords);

  if (loading) {
    if (!showInitialLoader) return null;
    return <div className="p-8 text-center"><Loader2 className="animate-spin w-8 h-8 mx-auto text-emerald-600" /></div>;
  }
  if (entities.length === 0) return null;

  return (
    <div className="mt-6 max-w-full overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="border-b px-5 py-4">
        <h3 className="text-lg font-bold text-slate-800">Aupulens Data Preview</h3>
        <p className="text-sm text-slate-500">Previewing how your valid records will appear in the system.</p>
      </div>
      
      <div className="flex border-b overflow-x-auto">
        {entities.map(e => (
          <button
            key={e._id}
            onClick={() => {
              setActiveTab(e._id);
              setPage(1);
            }}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === e._id ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {e._id} <span className="ml-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs">{e.count}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <div className="font-medium">
          Showing {firstRow}-{lastRow} of {totalRecords || activeEntityCount} records
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            Rows
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white p-1">
            <button
              type="button"
              onClick={() => setZoom((current) => ZOOM_OPTIONS[Math.max(0, ZOOM_OPTIONS.indexOf(current) - 1)] ?? current)}
              disabled={zoom === ZOOM_OPTIONS[0]}
              className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Zoom out"
              title="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="w-11 text-center font-medium">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((current) => ZOOM_OPTIONS[Math.min(ZOOM_OPTIONS.length - 1, ZOOM_OPTIONS.indexOf(current) + 1)] ?? current)}
              disabled={zoom === ZOOM_OPTIONS[ZOOM_OPTIONS.length - 1]}
              className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Zoom in"
              title="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white p-1">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous page"
              title="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-16 px-2 text-center font-medium">Page {page} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
              className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next page"
              title="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-full overflow-x-scroll overflow-y-hidden pb-2">
        {recordsLoading ? (
          <div className="p-8 text-center"><Loader2 className="animate-spin w-6 h-6 mx-auto text-emerald-600" /></div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No sample records found.</div>
        ) : (
          <table
            className="w-max min-w-full table-auto text-left text-slate-600"
            style={{ fontSize: `${14 * zoom}px` }}
          >
            <thead className="sticky top-0 z-10 text-xs text-slate-700 uppercase bg-slate-50 border-b">
              <tr>
                <th className="sticky left-0 z-20 whitespace-nowrap bg-slate-50 px-4 py-3 font-semibold">S.NO</th>
                {columns.map((column) => (
                  <th key={`${column.source}:${column.key}`} className="whitespace-nowrap px-4 py-3 font-semibold">
                    <span>{titleCase(column.label)}</span>
                    {column.source === "source" && (
                      <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Source</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i} className="bg-white border-b hover:bg-slate-50 transition-colors">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-3 font-semibold text-slate-500">
                    {(page - 1) * pageSize + i + 1}
                  </td>
                  {columns.map((column) => (
                    <td key={`${column.source}:${column.key}`} className="max-w-[280px] whitespace-nowrap px-4 py-3">
                      {formatPreviewValue(
                        column,
                        previewCellValue(r, column),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="border-t p-3 text-center text-xs text-slate-400 bg-slate-50/50">
        Use the table scrollbars for wide or tall data, zoom for readability, and pagination for large imports.
      </div>
    </div>
  );
}
