"use client";
import { runErpAssistant } from "@/lib/ai/erpAssistantClient";
import { VoiceActivity } from "@/components/ai/VoiceActivity";
import { AiMarkdown } from "@/components/ai/AiMarkdown";

import { AiUsageIndicator } from "@/components/ai/AiUsageIndicator";
import { refreshAiUsage } from "@/lib/hooks/useAiUsageSummary";
import React, { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { X, Send, Sparkles, Maximize2, Mic, Paperclip, FileText, Clock, MessageSquare, Plus, Image as ImageIcon, Brain, Trash2, Check, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiChatStore, type AiChatMessage } from "@/store/aiChatStore";
import { confirmDialog } from "@/components/providers/ConfirmRoot";
import { AttachmentPreview } from "@/components/ai/AttachmentPreview";
import { stashPrefill } from "@/lib/ai/aiPrefill";
import { CREATE_VERB_RX, findCreateTarget } from "@/lib/ai/createTargets";
import { runTaskFlow, shouldConsultTaskFlow } from "@/lib/ai/taskFlowClient";
import { buildQuickReplies, stripChoiceText } from "@/lib/ai/flowPresentation";
import { FlowQuickReplies } from "@/components/ai/FlowQuickReplies";
import { tryAiMemoryFlow } from "@/lib/ai/memoryFlow";
import { historyBeforeCurrentQuestion } from "@/lib/ai/chatHistoryUtils";
import { tryAiInventoryMemoryFlow } from "@/lib/ai/inventoryMemoryFlow";
import { NAV_TRIGGER_RX } from "@/lib/ai/navFlow";
import { NAV_DESTINATIONS } from "@/lib/ai/navRoutes";
import { useSpeechToText } from "@/lib/hooks/useSpeechToText";
import { useAutoResizeTextarea } from "@/lib/hooks/useAutoResizeTextarea";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useThemeStore } from "@/store/themeStore";
import { useTenantStore } from "@/store/useTenantStore";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

// Message shape lives in the shared store so the thread survives navigation.
type Message = AiChatMessage;

export function AiSidebar({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const tenantId = useTenantStore((s) => s.tenantId);
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme !== "light";

  // Chat thread + New Chat live in the module-level store so they persist across
  // client-side navigation (e.g. when the AI opens a create form for you).
  const messages = useAiChatStore((s) => s.messages);
  const setMessages = useAiChatStore((s) => s.setMessages);
  const conversationId = useAiChatStore((s) => s.conversationId);
  const input = useAiChatStore((s) => s.draft);
  const setInput = useAiChatStore((s) => s.setDraft);
  const setConversationId = useAiChatStore((s) => s.setConversationId);
  const newChat = useAiChatStore((s) => s.newChat);
  const pendingNavigation = useRef<{ route: string; openingText: string; completedText: string } | null>(null);
  const previousIdentity = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const usageRequestWasActive = useRef(false);
  useEffect(() => {
    if (!isLoading) {
      if (usageRequestWasActive.current) refreshAiUsage();
      usageRequestWasActive.current = false;
      return;
    }
    usageRequestWasActive.current = true;
    refreshAiUsage();
  }, [isLoading]);
  const [showHistory, setShowHistory] = useState(false);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memoryRecords, setMemoryRecords] = useState<any[]>([]);
  const [memoryLabel, setMemoryLabel] = useState("");
  const [memoryValue, setMemoryValue] = useState("");
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryValue, setEditingMemoryValue] = useState("");
  const [historyChats, setHistoryChats] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useAutoResizeTextarea(textareaRef, input);

  const identityKey = session?.user?.id && tenantId ? `${session.user.id}:${tenantId}` : null;
  useEffect(() => {
    if (previousIdentity.current && identityKey !== previousIdentity.current) {
      newChat();
      setHistoryChats([]);
      setMemoryRecords([]);
      try { sessionStorage.removeItem("aupulens-ai-chat"); } catch { /* storage may be unavailable */ }
    }
    previousIdentity.current = identityKey;
  }, [identityKey, newChat]);

  // Voice input (Azure speech-to-text) — records via the mic, transcribes on the
  // server, and appends the recognised text to the prompt for the user to review
  // and send. Works in Electron + all browsers (unlike the old browser API).
  const { supported: micSupported, listening, transcribing, audioLevels, interim, toggle: toggleMic } = useSpeechToText({
    onFinalText: (t) => setInput((prev) => (prev ? `${prev} ${t}` : t)),
    onError: (m) => toast.error(m),
  });

  // File attachments (PDF / DOCX / images) — multiple supported. Each is read as
  // a data URL and sent with the prompt.
  type Attachment = { name: string; type: string; dataUrl: string };
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const normalizePath = (value: string) => {
    try {
      const path = new URL(value, window.location.origin).pathname.replace(/\/+$/, "");
      return path || "/";
    } catch {
      return value.split("?")[0].replace(/\/+$/, "") || "/";
    }
  };
  const routeIsOpen = (route: string, currentPath: string) => {
    const target = normalizePath(route);
    const current = normalizePath(currentPath);
    return current === target || current.startsWith(`${target}/`);
  };
  const replaceAssistantMessage = (previousText: string, nextText: string) => {
    setMessages((prev) => {
      let index = -1;
      for (let i = prev.length - 1; i >= 0; i -= 1) {
        if (prev[i].role === "assistant" && prev[i].text === previousText) { index = i; break; }
      }
      if (index < 0) return prev;
      const next = [...prev];
      next[index] = { ...next[index], text: nextText, isLoading: false };
      return next;
    });
  };
  const navigateWithStatus = (route: string, openingText: string, completedText: string) => {
    if (routeIsOpen(route, pathname)) {
      replaceAssistantMessage(openingText, completedText);
      return;
    }
    pendingNavigation.current = { route, openingText, completedText };
    router.push(route);
  };

  // The sidebar survives client-side navigation. Resolve the transient
  // "Opening…" message when its destination becomes active, and repair a
  // matching stale message restored from session storage after a refresh.
  useEffect(() => {
    const pending = pendingNavigation.current;
    if (pending && routeIsOpen(pending.route, pathname)) {
      replaceAssistantMessage(pending.openingText, pending.completedText);
      pendingNavigation.current = null;
      return;
    }
    if (pending) return;
    const currentPath = normalizePath(pathname);
    const destination = NAV_DESTINATIONS.find((item) => normalizePath(item.href) === currentPath);
    const destinationTitle = destination?.title ?? currentPath.split("/").filter(Boolean).at(-1)?.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    if (!destinationTitle) return;
    setMessages((prev) => {
      let index = -1;
      for (let i = prev.length - 1; i >= 0; i -= 1) {
        if (prev[i].role === "assistant" && !prev[i].isLoading && prev[i].text) { index = i; break; }
      }
      if (index < 0) return prev;
      const message = prev[index].text.trim();
      const opening = message.match(/^Opening\s+(.+?)(?:…|\.\.\.)$/i);
      if (!opening || opening[1].trim().toLowerCase() !== destinationTitle.trim().toLowerCase()) return prev;
      const next = [...prev];
      next[index] = { ...next[index], text: `Opened ${destinationTitle}.` };
      return next;
    });
  }, [pathname, setMessages]);

  // A create the AI has prepared but is waiting for the user to confirm — used
  // when something is unclear or a required record is missing, so the assistant
  // ASKS before opening the form instead of silently redirecting (Claude-Code
  // style: don't guess on ambiguity — confirm, then act).
  type PendingCreate = { target: string; route: string; data: Record<string, any>; suggestions: string[]; label: string; question: string };
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);

  // An ambiguous create where the MODULE is unclear (e.g. "create a product" —
  // Inventory or Manufacturing?). We hold the original message + files and, once
  // the user picks, re-run the prefill against the chosen target. Claude-Code
  // style: ask instead of guessing which module the user meant.
  type ChoiceOption = { match: RegExp; target: string; route: string; label: string };
  type PendingChoice = { message: string; attachments: Attachment[]; options: ChoiceOption[] };
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB each
  const MAX_ATTACHMENTS = 8;

  const addFiles = (files: FileList | File[] | null | undefined) => {
    const list = files ? Array.from(files) : [];
    for (const file of list) {
      if (!file) continue;
      if (file.size > MAX_FILE_BYTES) { setMessages((p) => [...p, { role: "assistant", text: `"${file.name || "A file"}" is too large (max 8 MB).` }]); continue; }
      // Pasted screenshots often arrive with no filename — give them a sensible one.
      const name = file.name || (file.type.startsWith("image/") ? `pasted-image.${(file.type.split("/")[1] || "png")}` : "pasted-file");
      const reader = new FileReader();
      reader.onload = () =>
        setAttachments((prev) => (prev.length >= MAX_ATTACHMENTS ? prev : [...prev, { name, type: file.type, dataUrl: reader.result as string }]));
      reader.readAsDataURL(file);
    }
  };

  const removeAttachment = (i: number) => setAttachments((prev) => prev.filter((_, idx) => idx !== i));

  // Paste one or more images/files (e.g. copied screenshots) straight into the box.
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) { e.preventDefault(); addFiles(files); }
  };

  // Map the in-memory thread to the {role, content} shape the API uses for
  // multi-turn memory. The client thread is the source of truth for the live
  // conversation (the streaming route doesn't persist mid-thread), so we send it
  // every turn — this is what lets "tell me about that data" work later.
  const buildHistory = (base: Message[]): { role: string; content: string }[] =>
    base.filter((m) => !m.isLoading && m.text).map((m) => ({ role: m.role, content: m.text }));

  const ensureConversationId = () => {
    const current = useAiChatStore.getState().conversationId;
    if (current) return current;
    const created = crypto.randomUUID();
    setConversationId(created);
    return created;
  };

  // If the current message has no new files, reuse the most recently attached
  // ones so the user can say "create a journal entry from that" / "summarise
  // that document" turns later WITHOUT re-uploading. Memory the user expects.
  const carriedAttachments = (): Attachment[] => {
    if (attachments.length) return attachments;
    for (let i = messages.length - 1; i >= 0; i--) {
      const a = messages[i].attachments?.filter((x) => x.dataUrl);
      if (a && a.length) return a as Attachment[];
    }
    return [];
  };

  const sendQuery = async (queryText: string, customMessagesHistory?: Message[]) => {
    const activeConversationId = ensureConversationId();
    const requestId = crypto.randomUUID();
    setIsLoading(true);

    // Capture attachments up front so they render on the user's message (and
    // stay visible while the AI is thinking) before we clear the composer. Files
    // freshly attached to THIS message are shown on the bubble; if there are
    // none, we still SEND the most recent prior files so context carries over.
    const freshAttachments = attachments;
    const sendAttachments = freshAttachments.length ? freshAttachments : carriedAttachments();
    // Some callers pass a display-ready transcript that already includes the
    // question being sent (suggested prompts and action follow-ups). The API
    // adds `message` as the final user turn itself, so keep request history
    // strictly to turns before this question and render the new turn once.
    const baseHistory = historyBeforeCurrentQuestion(customMessagesHistory || messages, queryText);
    const nextMessages = [
      ...baseHistory,
      { role: "user" as const, text: queryText, attachments: freshAttachments.length ? freshAttachments : undefined },
      { role: "assistant" as const, text: "", isLoading: true },
    ];
    setMessages(nextMessages);

    try {
      // Stream the answer token-by-token (ChatGPT-style). On a gate/error the
      // server replies with JSON instead — detected via content-type.
      setAttachments([]); // consumed
      const response = await fetch("/api/admin/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: queryText, stream: true, attachments: sendAttachments, history: buildHistory(baseHistory), conversationId: activeConversationId, requestId }),
      });
      const returnedConvId = response.headers.get("x-conversation-id");
      if (returnedConvId && returnedConvId !== conversationId) setConversationId(returnedConvId);

      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || contentType.includes("application/json")) {
        const data = await response.json().catch(() => ({}));
        const errMessage = data.error || "Failed to get response";
        const isCreditError = data.code === "AI_CREDITS_EXHAUSTED" || data.code === "AI_LIMIT_REACHED" || /credit|usage limit|exhausted/i.test(errMessage);
        if (isCreditError) {
          toast.error(errMessage, { duration: 6000 });
          setMessages((prev) => prev.filter((m) => !m.isLoading));
          refreshAiUsage();
          return;
        }
        throw new Error(errMessage);
      }

      let streamed = "";
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          streamed += decoder.decode(value, { stream: true });
          const current = streamed;
          setMessages((prev) => {
            const newMsgs = [...prev];
            if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === "assistant") {
              newMsgs[newMsgs.length - 1] = { role: "assistant", text: current };
            }
            return newMsgs;
          });
        }
      }

      const finalText = streamed || "(no response)";
      setMessages((prev) => {
        const newMsgs = [...prev];
        if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === "assistant") {
          newMsgs[newMsgs.length - 1] = { role: "assistant", text: finalText };
        }
        return newMsgs;
      });

      // The server persisted this completed exchange before closing the stream.
      // Keep the browser thread for rendering, but never overwrite canonical
      // server history with a possibly stale client snapshot.

    } catch (error: any) {
      const msg = error?.message || "";
      const isCreditError = /credit|usage limit|exhausted/i.test(msg);
      if (isCreditError) {
        toast.error(msg, { duration: 6000 });
        setMessages((prev) => prev.filter((m) => !m.isLoading));
      } else {
        console.error("Error:", error);
        setMessages((prev) => {
          const newMsgs = [...prev];
          if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === "assistant") {
            newMsgs[newMsgs.length - 1] = {
              role: "assistant",
              text: "Sorry, I encountered an error. Please try again.",
            };
          }
          return newMsgs;
        });
      }
    } finally {
      setIsLoading(false);
      refreshAiUsage();
    }
  };

  const handleSuggestedPrompt = (text: string) => {
    const userText = text;
    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    sendQuery(userText, [...messages, { role: "user", text: userText }]);
  };

  // Verb-led messages ("create a customer…", "add a lead and a task…") and
  // navigation phrases ("go to leads", "open invoices", "redirect to
  // receipts") are routed to the Command Center. Everything else (and
  // anything with an attachment) is a normal Q&A/analysis. NAV_RX is the
  // same broad trigger shared with every per-module AI Assistant page
  // (lib/ai/navFlow.ts) — a message like "redirect to incoming receipts"
  // used to fall through to plain Q&A here because "redirect" wasn't in this
  // regex, so the assistant only ever described the click-path instead of
  // actually navigating.
  const ACTION_RX = /\b(create|add|make|new|generate|draft|delete|remove|update|change|set|book|record|raise|issue)\b/i;
  const NAV_RX = NAV_TRIGGER_RX;

  const updatePendingAssistant = (update: Partial<Message>) => {
    const safeUpdate = {
      ...update,
      text: update.text?.trim() || "I couldn't prepare a response for that request. Please try again or rephrase it.",
    };
    setMessages((prev) => {
      const next = [...prev];
      const lastIndex = next.length - 1;
      if (lastIndex >= 0 && next[lastIndex].role === "assistant" && next[lastIndex].isLoading) {
        next[lastIndex] = {
          role: "assistant",
          text: "",
          ...safeUpdate,
          isLoading: false,
        };
      } else {
        next.push({
          role: "assistant",
          text: "",
          ...safeUpdate,
          isLoading: false,
        });
      }
      return next;
    });
  };

  // Run the prefill flow for a chosen target: extract fields, then either ask
  // (missing dependency) or stash + navigate to the pre-filled form. Shared by
  // the normal path and the "which module?" follow-up so both behave identically.
  const executePrefill = async (
    targetDef: { target: string; route: string; label: string },
    message: string,
    attsToSend: Attachment[],
    attsForMsg?: Attachment[],
    base?: Message[],
  ) => {
    setIsLoading(true);
    setAttachments([]);
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant" && last.isLoading) return prev;
      return [
        ...prev,
        { role: "user", text: message, attachments: attsForMsg },
        { role: "assistant", text: "", isLoading: true },
      ];
    });
    try {
      const currentMessages = useAiChatStore.getState().messages;
      const history = (base || currentMessages).filter((m) => !m.isLoading && m.text).slice(-8).map((m) => ({ role: m.role, content: m.text }));
      const res = await fetch("/api/ai/prefill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: targetDef.target, message, attachments: attsToSend, history }),
      });
      const data = await res.json().catch(() => ({}));
      const extracted = data?.data && typeof data.data === "object"
        ? Object.values(data.data).some((v) => Array.isArray(v) ? v.length > 0 : v != null && v !== "")
        : false;
      if (res.ok && data.success && !extracted && !data.missingDependency) {
        updatePendingAssistant({ text: `I couldn't pull enough details to fill the ${targetDef.label} form. Tell me the details in your message (or attach a document/image) and I'll prepare it for you.` });
        setIsLoading(false);
        return;
      }
      if (res.ok && data.success) {
        const sugg = data.suggestions?.length
          ? `\n\n**A couple of things to double-check:**\n${data.suggestions.map((s: string) => `- ${s}`).join("\n")}`
          : "";
        if (data.missingDependency) {
          const dep = data.missingDependency;
          setPendingCreate({ target: data.target, route: data.route, data: data.data || {}, suggestions: data.suggestions || [], label: targetDef.label, question: dep.name });
          updatePendingAssistant({ text: `I've got the ${targetDef.label} details ready, but there's **no ${dep.type} named "${dep.name}"** in the system yet.\n\nDo you want me to **open the ${targetDef.label} form anyway** (you can add the ${dep.type} inline with the "+"), or would you rather create the ${dep.type} first? Reply **"yes"** to open it now, or **"no"** to hold off.${sugg}` });
          setIsLoading(false);
          return;
        }
        stashPrefill({ target: data.target, route: data.route, data: data.data || {}, suggestions: data.suggestions || [] });
        updatePendingAssistant({ text: `I've prepared the ${targetDef.label} form with the details I found — review them and click **Create** to save.${sugg}` });
        setIsLoading(false);
        router.push(targetDef.route);
        return;
      }
      updatePendingAssistant({ text: data.message || (targetDef.target === "sales_quote" || targetDef.target === "quote" ? "Which customer should this quote be for?" : `Which customer or details should I use for the ${targetDef.label}?`) });
      setIsLoading(false);
    } catch {
      updatePendingAssistant({ text: "Something went wrong preparing the form. Please try again." });
      setIsLoading(false);
    }
  };

  const executeEmployeeAutomation = async (message: string, baseMessages: Message[]) => {
    setIsLoading(true);
    try {
      const history = baseMessages
        .filter((m) => !m.isLoading && m.text)
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.text }));
      const prefillRes = await fetch("/api/ai/prefill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "employee", message, history }),
      });
      const prefill = await prefillRes.json().catch(() => ({}));
      if (!prefillRes.ok || !prefill.success) {
        updatePendingAssistant({ text: prefill.message || "I couldn't read those employee details. Please send them again." });
        setIsLoading(false);
        return;
      }

      const details = prefill.data || {};
      const required = [
        ["first name", details.firstName || details.first_name],
        ["last name", details.lastName || details.last_name],
        ["work email", details.email],
        ["phone number", details.phone || details.mobile],
      ] as const;
      const missing = required.filter(([, value]) => !String(value || "").trim()).map(([label]) => label);
      if (missing.length) {
        const question = missing.length === required.length
          ? "What are the employee’s first name, last name, work email, and phone number?"
          : `I have the details so far. Please provide the ${missing.join(", ")} so I can prepare the employee record.`;
        updatePendingAssistant({ text: question });
        setIsLoading(false);
        return;
      }

      const commandRes = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: `Create an employee using these user-provided details: ${JSON.stringify(details)}`,
          context: { pathname: "/hr/employees" },
        }),
      });
      const commandData = await commandRes.json().catch(() => ({}));
      if (commandRes.ok && commandData.action === "confirm" && commandData.proposalId) {
        updatePendingAssistant({
          text: commandData.summary || "Review the employee details and confirm to create the record.",
          proposal: { proposalId: commandData.proposalId, destructive: false, status: "pending" },
        });
      } else {
        updatePendingAssistant({ text: commandData.message || "I couldn't prepare the employee record. Please check the details and try again." });
      }
    } catch {
      updatePendingAssistant({ text: "I couldn't prepare the employee record. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  // Modules a bare "product" could belong to. If the user names one we honour it;
  // if not, we ask rather than guessing (Inventory vs Manufacturing).
  const MANUF_HINT_RX = /\b(manufactur\w*|production|factory|shop[\s-]?floor)\b/i;
  const INV_HINT_RX = /\b(inventory|stock|warehouse|godown|sales|catalogue|catalog)\b/i;

  const handleSend = async (text: string) => {
    const q = text.trim();
    if (!q && attachments.length === 0) return;
    if (isLoading) return;
    const activeConversationId = ensureConversationId();

    const freshAttachments = attachments;
    const attForMsg = freshAttachments.length ? freshAttachments : undefined;
    const sentAttachments = freshAttachments.length ? freshAttachments : carriedAttachments();

    // Immediately post the user prompt and the assistant thinking indicator into the thread,
    // and clear input/attachments so the user receives instant visual feedback that the message was sent and is processing.
    setIsLoading(true);
    setInput("");
    setAttachments([]);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: q, attachments: attForMsg },
      { role: "assistant", text: "", isLoading: true },
    ]);

    const hasPendingEmployeeCreate = messages.some((turn) =>
      turn.role === "assistant" &&
      /prepared the employee form|prepared an employee form|new employee form|employee’s first name|prepare the employee record/i.test(turn.text || "")
    );
    const directEmployeeCreate = CREATE_VERB_RX.test(q) && findCreateTarget(q)?.target === "employee";
    const employeeDetailsFollowUp = !CREATE_VERB_RX.test(q) && /\b(name|email|phone|mobile|designation|department)\b|@/i.test(q);
    if (!freshAttachments.length && (directEmployeeCreate || (hasPendingEmployeeCreate && employeeDetailsFollowUp))) {
      await executeEmployeeAutomation(q, messages);
      return;
    }

    if (!freshAttachments.length && ["sales", "admin", "master-admin", "hr", "finance", "inventory", "project", "manufacturing", "crm"].includes(session?.user?.role || "")) {
      const erp = await runErpAssistant({ text: q, module: session?.user?.role === "sales" ? "sales" : "admin", conversationId: activeConversationId, requestId: crypto.randomUUID() });
      if (erp.handled) {
        setIsLoading(false);
        updatePendingAssistant({
          text: erp.message?.trim() || "I couldn't prepare a response for that question. Please try asking it another way.",
          structured: erp.structured,
          quickReplies: erp.actions?.map((a) => ({ ...a, kind: "action" as const })),
        });
        if (erp.conversationId) setConversationId(erp.conversationId);
        return;
      }
    }

    // Explicit memory requests are opt-in. Accept a labelled form
    // "Remember project stack: Next.js + MongoDB" or a plain "Remember that …".
    const remember = q.match(/^remember(?:\s+that)?\s+(.+)$/i);
    if (remember && !freshAttachments.length) {
      const fact = remember[1].trim();
      const [labelPart, valuePart] = fact.split(/:\s*/, 2);
      const label = valuePart ? labelPart.trim() : fact.split(/\s+/).slice(0, 5).join(" ").slice(0, 80);
      const value = valuePart?.trim() || fact;
      try {
        const res = await fetch("/api/ai/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "user", key: label, value, category: "other", sourceConversationId: activeConversationId }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not save that memory");
        const answer = memoryEnabled ? `Saved **${label}** to your personal AI memory. Relevant saved facts can be used in future chats while cross-chat recall is on.` : `Saved **${label}**. Cross-chat recall is paused, so I won't use it in other chats until you turn memory back on.`;
        updatePendingAssistant({ text: answer });
        fetch("/api/admin/chat-history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: activeConversationId, title: q.slice(0, 50), messages: [
          ...messages.filter((m) => !m.isLoading && m.text).map((m) => ({ role: m.role, content: m.text, timestamp: new Date() })),
          { role: "user", content: q, timestamp: new Date() },
          { role: "assistant", content: answer, timestamp: new Date() },
        ] }) }).catch(() => {});
      } catch (error: any) {
        updatePendingAssistant({ text: error.message || "I couldn't save that memory." });
      } finally { setIsLoading(false); }
      return;
    }

    // ── Resolve a pending "which module?" choice first ────────────────────────
    if (pendingChoice && q) {
      const opt = pendingChoice.options.find((o) => o.match.test(q));
      if (opt) {
        const pc = pendingChoice;
        setPendingChoice(null);
        await executePrefill(opt, pc.message, pc.attachments, pc.attachments.length ? pc.attachments : undefined);
        return;
      }
      setPendingChoice(null); // unrecognised reply → treat as a fresh instruction
    }

    // ── Resolve a pending "shall I proceed?" question first ───────────────────
    // If the assistant asked to confirm a prepared create, interpret a yes/no
    // reply here instead of treating it as a brand-new request.
    if (pendingCreate && q) {
      const ans = q.toLowerCase();
      const yes = /\b(yes|yeah|yep|ya|sure|ok|okay|proceed|go ahead|continue|do it|open( the)?( form)?|confirm|create it anyway|anyway)\b/i.test(ans);
      const no = /\b(no|nope|cancel|stop|don'?t|never ?mind|not now|wait)\b/i.test(ans);
      const pc = pendingCreate;
      if (yes) {
        setPendingCreate(null);
        stashPrefill({ target: pc.target, route: pc.route, data: pc.data, suggestions: pc.suggestions });
        const openingText = `Opening the ${pc.label} form now — review the details and click **Create** to save.`;
        const completedText = `The ${pc.label} form is open — review the details and click **Create** to save.`;
        updatePendingAssistant({ text: openingText });
        setIsLoading(false);
        navigateWithStatus(pc.route, openingText, completedText);
        return;
      }
      if (no) {
        setPendingCreate(null);
        updatePendingAssistant({ text: `Okay — I won't open the ${pc.label} form. Tell me what you'd like to do instead.` });
        setIsLoading(false);
        return;
      }
      // Neither yes nor no → treat as a fresh instruction; drop the pending one.
      setPendingCreate(null);
    }

    // ── Guided create (sales invoice: explain / do / ask, one question at a time) ──
    // Same server flow the per-module assistants get via tryAiCreateFlow. It also hands back the
    // pipeline's ENGLISH for the message, so regional-language create requests reach the routing below.
    let qEnglish = q;
    if (!freshAttachments.length && shouldConsultTaskFlow(q, false)) {
      const tf = await runTaskFlow(q, { hasAttachments: false });
      if (tf.outcome) {
        const quick = buildQuickReplies(tf.outcome);
        const openingText = quick.length ? stripChoiceText(tf.outcome.message) : tf.outcome.message;
        const completedText = openingText.replace(/\s*Opening it now[.!…]*$/i, " The destination is open.");
        updatePendingAssistant({ text: openingText, quickReplies: quick.length ? quick : undefined });
        setIsLoading(false);
        if (tf.outcome.route) navigateWithStatus(tf.outcome.route, openingText, completedText);
        return;
      }
      if (tf.english && tf.english.trim()) qEnglish = tf.english.trim();
    }

    // ── AI-native create: pre-fill the real form and navigate there ──────────
    const targetDef = hasPendingEmployeeCreate && employeeDetailsFollowUp
      ? findCreateTarget("create employee")
      : CREATE_VERB_RX.test(qEnglish)
      ? findCreateTarget(qEnglish)
      : undefined;
    if (targetDef?.target === "employee") {
      await executeEmployeeAutomation(qEnglish, messages);
      return;
    }
    if (targetDef) {
      // A bare "product" is ambiguous — Inventory catalogue or Manufacturing?
      // If the user didn't say, ASK instead of guessing the wrong module.
      if (targetDef.target === "product" && !MANUF_HINT_RX.test(q) && !INV_HINT_RX.test(q)) {
        setPendingChoice({
          message: q,
          attachments: sentAttachments,
          options: [
            { match: /\b(inventory|stock|sales|catalogue|catalog|1)\b/i, target: "product", route: "/sales/products", label: "product" },
            { match: /\b(manufactur\w*|production|factory|2)\b/i, target: "manufacturing_item", route: "/manufacturing/items", label: "manufacturing item" },
          ],
        });
        updatePendingAssistant({ text: `Sure — where should I create this product?\n\n- **Inventory** (the shared product catalogue), or\n- **Manufacturing** (a manufacturing item)\n\nReply **"inventory"** or **"manufacturing"** and I'll prepare the right form with your details.` });
        setIsLoading(false);
        return;
      }
      await executePrefill(targetDef, q, sentAttachments, attForMsg);
      return;
    }

    // ── AI "memory": real database lookups for factual Sales questions ──────
    if (freshAttachments.length === 0) {
      const priorTurnsForMemory = messages.filter((m) => !m.isLoading && m.text).map((m) => ({ role: m.role, content: m.text }));

      const memOutcome = await tryAiMemoryFlow({ text: qEnglish, history: priorTurnsForMemory });
      if (memOutcome.handled) {
        updatePendingAssistant({ text: memOutcome.message || "" });
        setIsLoading(false);
        fetch("/api/admin/chat-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: q.slice(0, 50),
            conversationId: activeConversationId,
            messages: [
              ...messages.filter((m) => !m.isLoading && (m.role === "user" || m.role === "assistant") && m.text)
                .map((m) => ({ role: m.role, content: m.text, timestamp: new Date() })),
              { role: "user", content: q, timestamp: new Date() },
              { role: "assistant", content: memOutcome.message || "", timestamp: new Date() },
            ],
          }),
        }).catch(() => {});
        if (memOutcome.route) router.push(memOutcome.route);
        return;
      }

      const invMemOutcome = await tryAiInventoryMemoryFlow({ text: qEnglish, history: priorTurnsForMemory });
      if (invMemOutcome.handled) {
        updatePendingAssistant({ text: invMemOutcome.message || "" });
        setIsLoading(false);
        fetch("/api/admin/chat-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: q.slice(0, 50),
            conversationId: activeConversationId,
            messages: [
              ...messages.filter((m) => !m.isLoading && (m.role === "user" || m.role === "assistant") && m.text)
                .map((m) => ({ role: m.role, content: m.text, timestamp: new Date() })),
              { role: "user", content: q, timestamp: new Date() },
              { role: "assistant", content: invMemOutcome.message || "", timestamp: new Date() },
            ],
          }),
        }).catch(() => {});
        if (invMemOutcome.route) router.push(invMemOutcome.route);
        return;
      }
    }

    const isCommand = ACTION_RX.test(qEnglish) || NAV_RX.test(qEnglish);
    if (freshAttachments.length > 0 || !isCommand) {
      sendQuery(q || "Please analyse the attached file(s).");
      return;
    }

    try {
      const res = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: qEnglish, context: { pathname: typeof window !== "undefined" ? window.location.pathname : "" } }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.action === "confirm" && data.proposalId) {
        updatePendingAssistant({
          text: data.summary || data.message || "Confirm to proceed.",
          proposal: { proposalId: data.proposalId, destructive: !!data.destructive, status: "pending" },
        });
        setIsLoading(false);
        return;
      }
      if (res.ok && data.action === "navigate" && data.url) {
        const openingText = data.message || "Opening the page…";
        const completedText = openingText.replace(/^Opening\s+/i, "Opened ").replace(/(?:…|\.\.\.)$/, ".");
        updatePendingAssistant({ text: openingText });
        setIsLoading(false);
        navigateWithStatus(data.url, openingText, completedText);
        return;
      }
      if (res.ok && data.action === "unknown" && data.navMiss && data.message) {
        updatePendingAssistant({ text: data.message });
        setIsLoading(false);
        return;
      }
      await sendQuery(q);
    } catch {
      updatePendingAssistant({ text: "Sorry, I couldn't process that. Please try again." });
      setIsLoading(false);
    }
  };

  const confirmProposal = async (proposalId: string) => {
    setMessages((prev) => prev.map((m) => (m.proposal?.proposalId === proposalId ? { ...m, text: "Working on it…", proposal: { ...m.proposal, status: m.proposal.status } } : m)));
    try {
      const res = await fetch(`/api/ai/command/actions/${proposalId}/confirm`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      const ok = res.ok && data.success;
      setMessages((prev) => prev.map((m) => (m.proposal?.proposalId === proposalId ? { ...m, text: ok ? (data.message || "✓ Done — I've completed that for you.") : (data.message || "I couldn't complete that action."), proposal: { ...m.proposal, status: ok ? "confirmed" : "failed" } } : m)));
      if (ok) {
        if (data.redirectUrl) router.push(data.redirectUrl);
        else router.refresh();
      }
    } catch {
      setMessages((prev) => prev.map((m) => (m.proposal?.proposalId === proposalId ? { ...m, text: "I couldn't complete that action. Please try again.", proposal: { ...m.proposal, status: "failed" } } : m)));
    }
  };

  const rejectProposal = async (proposalId: string) => {
    try { await fetch(`/api/ai/command/actions/${proposalId}/reject`, { method: "POST" }); } catch { /* best-effort */ }
    setMessages((prev) => prev.map((m) => (m.proposal?.proposalId === proposalId ? { ...m, text: "Cancelled — nothing was changed.", proposal: { ...m.proposal, status: "rejected" } } : m)));
  };

  const handleEditMessage = (index: number) => {
    const targetMsg = messages[index];
    if (targetMsg.role !== "user") return;
    // Load the prompt back into the composer WITHOUT removing the existing
    // conversation — the earlier answer stays visible so nothing is lost. The
    // user can tweak the text and re-ask as a new turn.
    setInput(targetMsg.text);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleClear = async () => {
    const ok = await confirmDialog({
      title: "Clear this conversation?",
      description: "This removes the messages from the panel. Saved chats stay in History.",
    });
    if (!ok) return;
    newChat();
    setInput("");
    setShowHistory(false);
  };

  // "+ New Chat" — start fresh. Only asks to confirm if there's an unsaved thread.
  const handleNewChat = async () => {
    if (messages.length > 0) {
      const ok = await confirmDialog({
        title: "Start a new chat?",
        description: "Your current messages stay saved in History — this just clears the panel.",
      });
      if (!ok) return;
    }
    newChat();
    setInput("");
    setShowHistory(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const openHistory = async () => {
    setShowHistory(true);
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/admin/chat-history");
      const data = await res.json();
      setHistoryChats(Array.isArray(data.chats) ? data.chats : []);
    } catch {
      setHistoryChats([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadMemorySettings = async () => {
    try {
      const res = await fetch("/api/ai/memory", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.success) { setMemoryEnabled(data.enabled !== false); setMemoryRecords(Array.isArray(data.data) ? data.data : []); }
    } catch { toast.error("Could not load saved AI memories."); }
  };
  const toggleMemory = async () => {
    setMemoryBusy(true);
    try {
      const res = await fetch("/api/ai/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !memoryEnabled }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update memory settings");
      setMemoryEnabled(data.enabled);
      toast.success(data.enabled ? "Cross-chat memory enabled" : "Cross-chat memory paused. Saved facts remain available for you to manage.");
    } catch (error: any) { toast.error(error.message || "Could not update memory settings"); }
    finally { setMemoryBusy(false); }
  };
  const saveMemory = async () => {
    if (!memoryLabel.trim() || !memoryValue.trim()) return;
    setMemoryBusy(true);
    try {
      const res = await fetch("/api/ai/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "user", key: memoryLabel, value: memoryValue, category: "other", sourceConversationId: conversationId || undefined }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save memory");
      setMemoryLabel(""); setMemoryValue(""); await loadMemorySettings(); toast.success("Saved to your AI memory.");
    } catch (error: any) { toast.error(error.message || "Could not save memory"); }
    finally { setMemoryBusy(false); }
  };
  const updateMemory = async (id: string) => {
    setMemoryBusy(true);
    try {
      const res = await fetch("/api/ai/memory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, value: editingMemoryValue }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update memory");
      setEditingMemoryId(null); await loadMemorySettings(); toast.success("Memory updated.");
    } catch (error: any) { toast.error(error.message || "Could not update memory"); }
    finally { setMemoryBusy(false); }
  };
  const deleteMemory = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/memory?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete memory");
      setMemoryRecords((items) => items.filter((item) => String(item._id) !== id));
      toast.success("Saved memory fact deleted. (Original conversation history is retained separately.)");
    } catch (error: any) { toast.error(error.message || "Could not delete memory"); }
  };

  const loadHistoryChat = (chat: any) => {
    const loaded: Message[] = (chat.messages || []).map((m: any) => ({ role: m.role, text: m.content }));
    setMessages(loaded);
    setConversationId(chat.conversationId || null);
    setShowHistory(false);
  };

  // Prefetch the full-screen assistant + the AI-fill create forms so opening
  // them is instant (no blank-load glitch when the AI navigates there).
  useEffect(() => {
    try {
      router.prefetch("/admin/ai-assistant");
      router.prefetch("/crm/leads");
      router.prefetch("/sales/customers/new");
    } catch { /* noop */ }
  }, [router]);

  useEffect(() => {
    if (!showHistory) endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showHistory]);

  // Markdown customized components object
  const markdownComponents = {
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || "");
      const codeVal = String(children).replace(/\n$/, "");
      if (!inline && match) {
        return (
          <div className={cn(
            "relative group/code my-3 border rounded font-mono text-xs overflow-hidden",
            isDark ? "border-neutral-800 bg-[#161618]" : "border-neutral-200 bg-[#f6f8fa]"
          )}>
            <div className={cn(
              "flex items-center justify-between px-3 py-1.5 border-b uppercase tracking-wider text-[10px] select-none font-mono",
              isDark ? "border-neutral-800 bg-[#0d0d0e] text-neutral-500 hover:text-neutral-300" : "border-neutral-200 bg-[#f0f3f6] text-neutral-500 hover:text-neutral-700"
            )}>
              <span>{match[1]}</span>
              <button
                onClick={() => navigator.clipboard.writeText(codeVal)}
                className="text-[10px] transition-colors uppercase tracking-wider cursor-pointer font-mono"
              >
                Copy
              </button>
            </div>
            <pre className={cn(
              "p-3 overflow-x-auto leading-relaxed font-mono",
              isDark ? "text-neutral-200" : "text-neutral-800"
            )}>
              <code {...props}>{children}</code>
            </pre>
          </div>
        );
      }
      return (
        <code
          className={cn(
            "font-mono text-[11px] px-1 py-0.5 rounded border",
            isDark ? "bg-neutral-900 text-neutral-300 border-neutral-800/60" : "bg-neutral-100 text-neutral-800 border-neutral-200"
          )}
          {...props}
        >
          {children}
        </code>
      );
    },
    table({ children }: any) {
      return (
        <div className={cn("overflow-x-auto my-3 border rounded", isDark ? "border-neutral-800" : "border-neutral-200")}>
          <Table className="w-full text-left text-xs font-mono border-collapse">
            {children}
          </Table>
        </div>
      );
    },
    thead({ children }: any) {
      return <TableHeader className={cn("border-b", isDark ? "bg-[#0f0f11] border-neutral-800" : "bg-neutral-50 border-neutral-200")}>{children}</TableHeader>;
    },
    tbody({ children }: any) {
      return <TableBody className={cn("divide-y", isDark ? "divide-neutral-800/60" : "divide-neutral-150")}>{children}</TableBody>;
    },
    tr({ children }: any) {
      return <TableRow>{children}</TableRow>;
    },
    th({ children }: any) {
      return (
        <TableHead className={cn(
          "px-3 py-2 font-medium border-r last:border-r-0",
          isDark ? "text-neutral-400 border-neutral-800" : "text-neutral-600 border-neutral-200"
        )}>
          {children}
        </TableHead>
      );
    },
    td({ children }: any) {
      return (
        <TableCell className={cn(
          "px-3 py-2 border-r last:border-r-0",
          isDark ? "text-neutral-300 border-neutral-800" : "text-neutral-700 border-neutral-200"
        )}>
          {children}
        </TableCell>
      );
    },
    h1({ children }: any) {
      return <h1 className={cn("text-[15px] font-bold mt-4 mb-2 first:mt-0", isDark ? "text-white" : "text-neutral-950")}>{children}</h1>;
    },
    h2({ children }: any) {
      return <h2 className={cn("text-[14px] font-semibold mt-3 mb-1.5 first:mt-0", isDark ? "text-neutral-200" : "text-neutral-800")}>{children}</h2>;
    },
    h3({ children }: any) {
      return <h3 className={cn("text-[14px] font-medium mt-3 mb-1", isDark ? "text-neutral-300" : "text-neutral-700")}>{children}</h3>;
    },
    p({ children }: any) {
      return <p className={cn("mb-2.5 last:mb-0 leading-7 text-[14px] font-sans", isDark ? "text-neutral-300" : "text-neutral-650")}>{children}</p>;
    },
    ul({ children }: any) {
      return <ul className={cn("list-disc pl-4 space-y-1 my-2.5 text-[14px] font-sans", isDark ? "text-neutral-300" : "text-neutral-650")}>{children}</ul>;
    },
    ol({ children }: any) {
      return <ol className={cn("list-decimal pl-4 space-y-1 my-2.5 text-[14px] font-sans", isDark ? "text-neutral-300" : "text-neutral-650")}>{children}</ol>;
    },
    li({ children }: any) {
      return <li className="leading-relaxed">{children}</li>;
    },
    blockquote({ children }: any) {
      return (
        <div className={cn(
          "border-l-2 px-3 py-2 my-2.5 rounded-r text-[14px] font-mono",
          isDark ? "border-indigo-500 bg-indigo-950/10 text-neutral-300" : "border-indigo-400 bg-indigo-50/30 text-neutral-700"
        )}>
          {children}
        </div>
      );
    }
  };

  return (
    <aside
      className={cn(
        "flex flex-col flex-shrink-0 animate-in slide-in-from-right duration-200 transition-all ease-in-out",
        isDark ? "shadow-2xl" : "shadow-none",
        "absolute inset-y-0 right-0 z-50 h-full w-full max-w-[min(100vw,460px)] border-l xl:relative xl:w-[450px] xl:max-w-none",
        isDark ? "bg-neutral-950 border-neutral-800" : "bg-white border-neutral-200"
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-y-1 px-2 py-2 font-mono border-b backdrop-blur-xl sm:px-4",
        isDark ? "border-neutral-900 bg-neutral-950/80 text-neutral-400" : "border-neutral-200 bg-white/80 text-neutral-600"
      )}>
        <div className="flex items-center gap-2">
          <h2 className={cn("font-semibold text-xs tracking-wider uppercase", isDark ? "text-neutral-400" : "text-neutral-600")}>Aupulens AI</h2>
        </div>
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <button
            onClick={handleNewChat}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 text-[10px] border rounded font-mono uppercase tracking-wider transition-all cursor-pointer mr-1",
              isDark ? "text-neutral-400 border-neutral-800 hover:text-white hover:border-neutral-700 hover:bg-neutral-900" : "text-neutral-600 border-neutral-200 hover:text-neutral-900 hover:border-neutral-300 hover:bg-neutral-100"
            )}
            title="Start a new chat"
          >
            <Plus className="w-3 h-3" /> New
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className={cn(
                "px-2 py-1 text-[10px] border rounded font-mono uppercase tracking-wider transition-all cursor-pointer mr-1",
                isDark ? "text-neutral-500 border-transparent hover:text-neutral-300 hover:border-neutral-850" : "text-neutral-500 border-transparent hover:text-neutral-800 hover:border-neutral-200"
              )}
              title="Clear chat history"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => {
              const opening = !showMemoryPanel;
              setShowMemoryPanel(opening);
              setShowHistory(false);
              if (opening) void loadMemorySettings();
            }}
            className={cn(
              "p-1.5 rounded transition-colors cursor-pointer",
              showMemoryPanel
                ? (isDark ? "text-white bg-neutral-900" : "text-neutral-800 bg-neutral-100")
                : (isDark ? "text-neutral-500 hover:text-white hover:bg-neutral-900" : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100")
            )}
            title="Manage AI memory"
            aria-label="Manage AI memory"
          >
            <Brain className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => (showHistory ? setShowHistory(false) : openHistory())}
            className={cn(
              "p-1.5 rounded transition-colors cursor-pointer",
              showHistory
                ? (isDark ? "text-white bg-neutral-900" : "text-neutral-800 bg-neutral-100")
                : (isDark ? "text-neutral-500 hover:text-white hover:bg-neutral-900" : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100")
            )}
            title="Chat history"
          >
            <Clock className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              onClose();
              const activeConversation = useAiChatStore.getState().conversationId;
              router.push(activeConversation
                ? `/admin/ai-assistant?conversationId=${encodeURIComponent(activeConversation)}`
                : "/admin/ai-assistant");
            }}
            className={cn(
              "p-1.5 rounded transition-colors cursor-pointer",
              isDark ? "text-neutral-500 hover:text-white hover:bg-neutral-900" : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100"
            )}
            title="Open Full Screen Aupulens AI"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className={cn(
              "p-1.5 rounded transition-colors cursor-pointer",
              isDark ? "text-neutral-500 hover:text-white hover:bg-neutral-900" : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100"
            )}
            title="Close panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Conversation or Workspace Area */}
      <div className={cn(
        "flex-1 overflow-y-auto youtube-scrollbar flex flex-col justify-start",
        isDark ? "bg-gradient-to-b from-neutral-950 to-neutral-950/40" : "bg-neutral-50/30"
      )}>
        {showHistory ? (
          <div className="flex-grow p-3 space-y-1 animate-in fade-in duration-150">
            <div className={cn("px-1 py-2 text-[10px] font-mono uppercase tracking-wider", isDark ? "text-neutral-500" : "text-neutral-500")}>Recent conversations</div>
            {loadingHistory ? (
              <div className="flex items-center gap-2 px-2 py-4 text-xs text-neutral-500 font-mono">
                <div className="h-3 w-3 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin" /> Loading…
              </div>
            ) : historyChats.length === 0 ? (
              <p className="px-2 py-4 text-xs text-neutral-500 font-mono">No saved conversations yet.</p>
            ) : (
              historyChats.map((chat) => (
                <button
                  key={chat._id}
                  onClick={() => loadHistoryChat(chat)}
                  className={cn(
                    "w-full text-left flex items-start gap-2 px-2.5 py-2 rounded border transition-colors cursor-pointer",
                    isDark ? "border-neutral-900 hover:bg-neutral-900/40 hover:border-neutral-800" : "border-neutral-150 hover:bg-neutral-50 hover:border-neutral-200"
                  )}
                >
                  <MessageSquare className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", isDark ? "text-neutral-600" : "text-neutral-400")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[13px]", isDark ? "text-neutral-300" : "text-neutral-700")}>{chat.title || "Untitled chat"}</span>
                    <span className={cn("block text-[10px] font-mono", isDark ? "text-neutral-600" : "text-neutral-400")}>{new Date(chat.updatedAt || chat.createdAt).toLocaleString()}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        ) : showMemoryPanel ? (
          <div className="flex-grow p-4 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className={cn("text-sm font-semibold", isDark ? "text-neutral-100" : "text-neutral-800")}>AI memory</h3>
                <p className="text-[11px] text-neutral-500 mt-1">Relevant details from your saved chats and facts you choose to keep.</p>
              </div>
              <button onClick={() => setShowMemoryPanel(false)} className="p-1.5 rounded hover:bg-neutral-800/10" aria-label="Back to chat"><ArrowLeft className="w-4 h-4" /></button>
            </div>
            <div className={cn("rounded border p-3", isDark ? "border-neutral-800 bg-neutral-900/50" : "border-neutral-200 bg-white")}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium">Cross-chat recall</div>
                  <div className="text-[10px] text-neutral-500 mt-1">{memoryEnabled ? "Relevant earlier chats and saved facts may be used." : "Paused. Active-chat context still works; saved facts are kept until you delete them."}</div>
                </div>
                <button disabled={memoryBusy} onClick={() => void toggleMemory()} className={cn("px-2.5 py-1 rounded text-xs border", memoryEnabled ? "border-emerald-700 text-emerald-500" : "border-neutral-600 text-neutral-500")}>
                  {memoryEnabled ? "On" : "Off"}
                </button>
              </div>
            </div>
            <div className={cn("rounded border p-3 space-y-2", isDark ? "border-neutral-800" : "border-neutral-200")}>
              <div className="text-xs font-medium">Remember a fact</div>
              <input value={memoryLabel} onChange={(e) => setMemoryLabel(e.target.value)} maxLength={100} placeholder="Label, e.g. Migration project" className={cn("w-full rounded border px-2.5 py-2 text-xs outline-none", isDark ? "bg-neutral-950 border-neutral-800" : "bg-white border-neutral-200")} />
              <textarea value={memoryValue} onChange={(e) => setMemoryValue(e.target.value)} maxLength={2000} rows={3} placeholder="A non-sensitive fact you want Aupulens AI to remember" className={cn("w-full resize-y rounded border px-2.5 py-2 text-xs outline-none", isDark ? "bg-neutral-950 border-neutral-800" : "bg-white border-neutral-200")} />
              <button disabled={memoryBusy || !memoryLabel.trim() || !memoryValue.trim()} onClick={() => void saveMemory()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 text-white text-xs disabled:opacity-50"><Check className="w-3 h-3" /> Save memory</button>
              <p className="text-[10px] text-neutral-500">Do not save passwords, API keys, credentials, or private financial details.</p>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500">Saved facts ({memoryRecords.length})</div>
              <p className="text-[10px] text-neutral-500">Deleting a saved fact removes it from explicit recall. Original conversation transcripts remain separately in chat history.</p>
              {memoryRecords.length === 0 ? <p className="text-xs text-neutral-500">No explicitly saved facts yet. Earlier conversation recall can still use relevant chat summaries.</p> : memoryRecords.map((item) => (
                <div key={String(item._id)} className={cn("rounded border p-3", isDark ? "border-neutral-800 bg-neutral-900/30" : "border-neutral-200 bg-white")}>
                  <div className="flex justify-between gap-2 items-start">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{item.key}</div>
                      {editingMemoryId === String(item._id) ? <textarea value={editingMemoryValue} onChange={(e) => setEditingMemoryValue(e.target.value)} maxLength={2000} rows={3} className={cn("mt-2 w-full rounded border px-2 py-1.5 text-xs", isDark ? "bg-neutral-950 border-neutral-800" : "bg-white border-neutral-200")} /> : <p className="mt-1 text-xs text-neutral-500 whitespace-pre-wrap">{item.value}</p>}
                      <div className="mt-2 text-[10px] text-neutral-600">{item.sourceConversationId ? `Source chat ${item.sourceConversationId.slice(0, 8)} · ` : "Manually saved · "}{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ""}</div>
                    </div>
                    {editingMemoryId === String(item._id) ? <button onClick={() => void updateMemory(String(item._id))} disabled={memoryBusy} className="p-1.5 text-emerald-500" aria-label="Save correction"><Check className="w-4 h-4" /></button> : <button onClick={() => { setEditingMemoryId(String(item._id)); setEditingMemoryValue(item.value); }} className="text-[10px] text-blue-500">Edit</button>}
                    <button onClick={() => void deleteMemory(String(item._id))} className="p-1.5 text-red-500" aria-label="Delete memory"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">

            {/* Compact suggested chips */}
            {/* <div className="flex flex-wrap gap-2 justify-center max-w-[340px]">
              {[
                "Analyze sales pipeline",
                "Summarize customer activity",
                "Create follow-up tasks",
              ].map((promptText) => (
                <button
                  key={promptText}
                  onClick={() => handleSuggestedPrompt(promptText)}
                  className={cn(
                    "px-3 py-1.5 rounded-full border text-[11px] font-mono transition-all cursor-pointer whitespace-nowrap shadow-sm",
                    isDark ? "border-neutral-800 bg-neutral-900/40 text-neutral-400 hover:bg-neutral-900 hover:border-neutral-700 hover:text-neutral-200" : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:border-neutral-350 hover:text-neutral-800"
                  )}
                >
                  {promptText}
                </button>
              ))}
            </div> */}
          </div>
        ) : (
          <div className="flex-grow p-4 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "group relative flex gap-3 py-4 px-3 transition-colors duration-150 rounded border",
                  isDark
                    ? "border-neutral-900/50 hover:bg-neutral-900/20 hover:border-neutral-900"
                    : "border-neutral-100 hover:bg-neutral-50/50 hover:border-neutral-150"
                )}
              >
                {/* Minimal Avatar identifier */}
                <div className="flex-shrink-0 mt-0.5">
                  {msg.role === "user" ? (
                    <div className={cn(
                      "w-5.5 h-5.5 rounded border flex items-center justify-center select-none text-[9px] font-mono",
                      isDark ? "border-neutral-800 bg-neutral-900 text-neutral-400" : "border-neutral-200 bg-neutral-100 text-neutral-600"
                    )}>
                      U
                    </div>
                  ) : (
                    <div className={cn(
                      "w-5.5 h-5.5 rounded border flex items-center justify-center select-none shadow-sm",
                      isDark ? "border-neutral-850 bg-neutral-900/40 text-purple-400 shadow-purple-500/5" : "border-neutral-200 bg-purple-50 text-purple-650"
                    )}>
                      <Sparkles className={cn("w-3 h-3", msg.isLoading && "animate-pulse text-purple-400")} />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Attachments the user sent — visible while thinking and after */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mb-2 flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
                      {msg.attachments.map((att, ai) => (
                        // Only render an <img> when we still have the data URL. After the
                        // chat is persisted, dataUrl is stripped — so fall back to a chip
                        // instead of emitting <img src=""> (which warns + shows broken).
                        att.type.startsWith("image/") && att.dataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={ai} src={att.dataUrl} alt={att.name} title={att.name} className="h-14 w-14 rounded border border-neutral-700 object-cover shrink-0" />
                        ) : (
                          <span key={ai} title={att.name} className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] shrink-0 max-w-[160px]", isDark ? "bg-neutral-850 border-neutral-700 text-neutral-300" : "bg-neutral-100 border-neutral-200 text-neutral-700")}>
                            {att.type.startsWith("image/") ? <ImageIcon className="w-3 h-3 shrink-0 text-indigo-400" /> : <FileText className="w-3 h-3 shrink-0 text-indigo-400" />}
                            <span className="truncate">{att.name}</span>
                          </span>
                        )
                      ))}
                    </div>
                  )}
                  {msg.isLoading ? (
                    <div className="flex items-center gap-2.5 py-1 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-purple-500 animate-bounce [animation-delay:-0.3s]" />
                        <span className="h-2 w-2 rounded-full bg-purple-500/80 animate-bounce [animation-delay:-0.15s]" />
                        <span className="h-2 w-2 rounded-full bg-purple-500/60 animate-bounce" />
                      </div>
                      <span className={cn(
                        "font-mono text-xs tracking-wide animate-pulse",
                        isDark ? "text-neutral-400" : "text-neutral-500"
                      )}>
                        Thinking...
                      </span>
                    </div>
                  ) : (
                    <div className={cn("prose max-w-none text-xs font-sans", isDark ? "prose-invert text-neutral-300" : "text-neutral-700")}>
                      {msg.role === "user" ? (
                        <p className={cn("whitespace-pre-wrap leading-7 text-[14px]", isDark ? "text-neutral-300" : "text-neutral-650")}>{msg.text}</p>
                      ) : (
                        <AiMarkdown
                          content={msg.text}
                          structured={msg.structured}
                          onAction={(v) => handleSend(v)}
                        />
                      )}
                    </div>
                  )}

                  {/* Guided-flow one-tap replies — only on the latest message, so a stale button can't answer a question that has moved on */}
                  {msg.role === "assistant" && i === messages.length - 1 && msg.quickReplies && msg.quickReplies.length > 0 && (
                    <FlowQuickReplies
                      replies={msg.quickReplies}
                      dark={isDark}
                      disabled={isLoading}
                      onPick={(v) => handleSend(v)}
                    />
                  )}

                  {/* AI action confirm gate — nothing runs until the user clicks */}
                  {msg.proposal && msg.proposal.status === "pending" && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => confirmProposal(msg.proposal!.proposalId)}
                        className={cn(
                          "px-3 py-1.5 rounded text-[11px] font-medium cursor-pointer transition-colors",
                          msg.proposal.destructive ? "bg-red-600 hover:bg-red-700 text-white" : "bg-purple-600 hover:bg-purple-500 text-white",
                        )}
                      >
                        {msg.proposal.destructive ? "Delete" : "Confirm"}
                      </button>
                      <button
                        onClick={() => rejectProposal(msg.proposal!.proposalId)}
                        className={cn(
                          "px-3 py-1.5 rounded text-[11px] font-medium border cursor-pointer transition-colors",
                          isDark ? "border-neutral-700 text-neutral-300 hover:bg-neutral-900" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100",
                        )}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Hover actions — Copy on every message, Edit on your own prompts. */}
                {!msg.isLoading && (
                  <div className={cn(
                    "absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1 border px-1 py-0.5 rounded shadow-lg backdrop-blur-sm",
                    isDark ? "bg-neutral-950/90 border-neutral-800 shadow-black/40" : "bg-white border-neutral-200 shadow-neutral-200/50"
                  )}>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(msg.text);
                        toast.success("Copied to clipboard");
                      }}
                      className={cn(
                        "p-1 text-[11px] tracking-wide font-sans cursor-pointer",
                        isDark ? "text-neutral-500 hover:text-white" : "text-neutral-400 hover:text-neutral-800"
                      )}
                      title="Copy message"
                    >
                      Copy
                    </button>
                    {msg.role === "user" && (
                      <button
                        onClick={() => handleEditMessage(i)}
                        className={cn(
                          "p-1 text-[11px] tracking-wide font-sans cursor-pointer",
                          isDark ? "text-neutral-500 hover:text-white" : "text-neutral-400 hover:text-neutral-800"
                        )}
                        title="Edit message"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={endOfMessagesRef} />
          </div>
        )}
      </div>

      {/* Composer Input Area */}
      <div className={cn("p-4 border-t shrink-0 w-full", isDark ? "border-neutral-900 bg-neutral-950" : "border-neutral-200 bg-white")}>
        <div className={cn(
          "relative border rounded p-2.5 transition-all shadow-sm",
          isDark
            ? "border-neutral-800/80 bg-neutral-900/50 hover:border-neutral-700/80 focus-within:border-neutral-700 focus-within:ring-1 focus-within:ring-neutral-700/30"
            : "border-neutral-200 bg-neutral-50 hover:border-neutral-300 focus-within:border-neutral-400 focus-within:ring-1 focus-within:ring-neutral-200"
        )}>
          {/* Attached files — horizontal, scrollable, no wrapping */}
          {attachments.length > 0 && (
            <div className="mb-2 flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
              {attachments.map((att, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded text-[11px] border shrink-0 max-w-[180px]",
                    isDark ? "bg-neutral-850 border-neutral-700 text-neutral-300" : "bg-neutral-100 border-neutral-200 text-neutral-700"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setPreviewIndex(i)}
                    className="flex items-center gap-2 min-w-0 text-left cursor-pointer hover:opacity-80"
                    title="Click to preview"
                  >
                    {att.type.startsWith("image/") && att.dataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={att.dataUrl} alt={att.name} className="w-6 h-6 rounded object-cover shrink-0" />
                    ) : att.type.startsWith("image/") ? (
                      <ImageIcon className="w-3 h-3 shrink-0 text-indigo-400" />
                    ) : (
                      <FileText className="w-3 h-3 shrink-0 text-indigo-400" />
                    )}
                    <span className="truncate">{att.name}</span>
                  </button>
                  <button type="button" onClick={() => removeAttachment(i)} className="text-neutral-500 hover:text-red-400 shrink-0" title="Remove">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,image/png,image/jpeg,image/webp,image/gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); if (e.target) e.target.value = ""; }}
          />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if ((input.trim() || attachments.length) && !isLoading) {
                  handleSend(input.trim());
                  setInput("");
                }
                return;
              }
              // Recall the last prompt you sent — only when the box is empty,
              // so this never clobbers text you're already typing/editing.
              if (e.key === "ArrowUp" && input === "") {
                const lastUserMsg = [...messages].reverse().find((m) => m.role === "user" && m.text);
                if (lastUserMsg) {
                  e.preventDefault();
                  setInput(lastUserMsg.text);
                  // Put the caret at the end instead of leaving it at the start.
                  setTimeout(() => {
                    const el = textareaRef.current;
                    if (el) el.setSelectionRange(el.value.length, el.value.length);
                  }, 0);
                }
              }
            }}
            // Intentionally NOT disabled while loading — the user can keep typing
            // their next prompt; only sending is blocked until the reply is done.
            placeholder="Ask Anything"
            rows={1}
            className={cn(
              "w-full bg-transparent border-none text-[14px] focus:outline-none focus:ring-0 resize-none font-sans min-h-[44px] max-h-[200px]",
              isDark ? "text-neutral-200 placeholder:text-neutral-500" : "text-neutral-800 placeholder:text-neutral-400"
            )}
          />
          <VoiceActivity listening={listening} transcribing={transcribing} levels={audioLevels} className="mt-1" />
          <div className={cn("flex flex-wrap items-center justify-between gap-x-2 mt-2 pt-2 border-t", isDark ? "border-neutral-900/50" : "border-neutral-200/50")}>
            <div className="flex flex-1 items-center gap-2 min-w-[72px]">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach a PDF, Word doc, or image"
                className={cn(
                  "h-6 w-6 rounded flex items-center justify-center transition-colors cursor-pointer shrink-0",
                  attachments.length ? "bg-indigo-500/20 text-indigo-400" : isDark ? "bg-neutral-850 hover:bg-neutral-800 text-neutral-400" : "bg-neutral-200 hover:bg-neutral-300 text-neutral-600"
                )}
              >
                <Paperclip className="w-3 h-3" />
              </button>
              {micSupported && (
                <button
                  type="button"
                  onClick={toggleMic} aria-pressed={listening}
                  disabled={transcribing}
                  title={listening ? "Stop and transcribe" : transcribing ? "Transcribing…" : "Speak your message"}
                  className={cn(
                    "h-6 w-6 rounded flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:cursor-wait",
                    listening
                      ? "bg-red-500/20 text-red-400 animate-pulse"
                      : transcribing
                      ? "bg-indigo-500/20 text-indigo-400"
                      : isDark ? "bg-neutral-850 hover:bg-neutral-800 text-neutral-400" : "bg-neutral-200 hover:bg-neutral-300 text-neutral-600"
                  )}
                >
                  <Mic className="w-3 h-3" />
                </button>
              )}
              {(listening || transcribing) && <span className="text-[9px] text-neutral-500 font-mono truncate">
                {listening ? "Click the microphone to stop" : "Transcribing…"}
              </span>}
            </div>
            <button
              onClick={() => {
                if ((input.trim() || attachments.length) && !isLoading) {
                  handleSend(input.trim());
                  setInput("");
                }
              }}
              disabled={(!input.trim() && attachments.length === 0) || isLoading}
              className={cn(
                "h-6 px-2.5 rounded disabled:opacity-40 text-[9px] font-mono uppercase tracking-wider transition-colors flex items-center gap-1 cursor-pointer",
                isDark ? "bg-neutral-850 hover:bg-neutral-800 text-neutral-300" : "bg-neutral-200 hover:bg-neutral-300 text-neutral-700"
              )}
            >
              {isLoading ? (
                <>
                  <div className="h-2 w-2 border border-neutral-400 border-t-transparent rounded-full animate-spin" />
                  <span>Thinking</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </>
              )}
            </button>
          </div>
          <div className={cn("mt-1 border-t pt-1", isDark ? "border-neutral-900/50" : "border-neutral-200/50")}>
            <AiUsageIndicator />
          </div>
        </div>
      </div>

      {previewIndex !== null && attachments[previewIndex] && (
        <AttachmentPreview attachment={attachments[previewIndex]} onClose={() => setPreviewIndex(null)} />
      )}
    </aside>
  );
}
