"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Send, Sparkles, Maximize2, Mic, Paperclip, FileText, Clock, MessageSquare, Plus, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiChatStore, type AiChatMessage } from "@/store/aiChatStore";
import { confirmDialog } from "@/components/providers/ConfirmRoot";
import { AttachmentPreview } from "@/components/ai/AttachmentPreview";
import { stashPrefill } from "@/lib/ai/aiPrefill";
import { CREATE_VERB_RX, findCreateTarget } from "@/lib/ai/createTargets";
import { useSpeechToText } from "@/lib/hooks/useSpeechToText";
import { useAutoResizeTextarea } from "@/lib/hooks/useAutoResizeTextarea";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useThemeStore } from "@/store/themeStore";
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
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme !== "light";

  // Chat thread + New Chat live in the module-level store so they persist across
  // client-side navigation (e.g. when the AI opens a create form for you).
  const messages = useAiChatStore((s) => s.messages);
  const setMessages = useAiChatStore((s) => s.setMessages);
  const conversationId = useAiChatStore((s) => s.conversationId);
  const setConversationId = useAiChatStore((s) => s.setConversationId);
  const newChat = useAiChatStore((s) => s.newChat);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyChats, setHistoryChats] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useAutoResizeTextarea(textareaRef, input);

  // Voice input (Azure speech-to-text) — records via the mic, transcribes on the
  // server, and appends the recognised text to the prompt for the user to review
  // and send. Works in Electron + all browsers (unlike the old browser API).
  const { supported: micSupported, listening, transcribing, interim, toggle: toggleMic } = useSpeechToText({
    onFinalText: (t) => setInput((prev) => (prev ? `${prev} ${t}` : t)),
    onError: (m) => toast.error(m),
  });

  // File attachments (PDF / DOCX / images) — multiple supported. Each is read as
  // a data URL and sent with the prompt.
  type Attachment = { name: string; type: string; dataUrl: string };
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

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
    base.filter((m) => !m.isLoading && m.text).slice(-10).map((m) => ({ role: m.role, content: m.text }));

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
    setIsLoading(true);

    // Capture attachments up front so they render on the user's message (and
    // stay visible while the AI is thinking) before we clear the composer. Files
    // freshly attached to THIS message are shown on the bubble; if there are
    // none, we still SEND the most recent prior files so context carries over.
    const freshAttachments = attachments;
    const sendAttachments = freshAttachments.length ? freshAttachments : carriedAttachments();
    const baseHistory = customMessagesHistory || messages;
    const nextMessages = [...baseHistory];

    if (customMessagesHistory === undefined) {
      nextMessages.push({ role: "user", text: queryText, attachments: freshAttachments.length ? freshAttachments : undefined });
    }
    nextMessages.push({ role: "assistant", text: "", isLoading: true });
    setMessages(nextMessages);

    try {
      // Stream the answer token-by-token (ChatGPT-style). On a gate/error the
      // server replies with JSON instead — detected via content-type.
      setAttachments([]); // consumed
      const response = await fetch("/api/admin/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: queryText, stream: true, attachments: sendAttachments, history: buildHistory(baseHistory), conversationId }),
      });
      const returnedConvId = response.headers.get("x-conversation-id");
      if (returnedConvId && returnedConvId !== conversationId) setConversationId(returnedConvId);

      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || contentType.includes("application/json")) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to get response");
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

      await fetch("/api/admin/chat-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: queryText.slice(0, 50),
          messages: [
            { role: "user", content: queryText, timestamp: new Date() },
            { role: "assistant", content: finalText, timestamp: new Date() },
          ],
        }),
      }).catch(() => {});

    } catch (error) {
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
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedPrompt = (text: string) => {
    const userText = text;
    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    sendQuery(userText, [...messages, { role: "user", text: userText }]);
  };

  // Verb-led messages ("create a customer…", "add a lead and a task…") and
  // navigation phrases ("go to leads", "open invoices") are routed to the
  // Command Center. Everything else (and anything with an attachment) is a
  // normal Q&A/analysis.
  const ACTION_RX = /\b(create|add|make|new|generate|draft|delete|remove|update|change|set|book|record|raise|issue)\b/i;
  const NAV_RX = /\b(go to|goto|open|navigate|take me|show me|bring up|jump to)\b/i;

  // Run the prefill flow for a chosen target: extract fields, then either ask
  // (missing dependency) or stash + navigate to the pre-filled form. Shared by
  // the normal path and the "which module?" follow-up so both behave identically.
  const executePrefill = async (
    targetDef: { target: string; route: string; label: string },
    message: string,
    attsToSend: Attachment[],
    attsForMsg: Attachment[] | undefined,
    base: Message[],
  ) => {
    setIsLoading(true);
    setAttachments([]);
    setMessages([...base, { role: "user", text: message, attachments: attsForMsg }, { role: "assistant", text: "", isLoading: true }]);
    try {
      const history = base.filter((m) => !m.isLoading && m.text).slice(-8).map((m) => ({ role: m.role, content: m.text }));
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
        setMessages([...base, { role: "user", text: message, attachments: attsForMsg }, { role: "assistant", text: `I couldn't pull enough details to fill the ${targetDef.label} form. Tell me the details in your message (or attach a document/image) and I'll prepare it for you.` }]);
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
          setMessages([...base, { role: "user", text: message, attachments: attsForMsg }, { role: "assistant", text: `I've got the ${targetDef.label} details ready, but there's **no ${dep.type} named "${dep.name}"** in the system yet.\n\nDo you want me to **open the ${targetDef.label} form anyway** (you can add the ${dep.type} inline with the "+"), or would you rather create the ${dep.type} first? Reply **"yes"** to open it now, or **"no"** to hold off.${sugg}` }]);
          setIsLoading(false);
          return;
        }
        stashPrefill({ target: data.target, route: data.route, data: data.data || {}, suggestions: data.suggestions || [] });
        setMessages([...base, { role: "user", text: message, attachments: attsForMsg }, { role: "assistant", text: `I've prepared the ${targetDef.label} form with the details I found — review them and click **Create** to save.${sugg}` }]);
        setIsLoading(false);
        router.push(targetDef.route);
        return;
      }
      setMessages([...base, { role: "user", text: message, attachments: attsForMsg }, { role: "assistant", text: data.message || `I couldn't prepare the ${targetDef.label} form. Please add a bit more detail and try again.` }]);
      setIsLoading(false);
    } catch {
      setMessages([...base, { role: "user", text: message, attachments: attsForMsg }, { role: "assistant", text: "Something went wrong preparing the form. Please try again." }]);
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

    // ── Resolve a pending "which module?" choice first ────────────────────────
    if (pendingChoice && q) {
      const opt = pendingChoice.options.find((o) => o.match.test(q));
      if (opt) {
        const pc = pendingChoice;
        setPendingChoice(null);
        await executePrefill(opt, pc.message, pc.attachments, pc.attachments.length ? pc.attachments : undefined, messages);
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
        setMessages([...messages, { role: "user", text: q }, { role: "assistant", text: `Opening the ${pc.label} form now — review the details and click **Create** to save.` }]);
        router.push(pc.route);
        return;
      }
      if (no) {
        setPendingCreate(null);
        setMessages([...messages, { role: "user", text: q }, { role: "assistant", text: `Okay — I won't open the ${pc.label} form. Tell me what you'd like to do instead.` }]);
        return;
      }
      // Neither yes nor no → treat as a fresh instruction; drop the pending one.
      setPendingCreate(null);
    }

    const freshAttachments = attachments;
    // Files shown on the user's bubble = only the ones freshly attached now; the
    // files SENT include the most recent prior upload so "create X from that
    // data" works turns after the paste (memory the user expects).
    const attForMsg = freshAttachments.length ? freshAttachments : undefined;
    const sentAttachments = freshAttachments.length ? freshAttachments : carriedAttachments();

    // ── AI-native create: pre-fill the real form and navigate there ──────────
    const targetDef = CREATE_VERB_RX.test(q) ? findCreateTarget(q) : undefined;
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
        setAttachments([]);
        setMessages([...messages, { role: "user", text: q, attachments: attForMsg }, { role: "assistant", text: `Sure — where should I create this product?\n\n- **Inventory** (the shared product catalogue), or\n- **Manufacturing** (a manufacturing item)\n\nReply **"inventory"** or **"manufacturing"** and I'll prepare the right form with your details.` }]);
        return;
      }
      await executePrefill(targetDef, q, sentAttachments, attForMsg, messages);
      return;
    }

    const isCommand = ACTION_RX.test(q) || NAV_RX.test(q);
    if (attachments.length > 0 || !isCommand) {
      sendQuery(q || "Please analyse the attached file(s).");
      return;
    }

    const base = messages;
    setIsLoading(true);
    setMessages([...base, { role: "user", text: q }, { role: "assistant", text: "", isLoading: true }]);
    try {
      const res = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: q, context: { pathname: typeof window !== "undefined" ? window.location.pathname : "" } }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.action === "confirm" && data.proposalId) {
        setMessages([...base, { role: "user", text: q }, { role: "assistant", text: data.summary || data.message || "Confirm to proceed.", proposal: { proposalId: data.proposalId, destructive: !!data.destructive, status: "pending" } }]);
        setIsLoading(false);
        return;
      }
      if (res.ok && data.action === "navigate" && data.url) {
        setMessages([...base, { role: "user", text: q }, { role: "assistant", text: data.message || "Opening the page…" }]);
        setIsLoading(false);
        router.push(data.url);
        return;
      }
      // Not an action after all → answer conversationally (sendQuery re-renders
      // the list from this base + user, replacing the transient bubble).
      setIsLoading(false);
      await sendQuery(q, [...base, { role: "user", text: q }]);
    } catch {
      setMessages([...base, { role: "user", text: q }, { role: "assistant", text: "Sorry, I couldn't process that. Please try again." }]);
      setIsLoading(false);
    }
  };

  const confirmProposal = async (proposalId: string) => {
    setMessages((prev) => prev.map((m) => (m.proposal?.proposalId === proposalId ? { ...m, text: "Working on it…", proposal: { ...m.proposal, status: m.proposal.status } } : m)));
    try {
      const res = await fetch(`/api/ai/command/actions/${proposalId}/confirm`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      const ok = res.ok && data.success;
      setMessages((prev) => prev.map((m) => (m.proposal?.proposalId === proposalId ? { ...m, text: ok ? "✓ Done — I've completed that for you." : (data.message || "I couldn't complete that action."), proposal: { ...m.proposal, status: ok ? "confirmed" : "failed" } } : m)));
      if (ok) router.refresh();
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

  const loadHistoryChat = (chat: any) => {
    const loaded: Message[] = (chat.messages || []).map((m: any) => ({ role: m.role, text: m.content }));
    setMessages(loaded);
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
        "absolute inset-y-0 right-0 z-50 w-full max-w-[460px] sm:relative sm:w-[450px] sm:max-w-none h-full border-l",
        isDark ? "bg-neutral-950 border-neutral-800" : "bg-white border-neutral-200"
      )}
    >
      {/* Header */}
      <div className={cn(
        "h-14 flex items-center justify-between px-4 border-b backdrop-blur-xl shrink-0 font-mono",
        isDark ? "border-neutral-900 bg-neutral-950/80 text-neutral-400" : "border-neutral-200 bg-white/80 text-neutral-600"
      )}>
        <div className="flex items-center gap-2">
          <h2 className={cn("font-semibold text-xs tracking-wider uppercase", isDark ? "text-neutral-400" : "text-neutral-600")}>Aupulens AI</h2>
        </div>
        <div className="flex items-center gap-1">
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
              router.push("/admin/ai-assistant");
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
        "flex-1 overflow-y-auto flex flex-col justify-start",
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
                      <Sparkles className="w-3 h-3" />
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
                    <div className="flex items-center gap-2 text-neutral-500 font-mono text-xs py-1">
                      <div className="h-3 w-3 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin" />
                      <span>Thinking...</span>
                    </div>
                  ) : (
                    <div className={cn("prose max-w-none text-xs font-sans", isDark ? "prose-invert text-neutral-300" : "text-neutral-700")}>
                      {msg.role === "user" ? (
                        <p className={cn("whitespace-pre-wrap leading-7 text-[14px]", isDark ? "text-neutral-300" : "text-neutral-650")}>{msg.text}</p>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {msg.text}
                        </ReactMarkdown>
                      )}
                    </div>
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

                {/* Hover actions — only Edit (on your own prompts). Copy/Retry
                    were removed as clutter. */}
                {!msg.isLoading && msg.role === "user" && (
                  <div className={cn(
                    "absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1 border px-1 py-0.5 rounded shadow-lg backdrop-blur-sm",
                    isDark ? "bg-neutral-950/90 border-neutral-800 shadow-black/40" : "bg-white border-neutral-200 shadow-neutral-200/50"
                  )}>
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
          <div className={cn("flex items-center justify-between mt-2 pt-2 border-t", isDark ? "border-neutral-900/50" : "border-neutral-200/50")}>
            <div className="flex items-center gap-2 min-w-0">
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
                  onClick={toggleMic}
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
              <span className="text-[9px] text-neutral-500 font-mono truncate">
                {listening ? (interim || "Listening…") : transcribing ? "Transcribing…" : "⏎ to send · ⇧⏎ for newline"}
              </span>
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
        </div>
      </div>

      {previewIndex !== null && attachments[previewIndex] && (
        <AttachmentPreview attachment={attachments[previewIndex]} onClose={() => setPreviewIndex(null)} />
      )}
    </aside>
  );
}
