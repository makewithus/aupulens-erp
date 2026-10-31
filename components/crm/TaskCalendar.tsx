'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  format,
  startOfWeek,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  startOfYear,
  endOfYear,
  startOfDay,
  endOfDay,
  addYears,
  subYears,
  isSameDay,
  isToday,
} from "date-fns";
import {
  AlertTriangle,
  Sparkles,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Clock,
  Menu,
  X,
  Calendar as CalendarIcon,
  CheckCircle2,
  ExternalLink,
  Check,
  CalendarDays,
  Download,
  Trash2,
  Edit3,
  Copy,
  Video,
  Keyboard,
  Zap,
  ArrowRight,
  Sun,
  Volume2,
  VolumeX,
  Globe,
  Bell,
  Save,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useThemeStore } from "@/store/themeStore";
import { cn } from "@/lib/utils";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Enterprise Calendar — Full Google Calendar Dynamic Feature Specification.
 *
 * Capabilities:
 * 1. Precision 24-hour time grid with sticky hour headers and real-time red current-time marker with circle dot.
 * 2. Drag-and-drop event rescheduling across days and hours with optimistic updates & backend sync.
 * 3. Drag-to-select time intervals to create custom-duration meetings with Google-style Quick Add popover.
 * 4. Interactive Bottom-Edge Event Resizing: Drag the bottom border of any timed event to dynamically extend/shorten duration (15-min snapping).
 * 5. Google Calendar-style side-by-side overlapping events layout algorithm.
 * 6. Live "Happening Now" / "Up Next" Header Ticker with 1-click video meeting launch.
 * 7. Dual Timezone Gutter: View Local (e.g. GMT+5:30) alongside UTC/EST in the time gutter.
 * 8. Quick Add Popover + Full In-Depth Event Editor with inline edit capabilities.
 * 9. AI Smart Free Slot Finder (identifies top open schedule windows with 0 conflicts and visual grid highlights).
 * 10. 1-click Export to iCal (.ics) compatible with Google Calendar, Apple Calendar, and Outlook.
 * 11. Multi-view support: Day, 3-Day, Week, Month, Year Heatmap, and Agenda stream.
 * 12. Web Audio API soft chime audio feedback for actions (create, drop, resize) with mute toggle.
 * 13. Comprehensive keyboard shortcuts (T=Today, D=Day, 3=3-Day, W=Week, M=Month, Y=Year, A=Agenda, J/K=Nav, C=Create, /=Search).
 * 14. Branded, printer-friendly calendar PDF export.
 */

export interface UnifiedEvent {
  id: string;
  source: "calendar" | "task" | "leave" | "attendance" | "payment" | "payroll";
  type: string;
  title: string;
  start: string; // ISO string
  end?: string;  // ISO string
  allDay: boolean;
  url?: string;
  meta?: Record<string, any>;
}

// Enterprise brand color system
const SOURCE_META: Record<
  string,
  {
    label: string;
    color: string;
    bgLight: string;
    bgDark: string;
    borderLight: string;
    borderDark: string;
    textLight: string;
    textDark: string;
    dot: string;
  }
> = {
  task: {
    label: "CRM Tasks & Deadlines",
    color: "#6CADF5",
    bgLight: "bg-blue-500/15",
    bgDark: "bg-blue-500/20",
    borderLight: "border-blue-400",
    borderDark: "border-blue-500",
    textLight: "text-blue-700",
    textDark: "text-blue-300",
    dot: "bg-blue-500",
  },
  leave: {
    label: "HR Leaves & Vacations",
    color: "#A77DFF",
    bgLight: "bg-purple-500/15",
    bgDark: "bg-purple-500/20",
    borderLight: "border-purple-400",
    borderDark: "border-purple-500",
    textLight: "text-purple-700",
    textDark: "text-purple-300",
    dot: "bg-purple-500",
  },
  attendance: {
    label: "Attendance & Shifts",
    color: "#F56868",
    bgLight: "bg-rose-500/15",
    bgDark: "bg-rose-500/20",
    borderLight: "border-rose-400",
    borderDark: "border-rose-500",
    textLight: "text-rose-700",
    textDark: "text-rose-300",
    dot: "bg-rose-500",
  },
  payment: {
    label: "Invoices & Payments",
    color: "#8AE06C",
    bgLight: "bg-emerald-500/15",
    bgDark: "bg-emerald-500/20",
    borderLight: "border-emerald-400",
    borderDark: "border-emerald-500",
    textLight: "text-emerald-700",
    textDark: "text-emerald-300",
    dot: "bg-emerald-500",
  },
  payroll: {
    label: "Payroll Disbursements",
    color: "#F1DF38",
    bgLight: "bg-amber-500/15",
    bgDark: "bg-amber-500/20",
    borderLight: "border-amber-400",
    borderDark: "border-amber-500",
    textLight: "text-amber-700",
    textDark: "text-amber-300",
    dot: "bg-amber-500",
  },
  calendar: {
    label: "Meetings & Custom Events",
    color: "#B595FF",
    bgLight: "bg-indigo-500/15",
    bgDark: "bg-indigo-500/20",
    borderLight: "border-indigo-400",
    borderDark: "border-indigo-500",
    textLight: "text-indigo-700",
    textDark: "text-indigo-300",
    dot: "bg-indigo-500",
  },
};

const TASK_STATUSES = ["Pending", "In Progress", "Completed", "Overdue", "Cancelled"];
const TASK_PRIORITIES = ["Low", "Medium", "High", "Urgent"];
type ViewMode = "day" | "3-day" | "week" | "month" | "year" | "agenda";

const HOUR_ROW_HEIGHT = 60;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Web Audio API feedback synthesizer
function playCalendarChime(type: "create" | "drop" | "resize" | "alert" = "drop", enabled = true) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.04, ctx.currentTime);

    if (type === "drop" || type === "resize") {
      osc.frequency.setValueAtTime(392, ctx.currentTime); // G4
      osc.frequency.exponentialRampToValueAtTime(784, ctx.currentTime + 0.12); // G5
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === "create") {
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); // E5
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
    } else if (type === "alert") {
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch {
    // Ignore audio permission or blocked context
  }
}

// iCalendar RFC-5545 export generator
function exportToICS(events: UnifiedEvent[], filename = "aupulens-schedule.ics") {
  const pad = (n: number) => String(n).padStart(2, "0");
  const formatICSDate = (isoStr: string) => {
    const d = new Date(isoStr);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  };

  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Aupulens ERP//Smart Enterprise Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const e of events) {
    const startStr = e.start ? formatICSDate(e.start) : formatICSDate(new Date().toISOString());
    const endStr = e.end
      ? formatICSDate(e.end)
      : formatICSDate(new Date(new Date(e.start).getTime() + 3600000).toISOString());

    icsLines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@aupulens.com`,
      `DTSTAMP:${formatICSDate(new Date().toISOString())}`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      `SUMMARY:${(e.title || "Untitled Event").replace(/[\n\r]/g, " ")}`,
      `DESCRIPTION:${(e.meta?.description || e.type || "").toString().replace(/[\n\r]/g, " ")}`,
      "STATUS:CONFIRMED",
      "END:VEVENT"
    );
  }

  icsLines.push("END:VCALENDAR");
  const blob = new Blob([icsLines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function TaskCalendar() {
  const { theme } = useThemeStore();
  const isDark = theme !== "light";

  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [conflicts, setConflicts] = useState<any[] | null>(null);
  const [conflictSummary, setConflictSummary] = useState<string>("");
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Sound and secondary timezone controls
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showSecondaryTz, setShowSecondaryTz] = useState(false);
  const [highlightFreeSlots, setHighlightFreeSlots] = useState(false);

  // Source filters
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(
    new Set(Object.keys(SOURCE_META))
  );
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  // Selected event modal, creation modal, keyboard modal
  const [selectedEvent, setSelectedEvent] = useState<UnifiedEvent | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [aiSuggestionsOpen, setAiSuggestionsOpen] = useState(false);

  // Quick Add Popover State (Google Calendar signature)
  const [quickAddState, setQuickAddState] = useState<{
    open: boolean;
    day: Date;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
    title: string;
    type: string;
  } | null>(null);

  // Drag-and-drop & resize state
  const [draggedEvent, setDraggedEvent] = useState<UnifiedEvent | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Full Create/Edit form data
  const [createFormData, setCreateFormData] = useState({
    title: "",
    type: "meeting",
    startDate: format(new Date(), "yyyy-MM-dd"),
    startTime: "09:00",
    endDate: format(new Date(), "yyyy-MM-dd"),
    endTime: "10:00",
    allDay: false,
    description: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Event details inspector inline edit mode
  const [isEditingSelected, setIsEditingSelected] = useState(false);
  const [editFormData, setEditFormData] = useState({
    title: "",
    type: "meeting",
    startDate: "",
    startTime: "09:00",
    endDate: "",
    endTime: "10:00",
    allDay: false,
    description: "",
  });

  // Real-time clock update every 30 seconds
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Time grid scroll ref to auto-scroll to current or working hours
  const timeGridScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (timeGridScrollRef.current && (viewMode === "week" || viewMode === "day" || viewMode === "3-day")) {
      const targetHour = Math.max(0, Math.min(22, currentTime.getHours() - 1));
      timeGridScrollRef.current.scrollTop = targetHour * HOUR_ROW_HEIGHT;
    }
  }, [viewMode]);

  // Compute active range
  const { rangeStart, rangeEnd, rangeLabel } = useMemo(() => {
    if (viewMode === "day") {
      return {
        rangeStart: anchorDate,
        rangeEnd: anchorDate,
        rangeLabel: format(anchorDate, "EEEE, MMMM d, yyyy"),
      };
    }
    if (viewMode === "3-day") {
      const e = addDays(anchorDate, 2);
      return {
        rangeStart: anchorDate,
        rangeEnd: e,
        rangeLabel: `${format(anchorDate, "MMM d")} – ${format(e, "MMM d, yyyy")} (3-Day)`,
      };
    }
    if (viewMode === "week") {
      const s = startOfWeek(anchorDate, { weekStartsOn: 0 }); // Sunday start
      const e = addDays(s, 6);
      return {
        rangeStart: s,
        rangeEnd: e,
        rangeLabel: `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`,
      };
    }
    if (viewMode === "month") {
      return {
        rangeStart: startOfMonth(anchorDate),
        rangeEnd: endOfMonth(anchorDate),
        rangeLabel: format(anchorDate, "MMMM yyyy"),
      };
    }
    if (viewMode === "year") {
      return {
        rangeStart: startOfYear(anchorDate),
        rangeEnd: endOfYear(anchorDate),
        rangeLabel: format(anchorDate, "yyyy"),
      };
    }
    const s = anchorDate;
    const e = addDays(s, 30);
    return {
      rangeStart: s,
      rangeEnd: e,
      rangeLabel: `Next 30 Days (${format(s, "MMM d")} - ${format(e, "MMM d")})`,
    };
  }, [viewMode, anchorDate]);

  // Fetch unified events
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setConflicts(null);
    try {
      const from = rangeStart.toISOString();
      const to = addDays(rangeEnd, 1).toISOString();
      const res = await fetch(`/api/calendar?from=${from}&to=${to}`);
      const d = await res.json();
      if (d.success) setEvents(d.data || []);
    } catch (err) {
      console.error("Failed to fetch calendar events:", err);
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Conflict detector
  const checkConflicts = useCallback(async () => {
    setCheckingConflicts(true);
    try {
      const from = rangeStart.toISOString();
      const to = addDays(rangeEnd, 1).toISOString();
      const res = await fetch(`/api/calendar/conflicts?from=${from}&to=${to}&ai=true`);
      const d = await res.json();
      if (d.success) {
        setConflicts(d.data.conflicts || []);
        setConflictSummary(d.data.summary || "");
        playCalendarChime("alert", soundEnabled);
      }
    } catch (err) {
      console.error("Conflict check error:", err);
    } finally {
      setCheckingConflicts(false);
    }
  }, [rangeStart, rangeEnd, soundEnabled]);

  // Toast / notification notice
  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  // Handle Event Creation (Full Modal)
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createFormData.title.trim()) return;

    setIsSubmitting(true);
    try {
      const startDateTime = createFormData.allDay
        ? new Date(`${createFormData.startDate}T00:00:00`)
        : new Date(`${createFormData.startDate}T${createFormData.startTime || "09:00"}:00`);
      const endDateTime = createFormData.allDay
        ? new Date(`${createFormData.endDate}T23:59:59`)
        : new Date(`${createFormData.endDate}T${createFormData.endTime || "10:00"}:00`);

      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createFormData.title,
          type: createFormData.type,
          start: startDateTime.toISOString(),
          end: endDateTime.toISOString(),
          allDay: createFormData.allDay,
          description: createFormData.description,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCreateModalOpen(false);
        setCreateFormData({
          title: "",
          type: "meeting",
          startDate: format(anchorDate, "yyyy-MM-dd"),
          startTime: "09:00",
          endDate: format(anchorDate, "yyyy-MM-dd"),
          endTime: "10:00",
          allDay: false,
          description: "",
        });
        playCalendarChime("create", soundEnabled);
        showNotice("Event created successfully");
        fetchEvents();
      }
    } catch (err) {
      console.error("Error creating calendar event:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Quick Add Popover Save (Google Calendar Style 1-Click Save)
  const handleQuickAddSave = async () => {
    if (!quickAddState || !quickAddState.title.trim()) return;

    setIsSubmitting(true);
    try {
      const startD = new Date(quickAddState.day);
      startD.setHours(quickAddState.startHour, quickAddState.startMinute, 0, 0);

      const endD = new Date(quickAddState.day);
      endD.setHours(quickAddState.endHour, quickAddState.endMinute, 0, 0);

      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: quickAddState.title,
          type: quickAddState.type,
          start: startD.toISOString(),
          end: endD.toISOString(),
          allDay: false,
          description: "",
        }),
      });

      const data = await res.json();
      if (data.success) {
        setQuickAddState(null);
        playCalendarChime("create", soundEnabled);
        showNotice(`Created "${quickAddState.title}"`);
        fetchEvents();
      }
    } catch (err) {
      console.error("Quick add failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Event Deletion
  const handleDeleteEvent = async (eventToDelete: UnifiedEvent) => {
    try {
      if (eventToDelete.source === "calendar") {
        await fetch(`/api/calendar?id=${eventToDelete.id}`, { method: "DELETE" });
      }
      setEvents((prev) => prev.filter((e) => e.id !== eventToDelete.id));
      setSelectedEvent(null);
      setIsEditingSelected(false);
      playCalendarChime("drop", soundEnabled);
      showNotice(`Deleted "${eventToDelete.title}"`);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  // Handle Event Duplication
  const handleDuplicateEvent = async (e: UnifiedEvent) => {
    const nextStart = addDays(new Date(e.start), 1);
    const nextEnd = e.end ? addDays(new Date(e.end), 1) : addDays(nextStart, 1);
    try {
      await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${e.title} (Copy)`,
          type: e.type || "meeting",
          start: nextStart.toISOString(),
          end: nextEnd.toISOString(),
          allDay: e.allDay,
          description: e.meta?.description || "",
        }),
      });
      setSelectedEvent(null);
      setIsEditingSelected(false);
      playCalendarChime("create", soundEnabled);
      showNotice("Event duplicated to tomorrow");
      fetchEvents();
    } catch (err) {
      console.error("Duplicate error:", err);
    }
  };

  // Handle Inline Edit Save
  const handleSaveInlineEdit = async () => {
    if (!selectedEvent || !editFormData.title.trim()) return;

    const startDateTime = editFormData.allDay
      ? new Date(`${editFormData.startDate}T00:00:00`)
      : new Date(`${editFormData.startDate}T${editFormData.startTime}:00`);
    const endDateTime = editFormData.allDay
      ? new Date(`${editFormData.endDate}T23:59:59`)
      : new Date(`${editFormData.endDate}T${editFormData.endTime}:00`);

    // Optimistic update
    setEvents((prev) =>
      prev.map((e) =>
        e.id === selectedEvent.id
          ? {
              ...e,
              title: editFormData.title,
              type: editFormData.type,
              start: startDateTime.toISOString(),
              end: endDateTime.toISOString(),
              allDay: editFormData.allDay,
              meta: { ...e.meta, description: editFormData.description },
            }
          : e
      )
    );

    if (selectedEvent.source === "calendar") {
      try {
        await fetch("/api/calendar", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selectedEvent.id,
            title: editFormData.title,
            type: editFormData.type,
            start: startDateTime.toISOString(),
            end: endDateTime.toISOString(),
            allDay: editFormData.allDay,
            description: editFormData.description,
          }),
        });
      } catch (err) {
        console.error("Failed to persist edit:", err);
      }
    }

    setSelectedEvent({
      ...selectedEvent,
      title: editFormData.title,
      type: editFormData.type,
      start: startDateTime.toISOString(),
      end: endDateTime.toISOString(),
      allDay: editFormData.allDay,
      meta: { ...selectedEvent.meta, description: editFormData.description },
    });
    setIsEditingSelected(false);
    playCalendarChime("drop", soundEnabled);
    showNotice(`Updated "${editFormData.title}"`);
  };

  // Handle Drag-and-Drop Drop slot
  const handleDropSlot = async (targetDay: Date, targetHour: number) => {
    if (!draggedEvent) return;

    const originalStart = new Date(draggedEvent.start);
    const durationMs = draggedEvent.end
      ? new Date(draggedEvent.end).getTime() - originalStart.getTime()
      : 3600000;

    const newStart = new Date(targetDay);
    newStart.setHours(targetHour, originalStart.getMinutes(), 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);

    // Optimistic update
    setEvents((prev) =>
      prev.map((e) =>
        e.id === draggedEvent.id
          ? { ...e, start: newStart.toISOString(), end: newEnd.toISOString() }
          : e
      )
    );

    playCalendarChime("drop", soundEnabled);
    showNotice(`Rescheduled "${draggedEvent.title}" to ${format(newStart, "EEE, MMM d @ h:mm a")}`);

    if (draggedEvent.source === "calendar") {
      try {
        await fetch("/api/calendar", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: draggedEvent.id,
            start: newStart.toISOString(),
            end: newEnd.toISOString(),
          }),
        });
      } catch (err) {
        console.error("Failed to persist dragged reschedule:", err);
      }
    }

    setDraggedEvent(null);
  };

  // Handle Event Resizing (Bottom edge drag)
  const handleResizeEvent = async (eventToResize: UnifiedEvent, newEnd: Date) => {
    // Optimistic update
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventToResize.id
          ? { ...e, end: newEnd.toISOString() }
          : e
      )
    );

    playCalendarChime("resize", soundEnabled);
    const durMins = Math.round((newEnd.getTime() - new Date(eventToResize.start).getTime()) / 60000);
    const hours = Math.floor(durMins / 60);
    const mins = durMins % 60;
    const durLabel = hours > 0 ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`) : `${mins}m`;
    showNotice(`Resized "${eventToResize.title}" to ${durLabel}`);

    if (eventToResize.source === "calendar") {
      try {
        await fetch("/api/calendar", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: eventToResize.id,
            end: newEnd.toISOString(),
          }),
        });
      } catch (err) {
        console.error("Failed to persist resize:", err);
      }
    }
  };

  // Google Calendar Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
        return;
      }

      switch (e.key) {
        case "t":
        case "T":
          goToday();
          break;
        case "d":
        case "D":
        case "1":
          setViewMode("day");
          break;
        case "3":
          setViewMode("3-day");
          break;
        case "w":
        case "W":
        case "2":
          setViewMode("week");
          break;
        case "m":
        case "M":
        case "4":
          setViewMode("month");
          break;
        case "y":
        case "Y":
        case "5":
          setViewMode("year");
          break;
        case "a":
        case "A":
        case "6":
          setViewMode("agenda");
          break;
        case "j":
        case "n":
          goNext();
          break;
        case "k":
        case "p":
          goPrev();
          break;
        case "c":
        case "C":
          openSlotCreate(anchorDate, 10);
          break;
        case "/":
          e.preventDefault();
          const searchInput = document.getElementById("calendar-search-input");
          searchInput?.focus();
          break;
        case "?":
          setShortcutsModalOpen(true);
          break;
        case "Escape":
          setCreateModalOpen(false);
          setSelectedEvent(null);
          setIsEditingSelected(false);
          setShortcutsModalOpen(false);
          setAiSuggestionsOpen(false);
          setQuickAddState(null);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [anchorDate]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (!sourceFilter.has(e.source)) return false;
      if (e.source === "task") {
        if (statusFilter !== "all" && e.meta?.status !== statusFilter) return false;
        if (priorityFilter !== "all" && e.meta?.priority !== priorityFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = e.title.toLowerCase().includes(q);
        const matchesSource = (SOURCE_META[e.source]?.label || "").toLowerCase().includes(q);
        return matchesTitle || matchesSource;
      }
      return true;
    });
  }, [events, sourceFilter, statusFilter, priorityFilter, searchQuery]);

  // Live and Upcoming Event calculation for top banner
  const { liveEvent, upcomingEvent } = useMemo(() => {
    const nowMs = currentTime.getTime();
    let live: UnifiedEvent | null = null;
    let upNext: UnifiedEvent | null = null;

    for (const e of filteredEvents) {
      if (e.allDay) continue;
      const s = new Date(e.start).getTime();
      const end = e.end ? new Date(e.end).getTime() : s + 3600000;

      if (s <= nowMs && nowMs <= end) {
        live = e;
        break;
      }
      if (s > nowMs && s <= nowMs + 45 * 60000) {
        if (!upNext || s < new Date(upNext.start).getTime()) {
          upNext = e;
        }
      }
    }
    return { liveEvent: live, upcomingEvent: upNext };
  }, [filteredEvents, currentTime]);

  // Group events by day key (yyyy-MM-dd)
  const eventsByDay = useMemo(() => {
    const map = new Map<string, UnifiedEvent[]>();
    for (const e of filteredEvents) {
      const key = format(new Date(e.start), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [filteredEvents]);

  // AI Free Slot Finder Algorithm
  const freeSlotSuggestions = useMemo(() => {
    const suggestions: Array<{ day: Date; startHour: number; duration: number; label: string }> = [];
    const checkDays = viewMode === "day"
      ? [anchorDate]
      : viewMode === "3-day"
      ? [anchorDate, addDays(anchorDate, 1), addDays(anchorDate, 2)]
      : Array.from({ length: 7 }).map((_, i) => addDays(startOfWeek(anchorDate, { weekStartsOn: 0 }), i));

    for (const d of checkDays) {
      const dayKey = format(d, "yyyy-MM-dd");
      const dayEvents = (eventsByDay.get(dayKey) || []).filter((e) => !e.allDay);

      const occupiedHours = new Set<number>();
      for (const e of dayEvents) {
        const sH = new Date(e.start).getHours();
        const eH = e.end ? new Date(e.end).getHours() : sH + 1;
        for (let h = sH; h <= eH; h++) occupiedHours.add(h);
      }

      // Check standard business hours: 10 AM, 11 AM, 2 PM, 3 PM, 4 PM
      const candidateHours = [10, 11, 14, 15, 16];
      for (const h of candidateHours) {
        if (!occupiedHours.has(h) && !occupiedHours.has(h + 1)) {
          suggestions.push({
            day: d,
            startHour: h,
            duration: 1,
            label: `${format(d, "EEE, MMM d")} at ${h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`} (1 hr open)`,
          });
          if (suggestions.length >= 4) break;
        }
      }
      if (suggestions.length >= 4) break;
    }
    return suggestions;
  }, [anchorDate, viewMode, eventsByDay]);

  // Source toggle
  const toggleSource = (key: string) => {
    setSourceFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Navigators
  const goPrev = () => {
    setAnchorDate((d) => {
      if (viewMode === "day") return subDays(d, 1);
      if (viewMode === "3-day") return subDays(d, 3);
      if (viewMode === "week") return subWeeks(d, 1);
      if (viewMode === "month") return subMonths(d, 1);
      if (viewMode === "year") return subYears(d, 1);
      return subDays(d, 7);
    });
  };

  const goNext = () => {
    setAnchorDate((d) => {
      if (viewMode === "day") return addDays(d, 1);
      if (viewMode === "3-day") return addDays(d, 3);
      if (viewMode === "week") return addWeeks(d, 1);
      if (viewMode === "month") return addMonths(d, 1);
      if (viewMode === "year") return addYears(d, 1);
      return addDays(d, 7);
    });
  };

  const goToday = () => setAnchorDate(new Date());

  // Slot click handler -> opens Quick Add Popover directly (Google Calendar signature)
  const handleSlotSelect = (day: Date, startHour: number, endHour = startHour + 1) => {
    setQuickAddState({
      open: true,
      day,
      startHour,
      startMinute: 0,
      endHour,
      endMinute: 0,
      title: "",
      type: "meeting",
    });
  };

  // Full slot create modal open
  const openSlotCreate = (day: Date, hour: number, endHour?: number) => {
    const dayStr = format(day, "yyyy-MM-dd");
    const hourStr = String(hour).padStart(2, "0");
    const finalEndHour = endHour !== undefined ? endHour : Math.min(23, hour + 1);
    const endHourStr = String(finalEndHour).padStart(2, "0");

    setCreateFormData({
      title: "",
      type: "meeting",
      startDate: dayStr,
      startTime: `${hourStr}:00`,
      endDate: dayStr,
      endTime: `${endHourStr}:00`,
      allDay: false,
      description: "",
    });
    setCreateModalOpen(true);
  };

  // Open inspector modal with populated edit form
  const handleOpenEventInspector = (e: UnifiedEvent) => {
    setSelectedEvent(e);
    setIsEditingSelected(false);
    const s = new Date(e.start);
    const end = e.end ? new Date(e.end) : new Date(s.getTime() + 3600000);
    setEditFormData({
      title: e.title,
      type: e.type || "meeting",
      startDate: format(s, "yyyy-MM-dd"),
      startTime: format(s, "HH:mm"),
      endDate: format(end, "yyyy-MM-dd"),
      endTime: format(end, "HH:mm"),
      allDay: !!e.allDay,
      description: e.meta?.description ? String(e.meta.description) : "",
    });
  };

  const conflictDays = new Set((conflicts || []).map((c) => c.date));

  const printSchedule = () => {
    const eventsForPrint = filteredEvents
      .filter((event) => {
        const date = new Date(event.start);
        return date >= startOfDay(rangeStart) && date <= endOfDay(rangeEnd);
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    void (async () => {
      try {
        const pdf = await PDFDocument.create();
        pdf.setTitle("Aupulens ERP | Enterprise Calendar");
        pdf.setAuthor("Aupulens ERP");
        const regular = await pdf.embedFont(StandardFonts.Helvetica);
        const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
        const pageWidth = 841.89;
        const pageHeight = 595.28;
        const margin = 36;
        const contentWidth = pageWidth - margin * 2;
        const columns = [96, 76, 262, 190, contentWidth - 624];
        const headers = ["DATE", "TIME", "EVENT", "CATEGORY", "STATUS"];
        const colors = {
          ink: rgb(0.12, 0.12, 0.14),
          muted: rgb(0.38, 0.39, 0.43),
          purple: rgb(0.53, 0.25, 0.88),
          palePurple: rgb(0.95, 0.92, 0.99),
          header: rgb(0.08, 0.08, 0.09),
          border: rgb(0.83, 0.83, 0.86),
          row: rgb(0.97, 0.97, 0.98),
          white: rgb(1, 1, 1),
        };
        const fontSize = 9;
        const lineHeight = 11.5;
        const cellPadding = 7;
        const bottomLimit = 42;
        let pageNumber = 0;
        let page = pdf.addPage([pageWidth, pageHeight]);
        let rowIndex = 0;
        let y = 0;

        const wrapText = (text: string, font: typeof regular, maxWidth: number) => {
          // Standard Helvetica uses WinAnsi and cannot represent symbols such
          // as the Indian rupee sign. Normalize each dynamic value before both
          // measuring and drawing it so a single event can never abort export.
          const safeText = Array.from(String(text)).map((character) => {
            if (character === "₹") return "INR";
            try {
              font.encodeText(character);
              return character;
            } catch {
              const latinFallback = character.normalize("NFKD").replace(/\p{M}/gu, "");
              if (latinFallback && Array.from(latinFallback).every((part) => {
                try { font.encodeText(part); return true; } catch { return false; }
              })) return latinFallback;
              return "?";
            }
          }).join("").replace(/\s+/g, " ").trim();
          const words = safeText.split(/\s+/).filter(Boolean);
          const lines: string[] = [];
          let line = "";
          for (const word of words) {
            const candidate = line ? `${line} ${word}` : word;
            if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth || !line) {
              line = candidate;
            } else {
              lines.push(line);
              line = word;
            }
          }
          if (line) lines.push(line);
          return lines.length ? lines : [""];
        };

        const startPage = () => {
          pageNumber += 1;
          if (pageNumber > 1) page = pdf.addPage([pageWidth, pageHeight]);
          page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: colors.white });
          page.drawRectangle({ x: margin, y: pageHeight - margin - 76, width: contentWidth, height: 76, color: colors.header });
          page.drawRectangle({ x: margin, y: pageHeight - margin - 76, width: 5, height: 76, color: colors.purple });
          page.drawText("AUPULENS ERP", { x: margin + 20, y: pageHeight - margin - 25, size: 8, font: bold, color: rgb(0.78, 0.63, 1) });
          page.drawText("Enterprise Calendar", { x: margin + 20, y: pageHeight - margin - 51, size: 21, font: bold, color: colors.white });
          page.drawText(rangeLabel, { x: margin + 20, y: pageHeight - margin - 67, size: 9, font: regular, color: rgb(0.82, 0.82, 0.85) });
          y = pageHeight - margin - 76 - 18;
          const headerHeight = 24;
          page.drawRectangle({ x: margin, y: y - headerHeight, width: contentWidth, height: headerHeight, color: colors.palePurple });
          let x = margin;
          headers.forEach((label, index) => {
            page.drawText(label, { x: x + cellPadding, y: y - 16, size: 7.5, font: bold, color: colors.purple });
            x += columns[index];
          });
          page.drawLine({ start: { x: margin, y: y - headerHeight }, end: { x: margin + contentWidth, y: y - headerHeight }, thickness: 1, color: colors.purple });
          y -= headerHeight;
        };

        const drawFooter = () => {
          page.drawLine({ start: { x: margin, y: 28 }, end: { x: pageWidth - margin, y: 28 }, thickness: 0.6, color: colors.border });
          page.drawText("Aupulens ERP  •  Enterprise Calendar", { x: margin, y: 16, size: 7.5, font: regular, color: colors.muted });
          const pageLabel = `Page ${pageNumber}`;
          page.drawText(pageLabel, { x: pageWidth - margin - regular.widthOfTextAtSize(pageLabel, 7.5), y: 16, size: 7.5, font: regular, color: colors.muted });
        };

        startPage();
        if (eventsForPrint.length === 0) {
          page.drawText("No events in this period.", { x: margin + cellPadding, y: y - 18, size: 10, font: regular, color: colors.muted });
        }

        for (const event of eventsForPrint) {
          const date = new Date(event.start);
          const time = event.allDay
            ? "All day"
            : `${format(date, "h:mm a")}${event.end ? ` – ${format(new Date(event.end), "h:mm a")}` : ""}`;
          const values = [
            format(date, "EEE, MMM d, yyyy"),
            time,
            event.title,
            SOURCE_META[event.source]?.label || "Calendar",
            event.meta?.status ? String(event.meta.status) : "—",
          ];
          const wrapped = values.map((value, index) => wrapText(value, regular, columns[index] - cellPadding * 2));
          const rowHeight = Math.max(25, Math.max(...wrapped.map((lines) => lines.length)) * lineHeight + cellPadding * 2);
          if (y - rowHeight < bottomLimit) {
            drawFooter();
            startPage();
          }
          if (rowIndex % 2 === 1) page.drawRectangle({ x: margin, y: y - rowHeight, width: contentWidth, height: rowHeight, color: colors.row });
          let x = margin;
          wrapped.forEach((lines, index) => {
            lines.forEach((line, lineIndex) => {
              page.drawText(line, {
                x: x + cellPadding,
                y: y - cellPadding - fontSize - lineIndex * lineHeight,
                size: fontSize,
                font: regular,
                color: index === 4 && /overdue/i.test(line) ? rgb(0.75, 0.12, 0.18) : colors.ink,
              });
            });
            x += columns[index];
          });
          page.drawLine({ start: { x: margin, y: y - rowHeight }, end: { x: margin + contentWidth, y: y - rowHeight }, thickness: 0.5, color: colors.border });
          let dividerX = margin;
          columns.slice(0, -1).forEach((width) => {
            dividerX += width;
            page.drawLine({ start: { x: dividerX, y }, end: { x: dividerX, y: y - rowHeight }, thickness: 0.35, color: colors.border });
          });
          y -= rowHeight;
          rowIndex += 1;
        }

        drawFooter();
        const bytes = await pdf.save();
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `aupulens-enterprise-calendar-${format(rangeStart, "yyyy-MM-dd")}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        showNotice("Calendar PDF downloaded");
      } catch (error) {
        console.error("Calendar PDF export failed:", error);
        showNotice("Could not create the calendar PDF. Please try again.");
      }
    })();
  };

  return (
    <>
    <div
      className={cn(
        "flex flex-col h-[calc(100vh-140px)] min-h-[720px] rounded-lg border font-mono shadow-sm transition-colors overflow-hidden relative print:hidden",
        isDark ? "bg-[#0A0A0A] border-[#272727] text-[#F2F2F2]" : "bg-white border-slate-200 text-slate-900"
      )}
    >
      {/* ── TOP CONTROL BAR ── */}
      <div
        className={cn(
          "flex items-center justify-between px-3 sm:px-4 py-2 border-b gap-2 sm:gap-3 flex-wrap sm:flex-nowrap print:hidden",
          isDark ? "bg-[#161616] border-[#272727]" : "bg-slate-50/80 border-slate-200"
        )}
      >
        {/* Left: Sidebar toggle, Today, Nav arrows, Date Title */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Toggle sidebar"
          >
            <Menu className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={goToday}
            className={cn(
              "h-8 px-3 text-xs font-mono rounded-full border shadow-xs transition-colors",
              isDark ? "bg-[#1E1E1E] border-[#333] hover:bg-[#2A2A2A] text-foreground" : "bg-white border-slate-300 hover:bg-slate-100 text-slate-800"
            )}
            title="Jump to today (Shortcut: T)"
          >
            Today
          </Button>

          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={goPrev}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Previous (Shortcut: J or P)"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={goNext}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Next (Shortcut: K or N)"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <h2 className="text-sm sm:text-base md:text-lg font-bold tracking-tight text-foreground whitespace-nowrap pl-1">
            {rangeLabel}
          </h2>
        </div>

        {/* Right: Search, AI Free Slots, Conflicts, iCal Export, Shortcuts, View Switcher */}
        <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-end flex-wrap">
          {/* Quick Search */}
          <div className="relative hidden md:block w-36 lg:w-44">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              id="calendar-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search (/)"
              className={cn(
                "h-8 pl-8 pr-2 text-xs rounded-md shadow-none font-mono",
                isDark ? "bg-[#1A1A1A] border-[#333]" : "bg-white border-slate-200"
              )}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-2 text-xs text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            )}
          </div>

          {/* AI Free Slot Finder Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAiSuggestionsOpen((prev) => !prev);
              setHighlightFreeSlots((prev) => !prev);
            }}
            className={cn(
              "h-8 gap-1.5 text-xs font-mono border shadow-xs transition-colors px-2.5",
              highlightFreeSlots
                ? "bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold"
                : isDark
                ? "bg-[#1E1E1E] border-[#333] hover:bg-[#2A2A2A] text-emerald-400"
                : "bg-white border-slate-300 hover:bg-slate-50 text-emerald-600"
            )}
            title="Highlight & recommend best free meeting windows"
          >
            <Zap className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">AI Free Slots</span>
          </Button>

          {/* Detect Conflicts (AI) */}
          <Button
            variant="outline"
            size="sm"
            onClick={checkConflicts}
            disabled={checkingConflicts}
            className={cn(
              "h-8 gap-1.5 text-xs font-mono border shadow-xs transition-colors px-2.5",
              isDark ? "bg-[#1E1E1E] border-[#333] hover:bg-[#2A2A2A] text-purple-400" : "bg-white border-slate-300 hover:bg-slate-50 text-purple-600"
            )}
            title="Scan for collisions between CRM tasks & HR leaves"
          >
            {checkingConflicts ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">AI Conflicts</span>
          </Button>

          {/* Dual Timezone Toggle */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowSecondaryTz((prev) => !prev)}
            className={cn(
              "h-8 w-8 hidden md:flex border shadow-xs transition-colors",
              showSecondaryTz
                ? "bg-purple-600 text-white border-purple-600"
                : isDark
                ? "bg-[#1E1E1E] border-[#333] text-muted-foreground hover:text-foreground"
                : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
            )}
            title={`Toggle Dual Timezone (UTC) ${showSecondaryTz ? "ON" : "OFF"}`}
          >
            <Globe className="h-3.5 w-3.5" />
          </Button>

          {/* Sound Audio Chime Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSoundEnabled((prev) => !prev)}
            className="h-8 w-8 text-muted-foreground hover:text-foreground hidden sm:flex"
            title={`Action audio chimes ${soundEnabled ? "Enabled" : "Muted"}`}
          >
            {soundEnabled ? <Volume2 className="h-3.5 w-3.5 text-purple-400" /> : <VolumeX className="h-3.5 w-3.5 opacity-40" />}
          </Button>

          {/* Print Schedule */}
          <Button
            variant="outline"
            size="icon"
            onClick={printSchedule}
            className={cn(
              "h-8 w-8 hidden lg:flex border shadow-xs transition-colors",
              isDark ? "bg-[#1E1E1E] border-[#333] text-muted-foreground hover:text-foreground" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
            )}
            title="Download Calendar PDF"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>

          {/* iCal / Google Calendar Export */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportToICS(filteredEvents, `aupulens-${format(anchorDate, "yyyy-MM")}.ics`)}
            className={cn(
              "h-8 gap-1 text-xs font-mono border shadow-xs transition-colors px-2",
              isDark ? "bg-[#1E1E1E] border-[#333] hover:bg-[#2A2A2A] text-foreground" : "bg-white border-slate-300 hover:bg-slate-50 text-slate-800"
            )}
            title="Export calendar to .ics file (Google / Apple / Outlook)"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Export</span>
          </Button>

          {/* View Mode Selector (Day, 3-Day, Week, Month, Year, Agenda) */}
          <div
            className={cn(
              "flex items-center rounded-md border p-0.5",
              isDark ? "bg-[#121212] border-[#2B2B2B]" : "bg-slate-200/70 border-slate-300"
            )}
          >
            {(["day", "3-day", "week", "month", "year", "agenda"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "px-2 sm:px-2.5 py-1 text-xs font-mono uppercase tracking-wider rounded capitalize transition-all",
                  viewMode === mode
                    ? isDark
                      ? "bg-[#272727] text-white shadow-xs font-bold"
                      : "bg-white text-slate-900 shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {mode === "3-day" ? "3D" : mode}
              </button>
            ))}
          </div>

          {/* Shortcuts Info Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShortcutsModalOpen(true)}
            className="h-8 w-8 text-muted-foreground hover:text-foreground hidden sm:flex"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="h-4 w-4" />
          </Button>

          {/* New Event Button */}
          <Button
            size="sm"
            onClick={() => openSlotCreate(anchorDate, 10)}
            className="h-8 gap-1 text-xs font-mono bg-purple-600 hover:bg-purple-700 text-white shadow-xs rounded px-3"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Create</span>
          </Button>
        </div>
      </div>

      {/* ── LIVE / UPCOMING MEETING BANNER TICKER ── */}
      {(liveEvent || upcomingEvent) && (
        <div
          className={cn(
            "px-4 py-2 border-b text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200 print:hidden",
            liveEvent
              ? "bg-rose-500/15 border-rose-500/30 text-rose-400"
              : "bg-purple-500/10 border-purple-500/25 text-purple-300"
          )}
        >
          <div className="flex items-center gap-2.5 overflow-hidden">
            {liveEvent ? (
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
            ) : (
              <Bell className="h-3.5 w-3.5 text-purple-400 shrink-0" />
            )}
            <span className="font-bold uppercase tracking-wider text-[11px]">
              {liveEvent ? "Happening Now:" : "Up Next:"}
            </span>
            <span className="font-semibold text-foreground truncate">
              {liveEvent ? liveEvent.title : upcomingEvent?.title}
            </span>
            <span className="opacity-80 text-[11px] font-mono hidden md:inline">
              {liveEvent
                ? `(ends at ${format(new Date(liveEvent.end || liveEvent.start), "h:mm a")})`
                : upcomingEvent
                ? `(starts at ${format(new Date(upcomingEvent.start), "h:mm a")})`
                : ""}
            </span>
          </div>

          {/* Video meeting link button if present */}
          {((liveEvent?.meta?.description && String(liveEvent.meta.description).match(/https?:\/\/[^\s]+/)) ||
            (upcomingEvent?.meta?.description && String(upcomingEvent.meta.description).match(/https?:\/\/[^\s]+/))) && (
            <a
              href={
                (liveEvent?.meta?.description && String(liveEvent.meta.description).match(/https?:\/\/[^\s]+/)?.[0]) ||
                (upcomingEvent?.meta?.description && String(upcomingEvent.meta.description).match(/https?:\/\/[^\s]+/)?.[0]) ||
                "#"
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition-colors shrink-0 shadow-xs"
            >
              <Video className="h-3 w-3" />
              <span>Join Video Call</span>
            </a>
          )}
        </div>
      )}

      {/* ── AI FREE SLOT SUGGESTIONS CARD (DROPDOWN) ── */}
      {aiSuggestionsOpen && (
        <div
          className={cn(
            "p-3 border-b text-xs flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200 print:hidden",
            isDark ? "bg-[#181818] border-[#333]" : "bg-emerald-50/70 border-emerald-200"
          )}
        >
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-emerald-500 shrink-0" />
            <span className="font-semibold text-foreground">AI Recommended Free Windows:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {freeSlotSuggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => {
                  handleSlotSelect(s.day, s.startHour, s.startHour + s.duration);
                  setAiSuggestionsOpen(false);
                }}
                className={cn(
                  "px-2.5 py-1 rounded text-xs border font-mono transition-colors flex items-center gap-1.5 shadow-2xs",
                  isDark
                    ? "bg-[#222] border-[#444] text-emerald-400 hover:bg-[#2C2C2C]"
                    : "bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                )}
              >
                <span>{s.label}</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            ))}
          </div>

          <button
            onClick={() => setAiSuggestionsOpen(false)}
            className="text-xs text-muted-foreground hover:text-foreground ml-auto"
          >
            Close
          </button>
        </div>
      )}

      {/* ── TOAST NOTIFICATION ── */}
      {actionNotice && (
        <div className="absolute top-14 right-6 z-50 bg-purple-600 text-white text-xs font-mono px-4 py-2 rounded shadow-lg animate-in fade-in slide-in-from-top-2 flex items-center gap-2 print:hidden">
          <CheckCircle2 className="h-4 w-4" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* ── CONFLICTS ALERT BANNER ── */}
      {conflicts && (
        <div
          className={cn(
            "p-3 border-b text-xs flex items-center justify-between gap-4 animate-in fade-in duration-200 print:hidden",
            conflicts.length
              ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
          )}
        >
          <div className="flex items-center gap-2">
            {conflicts.length ? (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            )}
            <span>
              {conflicts.length
                ? `${conflicts.length} scheduling collision(s) detected. ${conflictSummary}`
                : "No schedule conflicts detected in this date range."}
            </span>
          </div>
          <button
            onClick={() => setConflicts(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── MAIN WORKSPACE ── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* LEFT SIDEBAR */}
        {sidebarOpen && (
          <aside
            className={cn(
              "w-64 sm:w-72 border-r shrink-0 flex flex-col p-4 gap-5 overflow-y-auto z-10 transition-all duration-300 print:hidden",
              isDark ? "bg-[#121212] border-[#272727]" : "bg-slate-50/60 border-slate-200"
            )}
          >
            {/* Create Button in Sidebar */}
            <Button
              onClick={() => openSlotCreate(anchorDate, 10)}
              className="w-full h-11 rounded-full shadow-md bg-white hover:bg-slate-100 text-slate-900 border border-slate-200 dark:bg-[#202020] dark:border-[#333] dark:text-white dark:hover:bg-[#2A2A2A] font-semibold flex items-center justify-start px-4 gap-3 text-sm"
            >
              <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-white">
                <Plus className="h-4 w-4" />
              </div>
              <span>Create Event</span>
            </Button>

            {/* Embedded Mini Month Calendar */}
            <MiniMonthPicker
              currentDate={anchorDate}
              eventsByDay={eventsByDay}
              onSelectDate={(d) => {
                setAnchorDate(d);
                if (viewMode === "year") setViewMode("week");
              }}
              isDark={isDark}
            />

            {/* Calendars / Sources Section */}
            <div className="space-y-3 pt-2 border-t border-border/40">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  My Calendars
                </span>
                <span className="text-[10px] text-muted-foreground/60">
                  {filteredEvents.length} shown
                </span>
              </div>

              <div className="space-y-1.5">
                {Object.entries(SOURCE_META).map(([key, meta]) => {
                  const isChecked = sourceFilter.has(key);
                  return (
                    <label
                      key={key}
                      onClick={() => toggleSource(key)}
                      className={cn(
                        "flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors text-xs select-none",
                        isChecked
                          ? isDark ? "hover:bg-white/[0.04]" : "hover:bg-slate-200/50"
                          : "opacity-40 hover:opacity-70"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3 h-3 rounded-xs shrink-0 flex items-center justify-center text-white text-[9px]"
                          style={{ backgroundColor: meta.color }}
                        >
                          {isChecked && <Check className="h-2.5 w-2.5" />}
                        </span>
                        <span className="text-foreground/90 font-medium">{meta.label}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {events.filter((e) => e.source === key).length}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Filter by Task Status / Priority */}
            <div className="space-y-2 pt-2 border-t border-border/40">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Task Filters
              </span>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={cn(
                    "h-7 rounded border px-1.5 text-[10px] font-mono",
                    isDark ? "bg-[#1A1A1A] border-[#333]" : "bg-white border-slate-200"
                  )}
                >
                  <option value="all">Status: All</option>
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className={cn(
                    "h-7 rounded border px-1.5 text-[10px] font-mono",
                    isDark ? "bg-[#1A1A1A] border-[#333]" : "bg-white border-slate-200"
                  )}
                >
                  <option value="all">Priority: All</option>
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Working Hours Info */}
            <div className="text-[10px] text-muted-foreground border border-border/30 rounded p-2 bg-muted/10 font-mono mt-auto">
              <div className="flex items-center gap-1 font-semibold text-foreground/80 mb-0.5">
                <Sun className="h-3 w-3 text-amber-400" /> Business Hours
              </div>
              9:00 AM – 6:00 PM. Drag events or click & drag to schedule. Grab bottom handle to resize duration.
            </div>
          </aside>
        )}

        {/* CALENDAR BODY */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background relative">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2 text-purple-500" />
              Loading schedule events...
            </div>
          ) : viewMode === "week" || viewMode === "3-day" ? (
            <WeekTimeGrid
              rangeStart={rangeStart}
              numDays={viewMode === "3-day" ? 3 : 7}
              events={filteredEvents}
              currentTime={currentTime}
              scrollRef={timeGridScrollRef}
              isDark={isDark}
              showSecondaryTz={showSecondaryTz}
              highlightFreeSlots={highlightFreeSlots}
              onSlotClick={handleSlotSelect}
              onEventClick={handleOpenEventInspector}
              onDropSlot={handleDropSlot}
              onResizeEvent={handleResizeEvent}
              onDragStartEvent={setDraggedEvent}
            />
          ) : viewMode === "day" ? (
            <DayTimeGrid
              day={anchorDate}
              events={filteredEvents}
              currentTime={currentTime}
              scrollRef={timeGridScrollRef}
              isDark={isDark}
              showSecondaryTz={showSecondaryTz}
              highlightFreeSlots={highlightFreeSlots}
              onSlotClick={handleSlotSelect}
              onEventClick={handleOpenEventInspector}
              onDropSlot={handleDropSlot}
              onResizeEvent={handleResizeEvent}
              onDragStartEvent={setDraggedEvent}
            />
          ) : viewMode === "month" ? (
            <MonthGrid
              anchorDate={anchorDate}
              eventsByDay={eventsByDay}
              conflictDays={conflictDays}
              isDark={isDark}
              onDayClick={(d) => {
                setAnchorDate(d);
                setViewMode("week");
              }}
              onEventClick={handleOpenEventInspector}
            />
          ) : viewMode === "year" ? (
            <YearGrid
              anchorDate={anchorDate}
              eventsByDay={eventsByDay}
              isDark={isDark}
              onDayClick={(d) => {
                setAnchorDate(d);
                setViewMode("week");
              }}
            />
          ) : (
            <AgendaView
              events={filteredEvents}
              anchorDate={anchorDate}
              isDark={isDark}
              onEventClick={handleOpenEventInspector}
            />
          )}

          {/* ── GOOGLE CALENDAR SIGNATURE QUICK-ADD POPOVER ── */}
          {quickAddState && quickAddState.open && (
            <div
              className={cn(
                "absolute z-50 top-16 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-24 w-[340px] rounded-lg border shadow-2xl p-4 font-mono animate-in fade-in zoom-in-95 duration-150",
                isDark ? "bg-[#181818] border-[#333] text-white" : "bg-white border-slate-200 text-slate-900"
              )}
            >
              <div className="flex items-center justify-between pb-2 border-b border-border/30">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5 text-purple-500" /> Quick Add Event
                </span>
                <button
                  onClick={() => setQuickAddState(null)}
                  className="text-muted-foreground hover:text-foreground text-sm leading-none"
                >
                  ×
                </button>
              </div>

              <div className="space-y-3 pt-3">
                <Input
                  autoFocus
                  value={quickAddState.title}
                  onChange={(e) =>
                    setQuickAddState({ ...quickAddState, title: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleQuickAddSave();
                  }}
                  placeholder="Add title (e.g. Design Review)"
                  className={cn(
                    "h-8 text-xs font-mono",
                    isDark ? "bg-[#222] border-[#3A3A3A]" : "bg-slate-50 border-slate-300"
                  )}
                />

                {/* Time & Date display */}
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium">
                  <Clock className="h-3.5 w-3.5 text-purple-400" />
                  <span>
                    {format(quickAddState.day, "EEE, MMM d")} · {quickAddState.startHour}:00 – {quickAddState.endHour}:00
                  </span>
                </div>

                {/* Category Pills */}
                <div className="flex items-center gap-1.5">
                  {(["meeting", "reminder", "deadline"] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setQuickAddState({ ...quickAddState, type: cat })}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] capitalize border transition-all",
                        quickAddState.type === cat
                          ? "bg-purple-600 border-purple-600 text-white font-bold"
                          : isDark
                          ? "bg-[#222] border-[#333] text-muted-foreground hover:text-foreground"
                          : "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-between pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      openSlotCreate(quickAddState.day, quickAddState.startHour, quickAddState.endHour);
                      setQuickAddState(null);
                    }}
                    className="h-7 text-xs text-muted-foreground hover:text-foreground px-1.5"
                  >
                    More options
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    onClick={handleQuickAddSave}
                    disabled={!quickAddState.title.trim() || isSubmitting}
                    className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold px-3"
                  >
                    {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── CREATE EVENT DIALOG MODAL (FULL) ── */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent
          className={cn(
            "sm:max-w-[480px] p-6 font-mono rounded-none border shadow-xl",
            isDark ? "bg-[#161616] border-[#272727] text-white" : "bg-white border-slate-200 text-slate-900"
          )}
        >
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-purple-400" />
              Schedule Calendar Event
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase">Event Title *</Label>
              <Input
                required
                value={createFormData.title}
                onChange={(e) => setCreateFormData({ ...createFormData, title: e.target.value })}
                placeholder="e.g. Q3 Financial Close, Client Architecture Sync, Team Standup"
                className={cn(
                  "h-9 text-xs font-mono",
                  isDark ? "bg-[#1E1E1E] border-[#333]" : "bg-white border-slate-200"
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase">Category</Label>
                <select
                  value={createFormData.type}
                  onChange={(e) => setCreateFormData({ ...createFormData, type: e.target.value })}
                  className={cn(
                    "w-full h-9 rounded border px-2 text-xs font-mono",
                    isDark ? "bg-[#1E1E1E] border-[#333]" : "bg-white border-slate-200"
                  )}
                >
                  <option value="meeting">Meeting</option>
                  <option value="reminder">Reminder</option>
                  <option value="deadline">Task Deadline</option>
                  <option value="other">General Event</option>
                </select>
              </div>

              <div className="flex items-center space-x-2 pt-6">
                <input
                  type="checkbox"
                  id="allDayCheckbox"
                  checked={createFormData.allDay}
                  onChange={(e) => setCreateFormData({ ...createFormData, allDay: e.target.checked })}
                  className="rounded border-border/60 text-purple-600 focus:ring-purple-500"
                />
                <label htmlFor="allDayCheckbox" className="text-xs cursor-pointer text-foreground/80">
                  All-Day Event
                </label>
              </div>
            </div>

            {/* Date & Time Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase">Start Date</Label>
                <Input
                  type="date"
                  value={createFormData.startDate}
                  onChange={(e) => setCreateFormData({ ...createFormData, startDate: e.target.value })}
                  className={cn(
                    "h-9 text-xs font-mono",
                    isDark ? "bg-[#1E1E1E] border-[#333]" : "bg-white border-slate-200"
                  )}
                />
              </div>

              {!createFormData.allDay && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase">Start Time</Label>
                  <Input
                    type="time"
                    value={createFormData.startTime}
                    onChange={(e) => setCreateFormData({ ...createFormData, startTime: e.target.value })}
                    className={cn(
                      "h-9 text-xs font-mono",
                      isDark ? "bg-[#1E1E1E] border-[#333]" : "bg-white border-slate-200"
                    )}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase">End Date</Label>
                <Input
                  type="date"
                  value={createFormData.endDate}
                  onChange={(e) => setCreateFormData({ ...createFormData, endDate: e.target.value })}
                  className={cn(
                    "h-9 text-xs font-mono",
                    isDark ? "bg-[#1E1E1E] border-[#333]" : "bg-white border-slate-200"
                  )}
                />
              </div>

              {!createFormData.allDay && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase">End Time</Label>
                  <Input
                    type="time"
                    value={createFormData.endTime}
                    onChange={(e) => setCreateFormData({ ...createFormData, endTime: e.target.value })}
                    className={cn(
                      "h-9 text-xs font-mono",
                      isDark ? "bg-[#1E1E1E] border-[#333]" : "bg-white border-slate-200"
                    )}
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase">Description / Agenda / Video Link</Label>
              <textarea
                value={createFormData.description}
                onChange={(e) => setCreateFormData({ ...createFormData, description: e.target.value })}
                rows={3}
                placeholder="Meeting links (Google Meet, Zoom), room location, agenda items..."
                className={cn(
                  "w-full rounded border p-2 text-xs font-mono resize-none",
                  isDark ? "bg-[#1E1E1E] border-[#333]" : "bg-white border-slate-200"
                )}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
                className="text-xs bg-purple-600 hover:bg-purple-700 text-white"
              >
                {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Confirm & Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── EVENT DETAILS / INLINE EDIT INSPECTOR MODAL ── */}
      {selectedEvent && (
        <Dialog open={!!selectedEvent} onOpenChange={() => { setSelectedEvent(null); setIsEditingSelected(false); }}>
          <DialogContent
            className={cn(
              "sm:max-w-[480px] p-6 font-mono rounded-none border shadow-xl",
              isDark ? "bg-[#161616] border-[#272727] text-white" : "bg-white border-slate-200 text-slate-900"
            )}
          >
            <DialogHeader>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: SOURCE_META[selectedEvent.source]?.color || "#B595FF" }}
                  />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {SOURCE_META[selectedEvent.source]?.label || "Event"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {selectedEvent.source === "calendar" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsEditingSelected((prev) => !prev)}
                      className={cn("h-7 w-7", isEditingSelected ? "text-purple-400 bg-purple-500/10" : "text-muted-foreground hover:text-foreground")}
                      title={isEditingSelected ? "Cancel editing" : "Edit event"}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDuplicateEvent(selectedEvent)}
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    title="Duplicate to tomorrow"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {selectedEvent.source === "calendar" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteEvent(selectedEvent)}
                      className="h-7 w-7 text-muted-foreground hover:text-rose-400"
                      title="Delete event"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {!isEditingSelected ? (
                <DialogTitle className="text-base font-bold text-foreground">
                  {selectedEvent.title}
                </DialogTitle>
              ) : (
                <div className="space-y-1 pt-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Title</Label>
                  <Input
                    value={editFormData.title}
                    onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                    className={cn(
                      "h-8 text-xs font-mono",
                      isDark ? "bg-[#1E1E1E] border-[#333]" : "bg-white border-slate-200"
                    )}
                  />
                </div>
              )}
            </DialogHeader>

            {isEditingSelected ? (
              /* Inline Edit Mode Form */
              <div className="space-y-3 py-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Category</Label>
                    <select
                      value={editFormData.type}
                      onChange={(e) => setEditFormData({ ...editFormData, type: e.target.value })}
                      className={cn(
                        "w-full h-8 rounded border px-2 text-xs font-mono",
                        isDark ? "bg-[#1E1E1E] border-[#333]" : "bg-white border-slate-200"
                      )}
                    >
                      <option value="meeting">Meeting</option>
                      <option value="reminder">Reminder</option>
                      <option value="deadline">Deadline</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-2 pt-5">
                    <input
                      type="checkbox"
                      id="editAllDayCheckbox"
                      checked={editFormData.allDay}
                      onChange={(e) => setEditFormData({ ...editFormData, allDay: e.target.checked })}
                      className="rounded border-border/60 text-purple-600 focus:ring-purple-500"
                    />
                    <label htmlFor="editAllDayCheckbox" className="text-xs cursor-pointer text-foreground/80">
                      All-Day
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Start Time</Label>
                    <Input
                      type="time"
                      value={editFormData.startTime}
                      onChange={(e) => setEditFormData({ ...editFormData, startTime: e.target.value })}
                      className={cn("h-8 text-xs font-mono", isDark ? "bg-[#1E1E1E] border-[#333]" : "bg-white border-slate-200")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">End Time</Label>
                    <Input
                      type="time"
                      value={editFormData.endTime}
                      onChange={(e) => setEditFormData({ ...editFormData, endTime: e.target.value })}
                      className={cn("h-8 text-xs font-mono", isDark ? "bg-[#1E1E1E] border-[#333]" : "bg-white border-slate-200")}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Description / Video Link</Label>
                  <textarea
                    rows={3}
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    className={cn(
                      "w-full rounded border p-2 text-xs font-mono resize-none",
                      isDark ? "bg-[#1E1E1E] border-[#333]" : "bg-white border-slate-200"
                    )}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditingSelected(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveInlineEdit}
                    className="text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1"
                  >
                    <Save className="h-3 w-3" /> Save Changes
                  </Button>
                </div>
              </div>
            ) : (
              /* Read-only Detailed Inspection Mode */
              <div className="space-y-3 py-3 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4 text-purple-400" />
                  <span>
                    {format(new Date(selectedEvent.start), "EEEE, MMMM d, yyyy")}
                    {!selectedEvent.allDay && (
                      <>
                        {" "}
                        · {format(new Date(selectedEvent.start), "h:mm a")}
                        {selectedEvent.end
                          ? ` – ${format(new Date(selectedEvent.end), "h:mm a")}`
                          : ""}
                      </>
                    )}
                  </span>
                </div>

                {selectedEvent.meta?.description && (
                  <div
                    className={cn(
                      "p-3 rounded border text-xs leading-relaxed whitespace-pre-wrap break-words",
                      isDark ? "bg-[#111] border-[#222]" : "bg-slate-50 border-slate-200"
                    )}
                  >
                    {String(selectedEvent.meta.description)}
                  </div>
                )}

                {/* 1-Click Join Video Meeting (Google Meet, Zoom, Teams) */}
                {selectedEvent.meta?.description &&
                  String(selectedEvent.meta.description).match(/https?:\/\/[^\s]+/) && (
                    <Button
                      asChild
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-mono gap-2"
                    >
                      <a
                        href={String(selectedEvent.meta.description).match(/https?:\/\/[^\s]+/)?.[0] || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Video className="h-4 w-4" /> Join Video Meeting
                      </a>
                    </Button>
                  )}

                {selectedEvent.meta?.status && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {String(selectedEvent.meta.status)}
                    </Badge>
                  </div>
                )}

                {selectedEvent.url && (
                  <div className="pt-2">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="w-full text-xs font-mono gap-1.5"
                    >
                      <a href={selectedEvent.url}>
                        Open Linked ERP Record <ExternalLink className="h-3.5 w-3.5 ml-1" />
                      </a>
                    </Button>
                  </div>
                )}

                <DialogFooter className="flex items-center justify-between sm:justify-between w-full pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToICS([selectedEvent], `${selectedEvent.title}.ics`)}
                    className="text-xs gap-1"
                  >
                    <Download className="h-3 w-3" /> iCal
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedEvent(null)}
                    className="text-xs"
                  >
                    Close
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* ── KEYBOARD SHORTCUTS MODAL ── */}
      <Dialog open={shortcutsModalOpen} onOpenChange={setShortcutsModalOpen}>
        <DialogContent
          className={cn(
            "sm:max-w-[420px] p-6 font-mono rounded-none border shadow-xl",
            isDark ? "bg-[#161616] border-[#272727] text-white" : "bg-white border-slate-200 text-slate-900"
          )}
        >
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-purple-400" />
              Calendar Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 py-3 text-xs">
            <div className="flex items-center justify-between py-1 border-b border-border/30">
              <span className="text-muted-foreground">Jump to Today</span>
              <kbd className="px-2 py-0.5 rounded bg-muted text-foreground font-bold">T</kbd>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-border/30">
              <span className="text-muted-foreground">Day View</span>
              <kbd className="px-2 py-0.5 rounded bg-muted text-foreground font-bold">D or 1</kbd>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-border/30">
              <span className="text-muted-foreground">3-Day View</span>
              <kbd className="px-2 py-0.5 rounded bg-muted text-foreground font-bold">3</kbd>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-border/30">
              <span className="text-muted-foreground">Week View</span>
              <kbd className="px-2 py-0.5 rounded bg-muted text-foreground font-bold">W or 2</kbd>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-border/30">
              <span className="text-muted-foreground">Month View</span>
              <kbd className="px-2 py-0.5 rounded bg-muted text-foreground font-bold">M or 4</kbd>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-border/30">
              <span className="text-muted-foreground">Year View</span>
              <kbd className="px-2 py-0.5 rounded bg-muted text-foreground font-bold">Y or 5</kbd>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-border/30">
              <span className="text-muted-foreground">Agenda / List</span>
              <kbd className="px-2 py-0.5 rounded bg-muted text-foreground font-bold">A or 6</kbd>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-border/30">
              <span className="text-muted-foreground">Next / Prev Period</span>
              <kbd className="px-2 py-0.5 rounded bg-muted text-foreground font-bold">J / K</kbd>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-border/30">
              <span className="text-muted-foreground">Create Event</span>
              <kbd className="px-2 py-0.5 rounded bg-muted text-foreground font-bold">C</kbd>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-border/30">
              <span className="text-muted-foreground">Quick Search</span>
              <kbd className="px-2 py-0.5 rounded bg-muted text-foreground font-bold">/</kbd>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShortcutsModalOpen(false)}
              className="text-xs"
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}

// ── MINI MONTH PICKER WITH ACTIVITY DOTS ──
function MiniMonthPicker({
  currentDate,
  eventsByDay,
  onSelectDate,
  isDark,
}: {
  currentDate: Date;
  eventsByDay: Map<string, UnifiedEvent[]>;
  onSelectDate: (d: Date) => void;
  isDark: boolean;
}) {
  const [viewMonth, setViewMonth] = useState<Date>(new Date(currentDate));

  const daysOfWeek = ["S", "M", "T", "W", "T", "F", "S"];

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const calendarDays: Array<{ date: Date; currentMonth: boolean }> = [];

  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    calendarDays.push({
      date: new Date(year, month - 1, daysInPrevMonth - i),
      currentMonth: false,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push({
      date: new Date(year, month, d),
      currentMonth: true,
    });
  }
  while (calendarDays.length % 7 !== 0) {
    const nextDay = calendarDays.length - (firstDayOfWeek + daysInMonth) + 1;
    calendarDays.push({
      date: new Date(year, month + 1, nextDay),
      currentMonth: false,
    });
  }

  return (
    <div className="space-y-2 select-none">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-foreground">
          {format(viewMonth, "MMMM yyyy")}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setViewMonth(subMonths(viewMonth, 1))}
            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button
            onClick={() => setViewMonth(addMonths(viewMonth, 1))}
            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center">
        {daysOfWeek.map((d, i) => (
          <span key={i} className="text-[10px] text-muted-foreground font-semibold py-0.5">
            {d}
          </span>
        ))}
        {calendarDays.map((item, idx) => {
          const isSelected = isSameDay(item.date, currentDate);
          const isCurrentToday = isToday(item.date);
          const dayKey = format(item.date, "yyyy-MM-dd");
          const hasEvents = (eventsByDay.get(dayKey) || []).length > 0;

          return (
            <button
              key={idx}
              onClick={() => onSelectDate(item.date)}
              className={cn(
                "h-6 w-6 mx-auto rounded-full text-[10px] font-mono flex flex-col items-center justify-center transition-colors my-0.5 relative",
                !item.currentMonth && "opacity-30",
                isCurrentToday && !isSelected && "border border-purple-500 font-bold text-purple-400",
                isSelected
                  ? "bg-purple-600 text-white font-bold"
                  : "hover:bg-muted text-foreground/90"
              )}
            >
              <span>{item.date.getDate()}</span>
              {hasEvents && !isSelected && (
                <span className="w-1 h-1 rounded-full bg-purple-400 absolute bottom-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── SIDE-BY-SIDE OVERLAPPING EVENTS COMPUTATION ──
interface LayoutPositionedEvent {
  event: UnifiedEvent;
  top: number;
  height: number;
  col: number;
  numCols: number;
}

function computeEventLayout(events: UnifiedEvent[], activeResize?: { eventId: string; height: number }): LayoutPositionedEvent[] {
  if (events.length === 0) return [];

  const items = events.map((e) => {
    const s = new Date(e.start);
    const startMins = s.getHours() * 60 + s.getMinutes();
    const eD = e.end ? new Date(e.end) : new Date(s.getTime() + 3600000);
    const endMins = Math.max(startMins + 15, eD.getHours() * 60 + eD.getMinutes());

    const isCurrentResizing = activeResize?.eventId === e.id;
    const computedHeight = isCurrentResizing
      ? activeResize.height
      : Math.max(24, ((endMins - startMins) / 60) * HOUR_ROW_HEIGHT - 2);

    return {
      event: e,
      startMins,
      endMins,
      top: (startMins / 60) * HOUR_ROW_HEIGHT,
      height: computedHeight,
      col: 0,
      numCols: 1,
    };
  });

  items.sort((a, b) => a.startMins - b.startMins || (b.endMins - b.startMins) - (a.endMins - a.startMins));

  // Partition into overlapping collision clusters
  const clusters: (typeof items)[] = [];
  let currentCluster: typeof items = [];
  let clusterEnd = -1;

  for (const item of items) {
    if (currentCluster.length === 0) {
      currentCluster.push(item);
      clusterEnd = item.endMins;
    } else if (item.startMins < clusterEnd) {
      currentCluster.push(item);
      clusterEnd = Math.max(clusterEnd, item.endMins);
    } else {
      clusters.push(currentCluster);
      currentCluster = [item];
      clusterEnd = item.endMins;
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster);

  // Assign columns within each cluster
  const result: LayoutPositionedEvent[] = [];
  for (const cluster of clusters) {
    const colEndTimes: number[] = [];
    for (const item of cluster) {
      let placedCol = -1;
      for (let c = 0; c < colEndTimes.length; c++) {
        if (colEndTimes[c] <= item.startMins) {
          placedCol = c;
          colEndTimes[c] = item.endMins;
          break;
        }
      }
      if (placedCol === -1) {
        placedCol = colEndTimes.length;
        colEndTimes.push(item.endMins);
      }
      item.col = placedCol;
    }
    const totalCols = Math.max(1, colEndTimes.length);
    for (const item of cluster) {
      item.numCols = totalCols;
      result.push(item);
    }
  }

  return result;
}

// ── WEEK & 3-DAY TIME GRID (GOOGLE CALENDAR SPECIFICATION) ──
function WeekTimeGrid({
  rangeStart,
  numDays = 7,
  events,
  currentTime,
  scrollRef,
  isDark,
  showSecondaryTz,
  highlightFreeSlots,
  onSlotClick,
  onEventClick,
  onDropSlot,
  onResizeEvent,
  onDragStartEvent,
}: {
  rangeStart: Date;
  numDays?: number;
  events: UnifiedEvent[];
  currentTime: Date;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isDark: boolean;
  showSecondaryTz: boolean;
  highlightFreeSlots: boolean;
  onSlotClick: (day: Date, hour: number, endHour?: number) => void;
  onEventClick: (e: UnifiedEvent) => void;
  onDropSlot: (day: Date, hour: number) => void;
  onResizeEvent: (e: UnifiedEvent, newEnd: Date) => void;
  onDragStartEvent: (e: UnifiedEvent) => void;
}) {
  const weekDays = Array.from({ length: numDays }).map((_, i) => addDays(rangeStart, i));

  // Drag selection state for click-and-drag creation
  const [dragSelection, setDragSelection] = useState<{
    dayIdx: number;
    startHour: number;
    endHour: number;
  } | null>(null);

  // Interactive Bottom-Edge Resizing State
  const [resizingState, setResizingState] = useState<{
    eventId: string;
    event: UnifiedEvent;
    startY: number;
    originalHeight: number;
    currentHeight: number;
  } | null>(null);

  // Partition all-day vs timed
  const allDayEventsByDay = useMemo(() => {
    const map = new Map<string, UnifiedEvent[]>();
    for (const d of weekDays) map.set(format(d, "yyyy-MM-dd"), []);
    for (const e of events) {
      if (e.allDay) {
        const key = format(new Date(e.start), "yyyy-MM-dd");
        if (map.has(key)) map.get(key)!.push(e);
      }
    }
    return map;
  }, [events, weekDays]);

  const timedEventsByDay = useMemo(() => {
    const map = new Map<string, UnifiedEvent[]>();
    for (const d of weekDays) map.set(format(d, "yyyy-MM-dd"), []);
    for (const e of events) {
      if (!e.allDay) {
        const key = format(new Date(e.start), "yyyy-MM-dd");
        if (map.has(key)) map.get(key)!.push(e);
      }
    }
    return map;
  }, [events, weekDays]);

  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const currentTimeTop = (currentMinutes / 60) * HOUR_ROW_HEIGHT;

  const handleMouseDownSlot = (dayIdx: number, hour: number) => {
    if (resizingState) return;
    setDragSelection({ dayIdx, startHour: hour, endHour: hour + 1 });
  };

  const handleMouseEnterSlot = (dayIdx: number, hour: number) => {
    if (dragSelection && dragSelection.dayIdx === dayIdx) {
      setDragSelection({
        ...dragSelection,
        endHour: Math.max(dragSelection.startHour + 1, hour + 1),
      });
    }
  };

  const handleMouseUp = () => {
    if (dragSelection) {
      const targetDay = weekDays[dragSelection.dayIdx];
      onSlotClick(targetDay, dragSelection.startHour, dragSelection.endHour);
      setDragSelection(null);
    }
  };

  // Start bottom-edge event resizing
  const handleStartResize = (e: React.MouseEvent, eventToResize: UnifiedEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const start = new Date(eventToResize.start);
    const end = eventToResize.end ? new Date(eventToResize.end) : new Date(start.getTime() + 3600000);
    const durationMins = (end.getTime() - start.getTime()) / 60000;
    const initialHeight = (durationMins / 60) * HOUR_ROW_HEIGHT - 2;

    setResizingState({
      eventId: eventToResize.id,
      event: eventToResize,
      startY: e.clientY,
      originalHeight: initialHeight,
      currentHeight: initialHeight,
    });
  };

  // Global mousemove & mouseup for resizing
  useEffect(() => {
    if (!resizingState) return;

    const onMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - resizingState.startY;
      // 15-minute snapping: 15 mins = 0.25 * HOUR_ROW_HEIGHT px
      const snapPx = (15 / 60) * HOUR_ROW_HEIGHT;
      const snappedDelta = Math.round(deltaY / snapPx) * snapPx;
      const newHeight = Math.max(snapPx, resizingState.originalHeight + snappedDelta);

      setResizingState((prev) => (prev ? { ...prev, currentHeight: newHeight } : null));
    };

    const onMouseUp = () => {
      if (resizingState) {
        const durationMins = Math.round((resizingState.currentHeight / HOUR_ROW_HEIGHT) * 60 / 15) * 15;
        const start = new Date(resizingState.event.start);
        const newEnd = new Date(start.getTime() + Math.max(15, durationMins) * 60000);
        onResizeEvent(resizingState.event, newEnd);
        setResizingState(null);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizingState, onResizeEvent]);

  const gridColsClass = numDays === 3
    ? showSecondaryTz ? "grid-cols-[96px_repeat(3,1fr)]" : "grid-cols-[64px_repeat(3,1fr)]"
    : showSecondaryTz ? "grid-cols-[96px_repeat(7,1fr)]" : "grid-cols-[64px_repeat(7,1fr)]";

  return (
    <div
      onMouseUp={handleMouseUp}
      className="flex flex-col flex-1 overflow-hidden min-w-[700px] select-none"
    >
      {/* ── 1. HEADER ROW WITH ALL-DAY EVENTS ── */}
      <div
        className={cn(
          "border-b shrink-0 flex flex-col",
          isDark ? "bg-[#141414] border-[#272727]" : "bg-slate-50 border-slate-200"
        )}
      >
        {/* Day Name & Big Date Numbers */}
        <div className={cn("grid items-center border-b border-border/30", gridColsClass)}>
          <div className="text-[10px] font-mono text-muted-foreground/60 text-center py-3 flex items-center justify-center gap-1">
            <span>GMT+5:30</span>
            {showSecondaryTz && <span className="text-purple-400 font-bold">/ UTC</span>}
          </div>

          {weekDays.map((day) => {
            const currentDay = isToday(day);
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "py-2.5 text-center border-l transition-colors border-border/30",
                  currentDay && (isDark ? "bg-purple-950/20" : "bg-purple-500/5")
                )}
              >
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block">
                  {format(day, "EEE")}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center justify-center text-lg sm:text-xl font-bold tracking-tight rounded-full mt-0.5",
                    currentDay
                      ? "w-8 h-8 bg-purple-600 text-white shadow-sm"
                      : "text-foreground"
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>
            );
          })}
        </div>

        {/* All-Day Events Strip */}
        <div className={cn("grid min-h-[34px] border-border/30", gridColsClass)}>
          <div className="text-[10px] font-mono text-muted-foreground/60 text-center py-2 flex items-center justify-center">
            All-day
          </div>
          {weekDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayAllDay = allDayEventsByDay.get(key) || [];
            return (
              <div
                key={day.toISOString()}
                className="border-l border-border/30 p-1 flex flex-col gap-1 overflow-hidden"
              >
                {dayAllDay.map((e) => {
                  const meta = SOURCE_META[e.source] || SOURCE_META.calendar;
                  return (
                    <div
                      key={e.id}
                      onClick={() => onEventClick(e)}
                      style={{ backgroundColor: meta.color }}
                      className="px-2 py-0.5 rounded text-[11px] font-medium text-white truncate shadow-xs cursor-pointer hover:opacity-90 transition-opacity"
                      title={e.title}
                    >
                      {e.title}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 2. SCROLLABLE HOURLY TIME GRID ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden relative"
      >
        <div
          className={cn("grid relative", gridColsClass)}
          style={{ height: `${24 * HOUR_ROW_HEIGHT}px` }}
        >
          {/* Hour labels on left gutter (with optional secondary timezone) */}
          <div className="relative border-r border-border/30">
            {HOURS.map((hour) => {
              if (hour === 0) return null;
              const localLabel = hour > 12 ? `${hour - 12} PM` : hour === 12 ? "12 PM" : `${hour} AM`;
              // UTC is 5h 30m behind IST
              const utcHour = (hour - 5.5 + 24) % 24;
              const utcHourInt = Math.floor(utcHour);
              const utcMin = (utcHour % 1) * 60;
              const utcLabel = `${utcHourInt % 12 || 12}:${utcMin === 0 ? "00" : "30"} ${utcHourInt >= 12 ? "PM" : "AM"}`;

              return (
                <div
                  key={hour}
                  className="absolute right-2 text-[10px] font-mono text-muted-foreground/70 -translate-y-1/2 flex items-center gap-1.5"
                  style={{ top: `${hour * HOUR_ROW_HEIGHT}px` }}
                >
                  <span>{localLabel}</span>
                  {showSecondaryTz && (
                    <span className="text-[9px] text-purple-400 font-bold border-l pl-1 border-border/50">
                      {utcLabel}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Columns for the days */}
          {weekDays.map((day, dayIdx) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = timedEventsByDay.get(key) || [];
            const dayIsToday = isToday(day);
            const layoutEvents = computeEventLayout(
              dayEvents,
              resizingState ? { eventId: resizingState.eventId, height: resizingState.currentHeight } : undefined
            );

            return (
              <div
                key={day.toISOString()}
                onDragOver={(e) => e.preventDefault()}
                className={cn(
                  "relative border-r border-border/30 last:border-r-0 h-full",
                  dayIsToday && (isDark ? "bg-purple-950/5" : "bg-purple-500/[0.02]")
                )}
              >
                {/* Working hours highlight (9 AM - 6 PM) */}
                <div
                  className={cn(
                    "absolute inset-x-0 pointer-events-none",
                    isDark ? "bg-white/[0.015]" : "bg-amber-500/[0.02]"
                  )}
                  style={{
                    top: `${9 * HOUR_ROW_HEIGHT}px`,
                    height: `${9 * HOUR_ROW_HEIGHT}px`,
                  }}
                />

                {/* AI Free Slots Highlighted Windows */}
                {highlightFreeSlots && [10, 11, 14, 15, 16].map((openHour) => {
                  const isBlocked = dayEvents.some((e) => {
                    const sH = new Date(e.start).getHours();
                    const eH = e.end ? new Date(e.end).getHours() : sH + 1;
                    return openHour >= sH && openHour < eH;
                  });
                  if (isBlocked) return null;
                  return (
                    <div
                      key={openHour}
                      onClick={() => onSlotClick(day, openHour, openHour + 1)}
                      style={{
                        top: `${openHour * HOUR_ROW_HEIGHT + 2}px`,
                        height: `${HOUR_ROW_HEIGHT - 4}px`,
                      }}
                      className="absolute inset-x-1.5 rounded border border-dashed border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/15 cursor-pointer z-10 transition-colors flex items-center justify-center gap-1 group"
                      title="AI Recommended Free Slot (Click to Book)"
                    >
                      <Sparkles className="h-3 w-3 text-emerald-400 opacity-60 group-hover:opacity-100" />
                      <span className="text-[9px] font-mono font-semibold text-emerald-500 opacity-70 group-hover:opacity-100">
                        AI Free Window
                      </span>
                    </div>
                  );
                })}

                {/* Horizontal hour lines and slots */}
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    onMouseDown={() => handleMouseDownSlot(dayIdx, hour)}
                    onMouseEnter={() => handleMouseEnterSlot(dayIdx, hour)}
                    onDrop={(e) => {
                      e.preventDefault();
                      onDropSlot(day, hour);
                    }}
                    style={{
                      top: `${hour * HOUR_ROW_HEIGHT}px`,
                      height: `${HOUR_ROW_HEIGHT}px`,
                    }}
                    className={cn(
                      "absolute inset-x-0 border-b border-border/25 cursor-pointer transition-colors",
                      isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-100/50"
                    )}
                  />
                ))}

                {/* ACTIVE DRAG-TO-SELECT SELECTION RECTANGLE */}
                {dragSelection && dragSelection.dayIdx === dayIdx && (
                  <div
                    className="absolute inset-x-1 rounded bg-purple-500/25 border-2 border-purple-500 border-dashed z-40 pointer-events-none p-1 text-[10px] font-mono text-purple-300 font-bold"
                    style={{
                      top: `${dragSelection.startHour * HOUR_ROW_HEIGHT}px`,
                      height: `${(dragSelection.endHour - dragSelection.startHour) * HOUR_ROW_HEIGHT}px`,
                    }}
                  >
                    {dragSelection.startHour}:00 - {dragSelection.endHour}:00 ({dragSelection.endHour - dragSelection.startHour}h)
                  </div>
                )}

                {/* RED CURRENT TIME INDICATOR LINE (EXACT GOOGLE CALENDAR SPEC) */}
                {dayIsToday && (
                  <div
                    className="absolute inset-x-0 z-30 pointer-events-none flex items-center"
                    style={{ top: `${currentTimeTop}px` }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm -ml-1.5 shrink-0" />
                    <div className="h-[2px] bg-red-500 flex-1" />
                  </div>
                )}

                {/* TIMED EVENT BLOCKS WITH SIDE-BY-SIDE OVERLAP PACKING & RESIZE HANDLE */}
                {layoutEvents.map(({ event: e, top, height, col, numCols }) => {
                  const startDate = new Date(e.start);
                  const meta = SOURCE_META[e.source] || SOURCE_META.calendar;
                  const colWidth = 100 / numCols;
                  const colLeft = col * colWidth;
                  const isCurrentResizing = resizingState?.eventId === e.id;

                  return (
                    <div
                      key={e.id}
                      draggable={!isCurrentResizing}
                      onDragStart={() => onDragStartEvent(e)}
                      onClick={(evt) => {
                        evt.stopPropagation();
                        onEventClick(e);
                      }}
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        left: `${colLeft}%`,
                        width: `${colWidth - 1}%`,
                        borderLeftColor: meta.color,
                      }}
                      className={cn(
                        "absolute z-20 rounded border-l-[3.5px] p-1.5 text-xs shadow-xs overflow-hidden cursor-grab active:cursor-grabbing transition-all hover:scale-[1.01] hover:shadow-md hover:z-30 group/card",
                        isDark ? meta.bgDark : meta.bgLight,
                        isDark ? meta.textDark : meta.textLight,
                        isCurrentResizing && "ring-2 ring-purple-500 opacity-90 shadow-lg cursor-ns-resize"
                      )}
                      title={`${e.title} (Drag to move, or drag bottom handle to resize duration)`}
                    >
                      <div className="font-semibold truncate text-[11px] leading-tight">
                        {e.title}
                      </div>
                      <div className="text-[10px] font-mono opacity-80 mt-0.5 truncate">
                        {format(startDate, "h:mm a")}
                        {e.end ? ` - ${format(new Date(e.end), "h:mm a")}` : ""}
                      </div>

                      {/* GOOGLE CALENDAR BOTTOM RESIZE HANDLE */}
                      {e.source === "calendar" && (
                        <div
                          onMouseDown={(evt) => handleStartResize(evt, e)}
                          className="absolute bottom-0 inset-x-0 h-2 cursor-ns-resize hover:bg-purple-500/40 flex items-center justify-center transition-colors group/handle z-30"
                          title="Drag up/down to adjust meeting duration"
                        >
                          <div className="w-6 h-1 rounded-full bg-current opacity-30 group-hover/handle:opacity-100" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── DAY TIME GRID VIEW ──
function DayTimeGrid({
  day,
  events,
  currentTime,
  scrollRef,
  isDark,
  showSecondaryTz,
  highlightFreeSlots,
  onSlotClick,
  onEventClick,
  onDropSlot,
  onResizeEvent,
  onDragStartEvent,
}: {
  day: Date;
  events: UnifiedEvent[];
  currentTime: Date;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isDark: boolean;
  showSecondaryTz: boolean;
  highlightFreeSlots: boolean;
  onSlotClick: (day: Date, hour: number, endHour?: number) => void;
  onEventClick: (e: UnifiedEvent) => void;
  onDropSlot: (day: Date, hour: number) => void;
  onResizeEvent: (e: UnifiedEvent, newEnd: Date) => void;
  onDragStartEvent: (e: UnifiedEvent) => void;
}) {
  const dayKey = format(day, "yyyy-MM-dd");
  const dayEvents = events.filter((e) => format(new Date(e.start), "yyyy-MM-dd") === dayKey);
  const allDay = dayEvents.filter((e) => e.allDay);
  const timed = dayEvents.filter((e) => !e.allDay);

  // Interactive Bottom-Edge Resizing State
  const [resizingState, setResizingState] = useState<{
    eventId: string;
    event: UnifiedEvent;
    startY: number;
    originalHeight: number;
    currentHeight: number;
  } | null>(null);

  const layoutEvents = computeEventLayout(
    timed,
    resizingState ? { eventId: resizingState.eventId, height: resizingState.currentHeight } : undefined
  );

  const dayIsToday = isToday(day);
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const currentTimeTop = (currentMinutes / 60) * HOUR_ROW_HEIGHT;

  // Start bottom-edge event resizing
  const handleStartResize = (e: React.MouseEvent, eventToResize: UnifiedEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const start = new Date(eventToResize.start);
    const end = eventToResize.end ? new Date(eventToResize.end) : new Date(start.getTime() + 3600000);
    const durationMins = (end.getTime() - start.getTime()) / 60000;
    const initialHeight = (durationMins / 60) * HOUR_ROW_HEIGHT - 2;

    setResizingState({
      eventId: eventToResize.id,
      event: eventToResize,
      startY: e.clientY,
      originalHeight: initialHeight,
      currentHeight: initialHeight,
    });
  };

  useEffect(() => {
    if (!resizingState) return;

    const onMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - resizingState.startY;
      const snapPx = (15 / 60) * HOUR_ROW_HEIGHT;
      const snappedDelta = Math.round(deltaY / snapPx) * snapPx;
      const newHeight = Math.max(snapPx, resizingState.originalHeight + snappedDelta);
      setResizingState((prev) => (prev ? { ...prev, currentHeight: newHeight } : null));
    };

    const onMouseUp = () => {
      if (resizingState) {
        const durationMins = Math.round((resizingState.currentHeight / HOUR_ROW_HEIGHT) * 60 / 15) * 15;
        const start = new Date(resizingState.event.start);
        const newEnd = new Date(start.getTime() + Math.max(15, durationMins) * 60000);
        onResizeEvent(resizingState.event, newEnd);
        setResizingState(null);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizingState, onResizeEvent]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden select-none">
      {/* Header */}
      <div
        className={cn(
          "p-4 border-b flex items-center justify-between",
          isDark ? "bg-[#141414] border-[#272727]" : "bg-slate-50 border-slate-200"
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold font-mono",
              dayIsToday ? "bg-purple-600 text-white" : "border text-foreground"
            )}
          >
            {format(day, "d")}
          </span>
          <div>
            <h3 className="text-base font-bold text-foreground">
              {format(day, "EEEE")}
            </h3>
            <span className="text-xs text-muted-foreground font-mono">
              {format(day, "MMMM yyyy")} · GMT+5:30 {showSecondaryTz && "/ UTC"}
            </span>
          </div>
        </div>

        {allDay.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allDay.map((e) => {
              const meta = SOURCE_META[e.source] || SOURCE_META.calendar;
              return (
                <div
                  key={e.id}
                  onClick={() => onEventClick(e)}
                  style={{ backgroundColor: meta.color }}
                  className="px-2.5 py-1 rounded text-xs font-semibold text-white cursor-pointer shadow-xs"
                >
                  {e.title}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hourly Grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        <div
          className={cn("grid relative", showSecondaryTz ? "grid-cols-[100px_1fr]" : "grid-cols-[72px_1fr]")}
          style={{ height: `${24 * HOUR_ROW_HEIGHT}px` }}
        >
          {/* Hour labels */}
          <div className="relative border-r border-border/30">
            {HOURS.map((hour) => {
              if (hour === 0) return null;
              const localLabel = hour > 12 ? `${hour - 12} PM` : hour === 12 ? "12 PM" : `${hour} AM`;
              const utcHour = (hour - 5.5 + 24) % 24;
              const utcHourInt = Math.floor(utcHour);
              const utcMin = (utcHour % 1) * 60;
              const utcLabel = `${utcHourInt % 12 || 12}:${utcMin === 0 ? "00" : "30"} ${utcHourInt >= 12 ? "PM" : "AM"}`;

              return (
                <div
                  key={hour}
                  className="absolute right-3 text-xs font-mono text-muted-foreground/70 -translate-y-1/2 flex items-center gap-1.5"
                  style={{ top: `${hour * HOUR_ROW_HEIGHT}px` }}
                >
                  <span>{localLabel}</span>
                  {showSecondaryTz && (
                    <span className="text-[10px] text-purple-400 font-bold border-l pl-1 border-border/50">
                      {utcLabel}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Time Slot column */}
          <div
            onDragOver={(e) => e.preventDefault()}
            className="relative h-full"
          >
            {/* AI Free Slots Highlighted Windows */}
            {highlightFreeSlots && [10, 11, 14, 15, 16].map((openHour) => {
              const isBlocked = timed.some((e) => {
                const sH = new Date(e.start).getHours();
                const eH = e.end ? new Date(e.end).getHours() : sH + 1;
                return openHour >= sH && openHour < eH;
              });
              if (isBlocked) return null;
              return (
                <div
                  key={openHour}
                  onClick={() => onSlotClick(day, openHour, openHour + 1)}
                  style={{
                    top: `${openHour * HOUR_ROW_HEIGHT + 2}px`,
                    height: `${HOUR_ROW_HEIGHT - 4}px`,
                  }}
                  className="absolute inset-x-2 rounded border border-dashed border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/15 cursor-pointer z-10 transition-colors flex items-center justify-center gap-1.5 group"
                  title="AI Recommended Free Slot (Click to Book)"
                >
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400 opacity-60 group-hover:opacity-100" />
                  <span className="text-xs font-mono font-semibold text-emerald-500 opacity-70 group-hover:opacity-100">
                    AI Recommended Open Schedule Window
                  </span>
                </div>
              );
            })}

            {HOURS.map((hour) => (
              <div
                key={hour}
                onClick={() => onSlotClick(day, hour)}
                onDrop={(e) => {
                  e.preventDefault();
                  onDropSlot(day, hour);
                }}
                style={{
                  top: `${hour * HOUR_ROW_HEIGHT}px`,
                  height: `${HOUR_ROW_HEIGHT}px`,
                }}
                className={cn(
                  "absolute inset-x-0 border-b border-border/25 cursor-pointer transition-colors",
                  isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-100/50"
                )}
              />
            ))}

            {/* Current time red line */}
            {dayIsToday && (
              <div
                className="absolute inset-x-0 z-30 pointer-events-none flex items-center"
                style={{ top: `${currentTimeTop}px` }}
              >
                <div className="w-3 h-3 rounded-full bg-red-500 shadow-sm -ml-1.5 shrink-0" />
                <div className="h-[2px] bg-red-500 flex-1" />
              </div>
            )}

            {/* Events */}
            {layoutEvents.map(({ event: e, top, height, col, numCols }) => {
              const startDate = new Date(e.start);
              const meta = SOURCE_META[e.source] || SOURCE_META.calendar;
              const colWidth = 100 / numCols;
              const colLeft = col * colWidth;
              const isCurrentResizing = resizingState?.eventId === e.id;

              return (
                <div
                  key={e.id}
                  draggable={!isCurrentResizing}
                  onDragStart={() => onDragStartEvent(e)}
                  onClick={(evt) => {
                    evt.stopPropagation();
                    onEventClick(e);
                  }}
                  style={{
                    top: `${top}px`,
                    height: `${height}px`,
                    left: `${colLeft}%`,
                    width: `${colWidth - 1}%`,
                    borderLeftColor: meta.color,
                  }}
                  className={cn(
                    "absolute z-20 rounded border-l-4 p-3 text-xs shadow-xs overflow-hidden cursor-grab active:cursor-grabbing transition-all hover:shadow-md",
                    isDark ? meta.bgDark : meta.bgLight,
                    isDark ? meta.textDark : meta.textLight,
                    isCurrentResizing && "ring-2 ring-purple-500 opacity-90 shadow-lg cursor-ns-resize"
                  )}
                >
                  <div className="font-bold text-sm truncate">{e.title}</div>
                  <div className="text-xs font-mono opacity-80 mt-1">
                    {format(startDate, "h:mm a")}
                    {e.end ? ` – ${format(new Date(e.end), "h:mm a")}` : ""}
                  </div>
                  {e.meta?.description && (
                    <div className="mt-1 text-xs opacity-75 line-clamp-2">
                      {String(e.meta.description)}
                    </div>
                  )}

                  {/* BOTTOM RESIZE HANDLE */}
                  {e.source === "calendar" && (
                    <div
                      onMouseDown={(evt) => handleStartResize(evt, e)}
                      className="absolute bottom-0 inset-x-0 h-2.5 cursor-ns-resize hover:bg-purple-500/40 flex items-center justify-center transition-colors group/handle z-30"
                      title="Drag up/down to adjust meeting duration"
                    >
                      <div className="w-8 h-1 rounded-full bg-current opacity-30 group-hover/handle:opacity-100" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MONTH GRID VIEW ──
function MonthGrid({
  anchorDate,
  eventsByDay,
  conflictDays,
  isDark,
  onDayClick,
  onEventClick,
}: {
  anchorDate: Date;
  eventsByDay: Map<string, UnifiedEvent[]>;
  conflictDays: Set<string>;
  isDark: boolean;
  onDayClick: (d: Date) => void;
  onEventClick: (e: UnifiedEvent) => void;
}) {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const cells: Array<{ date: Date; isCurrentMonth: boolean }> = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrev - i), isCurrentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const nextD = cells.length - (firstDay + daysInMonth) + 1;
    cells.push({ date: new Date(year, month + 1, nextD), isCurrentMonth: false });
  }

  return (
    <div className="flex flex-col flex-1 overflow-x-auto min-w-[720px]">
      {/* Weekday headers */}
      <div
        className={cn(
          "grid grid-cols-7 border-b text-center py-2 text-xs font-bold uppercase tracking-wider",
          isDark ? "bg-[#141414] border-[#272727] text-muted-foreground" : "bg-slate-50 border-slate-200 text-slate-700"
        )}
      >
        {weekdays.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      {/* Month Day Cells */}
      <div className="grid grid-cols-7 flex-1">
        {cells.map((cell, idx) => {
          const key = format(cell.date, "yyyy-MM-dd");
          const dayEvents = eventsByDay.get(key) || [];
          const currentDay = isToday(cell.date);
          const hasConflict = conflictDays.has(key);

          return (
            <div
              key={idx}
              onClick={() => onDayClick(cell.date)}
              className={cn(
                "min-h-[105px] border-r border-b p-1.5 flex flex-col justify-between cursor-pointer transition-colors last:border-r-0",
                isDark ? "border-[#272727] hover:bg-white/[0.02]" : "border-slate-200 hover:bg-slate-50",
                !cell.isCurrentMonth && "opacity-35",
                hasConflict && "bg-amber-500/10"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "text-xs font-mono font-semibold rounded-full w-6 h-6 flex items-center justify-center",
                    currentDay
                      ? "bg-purple-600 text-white font-bold"
                      : "text-foreground/80"
                  )}
                >
                  {cell.date.getDate()}
                </span>
                {hasConflict && <AlertTriangle className="h-3 w-3 text-amber-500" />}
              </div>

              {/* Event chips */}
              <div className="space-y-1 overflow-hidden flex-1">
                {dayEvents.slice(0, 3).map((e) => {
                  const meta = SOURCE_META[e.source] || SOURCE_META.calendar;
                  return (
                    <div
                      key={e.id}
                      onClick={(evt) => {
                        evt.stopPropagation();
                        onEventClick(e);
                      }}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] truncate leading-tight flex items-center gap-1 shadow-xs cursor-pointer hover:opacity-90",
                        isDark ? meta.bgDark : meta.bgLight,
                        isDark ? meta.textDark : meta.textLight
                      )}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                      <span className="truncate">{e.title}</span>
                    </div>
                  );
                })}
                {dayEvents.length > 3 && (
                  <span className="text-[10px] text-muted-foreground/80 font-mono px-1">
                    +{dayEvents.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── YEAR HEATMAP VIEW ──
function YearGrid({
  anchorDate,
  eventsByDay,
  isDark,
  onDayClick,
}: {
  anchorDate: Date;
  eventsByDay: Map<string, UnifiedEvent[]>;
  isDark: boolean;
  onDayClick: (d: Date) => void;
}) {
  const year = anchorDate.getFullYear();
  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className="p-4 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 12 }).map((_, month) => {
        const monthDate = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startDay = new Date(year, month, 1).getDay();

        const days: (Date | null)[] = [];
        for (let i = 0; i < startDay; i++) days.push(null);
        for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));

        return (
          <div
            key={month}
            className={cn(
              "p-3 rounded-lg border shadow-xs select-none",
              isDark ? "bg-[#141414] border-[#272727]" : "bg-white border-slate-200"
            )}
          >
            <div className="text-xs font-bold font-mono text-foreground mb-2">
              {format(monthDate, "MMMM")}
            </div>
            <div className="grid grid-cols-7 text-center gap-1">
              {weekdays.map((w, idx) => (
                <span key={idx} className="text-[9px] text-muted-foreground font-semibold">
                  {w}
                </span>
              ))}
              {days.map((day, dIdx) => {
                if (!day) return <div key={dIdx} className="h-6 w-6" />;
                const key = format(day, "yyyy-MM-dd");
                const count = (eventsByDay.get(key) || []).length;
                const isCurrent = isToday(day);

                return (
                  <button
                    key={dIdx}
                    onClick={() => onDayClick(day)}
                    title={`${format(day, "MMM d")}: ${count} items`}
                    className={cn(
                      "h-6 w-6 mx-auto rounded-full text-[10px] font-mono flex items-center justify-center transition-colors",
                      count > 0 && "font-bold",
                      count >= 5
                        ? "bg-purple-600 text-white"
                        : count >= 2
                        ? "bg-purple-500/30 text-purple-300"
                        : count === 1
                        ? "bg-purple-500/15 text-purple-400"
                        : "text-foreground/80 hover:bg-muted",
                      isCurrent && "ring-1 ring-purple-400"
                    )}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── AGENDA / TIMELINE VIEW ──
function AgendaView({
  events,
  anchorDate,
  isDark,
  onEventClick,
}: {
  events: UnifiedEvent[];
  anchorDate: Date;
  isDark: boolean;
  onEventClick: (e: UnifiedEvent) => void;
}) {
  const sorted = useMemo(() => {
    return [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [events]);

  const grouped = useMemo(() => {
    const map = new Map<string, UnifiedEvent[]>();
    for (const e of sorted) {
      const key = format(new Date(e.start), "EEEE, MMMM d, yyyy");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries());
  }, [sorted]);

  return (
    <div className="p-4 sm:p-6 overflow-y-auto max-w-4xl mx-auto w-full space-y-6">
      {grouped.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-xs font-mono">
          No scheduled events or deadlines in this range.
        </div>
      ) : (
        grouped.map(([dateTitle, dayEvents]) => (
          <div key={dateTitle} className="space-y-2">
            <div className="flex items-center gap-2 border-b border-border/40 pb-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                {dateTitle}
              </h3>
              <span className="text-[10px] text-muted-foreground font-mono">
                ({dayEvents.length} items)
              </span>
            </div>

            <div className="space-y-2">
              {dayEvents.map((e) => {
                const meta = SOURCE_META[e.source] || SOURCE_META.calendar;
                const startDate = new Date(e.start);

                return (
                  <div
                    key={e.id}
                    onClick={() => onEventClick(e)}
                    className={cn(
                      "p-3 rounded border flex items-center justify-between gap-4 cursor-pointer transition-all hover:shadow-xs",
                      isDark ? "bg-[#141414] border-[#272727] hover:bg-[#1A1A1A]" : "bg-white border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="w-1 h-8 rounded-full shrink-0"
                        style={{ backgroundColor: meta.color }}
                      />
                      <div>
                        <div className="font-semibold text-xs text-foreground">
                          {e.title}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-2 mt-0.5">
                          <span>
                            {e.allDay
                              ? "All Day"
                              : `${format(startDate, "h:mm a")} ${
                                  e.end ? `- ${format(new Date(e.end), "h:mm a")}` : ""
                                }`}
                          </span>
                          <span>•</span>
                          <span style={{ color: meta.color }}>{meta.label}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {e.meta?.status && (
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {String(e.meta.status)}
                        </Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
