"use client";
import { confirmDialog } from "@/components/providers/ConfirmRoot";


import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { adminSidebarConfig } from "@/config/sidebar/admin";
import {
  Send,
  Trash2,
  Archive,
  Plus,
  MessageSquare,
  Mic,
  MoreVertical,
  Sparkles,
  TrendingUp,
  BarChart3,
  Package,
  CheckCircle2,
  Bot,
  User,
  Paperclip,
  FileText,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ShimmerSkeleton } from "@/components/ui/loading-skeletons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentPreview } from "@/components/ai/AttachmentPreview";
import { toast } from "sonner";
import { useSpeechToText } from "@/lib/hooks/useSpeechToText";
import { tryAiCreateFlow } from "@/lib/ai/createFlow";
import { useAutoResizeTextarea } from "@/lib/hooks/useAutoResizeTextarea";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  attachments?: { name: string; type: string; dataUrl: string }[];
}

interface ChatHistoryItem {
  _id: string;
  title: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

const SUGGESTED_QUERIES = [
  {
    label: "Analyze sales last month",
    icon: BarChart3,
    query: "Analyze sales performance for last month",
  },
  {
    label: "Predict revenue",
    icon: TrendingUp,
    query: "Predict revenue for next month based on trends",
  },
  {
    label: "Price increase scenario",
    icon: Sparkles,
    query: "What if we increase price by 10%? Model the impact on profit.",
  },
  {
    label: "Low stock items",
    icon: Package,
    query: "Show me items with low stock levels",
  },
];

export default function AIAssistant() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { supported: micSupported, listening, transcribing, toggle: toggleMic } = useSpeechToText({
    onFinalText: (t) => setInput((prev) => (prev ? `${prev} ${t}` : t)),
    onError: (m) => toast.error(m),
  });
  const [showHistory, setShowHistory] = useState(true);
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [archivedChats, setArchivedChats] = useState<ChatHistoryItem[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useAutoResizeTextarea(textareaRef, input);

  // File attachments (PDF / DOCX / images) — multiple supported. Each is read as
  // a data URL and sent with the prompt so the assistant can read and answer.
  type Attachment = { name: string; type: string; dataUrl: string };
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB each
  const MAX_ATTACHMENTS = 8;

  const addFiles = (files: FileList | File[] | null | undefined) => {
    const list = files ? Array.from(files) : [];
    for (const file of list) {
      if (!file) continue;
      if (file.size > MAX_FILE_BYTES) { toast.error(`"${file.name || "A file"}" is too large (max 8 MB).`); continue; }
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

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/admin");
    } else if (status === "authenticated" && session?.user?.role !== "admin") {
      router.push("/auth/admin");
    }
  }, [status, session, router]);

  // Fetch chat history
  useEffect(() => {
    if (session?.user?.id) {
      fetchChatHistory();
    }
  }, [session]);

  const fetchChatHistory = async () => {
    try {
      setLoadingHistory(true);
      const response = await fetch(
        "/api/admin/chat-history?includeArchived=true"
      );
      const data = await response.json();

      if (response.ok) {
        const active = data.chats.filter(
          (chat: ChatHistoryItem) => !chat.isArchived
        );
        const archived = data.chats.filter(
          (chat: ChatHistoryItem) => chat.isArchived
        );
        setChatHistory(active);
        setArchivedChats(archived);
      }
    } catch (error) {
      console.error("Error fetching chat history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const saveCurrentChat = async () => {
    if (messages.length === 0) return;

    try {
      // Generate title from first user message
      const firstUserMessage = messages.find((m) => m.role === "user");
      const title = firstUserMessage
        ? firstUserMessage.content.slice(0, 50).toUpperCase()
        : "NEW CHAT";

      const response = await fetch("/api/admin/chat-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: currentChatId,
          title,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          })),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setCurrentChatId(data.chat._id);
        await fetchChatHistory();
      }
    } catch (error) {
      console.error("Error saving chat:", error);
    }
  };

  const loadChat = (chat: ChatHistoryItem) => {
    setMessages(
      chat.messages.map((m) => ({
        ...m,
        id: Date.now().toString() + Math.random(),
        timestamp: new Date(m.timestamp),
      }))
    );
    setCurrentChatId(chat._id);
    if (window.innerWidth < 768) {
      setShowHistory(false);
    }
  };

  const deleteChat = async (chatId: string) => {
    if (deletingChatId) return; // Prevent multiple deletes

    setDeletingChatId(chatId);

    try {
      const response = await fetch(`/api/admin/chat-history?chatId=${chatId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Chat deleted", {
          description: "Chat history has been deleted successfully.",
        });
        await fetchChatHistory();
        if (currentChatId === chatId) {
          startNewChat();
        }
      } else {
        throw new Error("Failed to delete");
      }
    } catch (error) {
      console.error("Error deleting chat:", error);
      toast.error("Failed to delete chat.");
    } finally {
      setDeletingChatId(null);
    }
  };

  const toggleArchive = async (chatId: string, isArchived: boolean) => {
    try {
      const response = await fetch("/api/admin/chat-history/archive", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, isArchived: !isArchived }),
      });

      if (response.ok) {
        toast.success(isArchived ? "Chat unarchived" : "Chat archived", {
          description: `Chat has been ${
            isArchived ? "restored" : "archived"
          } successfully.`,
        });
        await fetchChatHistory();
      }
    } catch (error) {
      console.error("Error archiving chat:", error);
      toast.error("Failed to archive chat.");
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setCurrentChatId(null);
    setInput("");
    textareaRef.current?.focus();
    toast.success("New chat started", {
      description: "Start a fresh conversation.",
    });
    if (window.innerWidth < 768) {
      setShowHistory(false);
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent, overrideInput?: string) => {
    e.preventDefault();
    const textToSend = overrideInput || input;
    if ((!textToSend.trim() && attachments.length === 0) || isLoading) return;

    const isFirstMessage = messages.length === 0;
    const userInputText = textToSend.trim()
      || (attachments.length ? `Please read the attached file(s) and summarise the key details.` : "");

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userInputText,
      timestamp: new Date(),
      attachments: attachments.length ? attachments : undefined,
    };

    const loadingMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMessage, loadingMessage]);
    setInput("");
    setIsLoading(true);

    const sentAttachments = attachments;
    setAttachments([]); // consumed by this send

    // AI-native create: try this FIRST. If the message is a create request —
    // for THIS module's forms or any OTHER module's — extract the fields and
    // take the user straight to the real, pre-filled form instead of just
    // describing the steps. Falls through to normal Q&A otherwise.
    try {
      const outcome = await tryAiCreateFlow({ text: userInputText, attachments: sentAttachments });
      if (outcome.handled) {
        setMessages((prev) => prev.filter((m) => !m.isLoading).concat({
          id: (Date.now() + 1).toString(), role: "assistant", content: outcome.message, timestamp: new Date(),
        }));
        setIsLoading(false);
        // Persist this turn just like a normal Q&A reply, so it shows up in
        // Recent Chats and the user can pick the thread back up later.
        setTimeout(() => saveCurrentChat(), 500);
        if (outcome.route) router.push(outcome.route);
        return;
      }
    } catch {
      /* fall through to the normal assistant on any unexpected error */
    }

    try {
      // Stream the response token-by-token (ChatGPT-style). The server returns
      // a plain text/event stream we read incrementally; on a gate/error it
      // returns JSON instead, which we detect via the content-type.
      const response = await fetch("/api/admin/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userInputText, stream: true, attachments: sentAttachments }),
      });

      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || contentType.includes("application/json")) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to get response");
      }

      // Read the stream and append deltas to the assistant message as they arrive.
      let streamed = "";
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          streamed += decoder.decode(value, { stream: true });
          const currentText = streamed;
          // Once the first token lands, replace the "Thinking…" spinner with the
          // text as it streams in.
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === loadingMessage.id
                ? { ...msg, content: currentText, isLoading: false }
                : msg
            )
          );
        }
      }

      const finalText = streamed || "(no response)";
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === loadingMessage.id ? { ...msg, content: finalText, isLoading: false } : msg
        )
      );

      // Save chat session - immediately for first message, or update existing session
      if (isFirstMessage) {
        // First message - create new chat session with the question as title
        const title = userInputText.slice(0, 50).toUpperCase();
        const newMessages = [
          {
            role: "user" as const,
            content: userInputText,
            timestamp: userMessage.timestamp,
          },
          {
            role: "assistant" as const,
            content: finalText,
            timestamp: new Date(),
          },
        ];

        const saveResponse = await fetch("/api/admin/chat-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            messages: newMessages,
          }),
        });

        if (saveResponse.ok) {
          const savedData = await saveResponse.json();
          setCurrentChatId(savedData.chat._id);
          await fetchChatHistory();
          toast.success("Chat saved", {
            description: "New conversation started and saved.",
          });
        }
      } else {
        // Subsequent messages - update existing chat
        setTimeout(() => saveCurrentChat(), 500);
      }
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === loadingMessage.id
            ? {
                ...msg,
                content: "Sorry, I encountered an error. Please try again.",
                isLoading: false,
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (status === "loading") {
    return (
      <DashboardLayout
        sidebarSections={adminSidebarConfig}
        companyName="Aupulens"
        dashboardTitle="Admin Dashboard"
        pageName="Aupulens AI"
        profilePath="/admin/profile"
        userName="Admin"
        userEmail=""
        userRole="admin"
        onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
      >
        <div className="flex h-[calc(100vh-8rem)] gap-4">
          <div className="w-64 border-r pr-4 space-y-2 hidden md:block">
            <ShimmerSkeleton className="h-10 w-full" />
            <ShimmerSkeleton className="h-16 w-full" />
            <ShimmerSkeleton className="h-16 w-full" />
            <ShimmerSkeleton className="h-16 w-full" />
          </div>
          <div className="flex-1 flex flex-col">
            <ShimmerSkeleton className="h-12 w-64 mb-4" />
            <div className="flex-1 space-y-4 mb-4">
              <ShimmerSkeleton className="h-20 w-3/4" />
              <ShimmerSkeleton className="h-20 w-3/4 ml-auto" />
              <ShimmerSkeleton className="h-20 w-3/4" />
            </div>
            <ShimmerSkeleton className="h-24 w-full" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      sidebarSections={adminSidebarConfig}
      companyName="Aupulens"
      dashboardTitle="Admin Dashboard"
      pageName="Aupulens AI"
      breadcrumbs={[
        { label: "Dashboard", href: "/admin/dashboard" },
        { label: "Aupulens AI" },
      ]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
      profilePath="/admin/profile"
    >
      <div className="flex h-[calc(100vh-8rem)] gap-0 -mx-6 -my-4 bg-background overflow-hidden">
        {/* History Sidebar - Hidden on mobile unless toggled */}
        <div
          className={`${
            showHistory ? "translate-x-0" : "-translate-x-full"
          } md:translate-x-0 fixed md:relative z-20 w-64 h-full bg-card/95 md:bg-card/50 backdrop-blur-sm border-r border-border/50 flex flex-col transition-transform duration-300 ease-in-out`}
        >
          {/* New Chat Button */}
          <div className="p-4 border-b border-border/50 flex items-center justify-between">
            <Button
              onClick={startNewChat}
              className="flex-1 bg-accent hover:bg-accent text-foreground gap-2"
              size="sm"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </Button>
            <button
              onClick={() => setShowHistory(false)}
              className="md:hidden p-2 text-muted-foreground hover:text-foreground"
            >
              <MoreVertical className="h-4 w-4 rotate-90" />
            </button>
          </div>

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto p-4">
            {loadingHistory ? (
              <div className="flex justify-center py-4">
                <div className="h-5 w-5 border-2 border-border border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {chatHistory.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-xs font-medium text-muted-foreground mb-2 px-2">
                      Recent Chats
                    </h3>
                    <div className="space-y-1">
                      {chatHistory.map((chat) => (
                        <div
                          key={chat._id}
                          className={`group flex items-center gap-2 px-3 py-2 text-xs rounded-none transition-colors ${
                            currentChatId === chat._id
                              ? "bg-accent text-foreground"
                              : "text-muted-foreground hover:bg-card/50"
                          }`}
                        >
                          <button
                            onClick={() => loadChat(chat)}
                            className="flex-1 text-left truncate"
                            title={chat.title}
                          >
                            {chat.title}
                          </button>
                          <div className="hidden group-hover:flex items-center gap-1">
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                toggleArchive(chat._id, chat.isArchived);
                              }}
                              className="p-1 hover:bg-accent rounded transition-colors"
                              title="Move to Archive"
                            >
                              <Archive className="h-3 w-3" />
                            </button>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (
                                  await confirmDialog({ title: "Delete this chat? This action cannot be undone." })
                                ) {
                                  deleteChat(chat._id);
                                }
                              }}
                              disabled={deletingChatId === chat._id}
                              className="p-1 hover:bg-accent rounded text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                              title="Delete Chat"
                            >
                              {deletingChatId === chat._id ? (
                                <div className="h-3 w-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {archivedChats.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground mb-2 px-2 flex items-center gap-2">
                      <Archive className="h-3 w-3" />
                      Archived Chats
                    </h3>
                    <div className="space-y-1">
                      {archivedChats.map((chat) => (
                        <div
                          key={chat._id}
                          className={`group flex items-center gap-2 px-3 py-2 text-xs rounded-none transition-colors ${
                            currentChatId === chat._id
                              ? "bg-accent text-foreground"
                              : "text-muted-foreground hover:bg-card/50"
                          }`}
                        >
                          <button
                            onClick={() => loadChat(chat)}
                            className="flex-1 text-left truncate"
                            title={chat.title}
                          >
                            {chat.title}
                          </button>
                          <div className="hidden group-hover:flex items-center gap-1">
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                toggleArchive(chat._id, chat.isArchived);
                              }}
                              className="p-1 hover:bg-accent rounded transition-colors"
                              title="Restore from Archive"
                            >
                              <MessageSquare className="h-3 w-3" />
                            </button>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (
                                  await confirmDialog({ title: "Delete this archived chat? This action cannot be undone." })
                                ) {
                                  deleteChat(chat._id);
                                }
                              }}
                              disabled={deletingChatId === chat._id}
                              className="p-1 hover:bg-accent rounded text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                              title="Delete Chat"
                            >
                              {deletingChatId === chat._id ? (
                                <div className="h-3 w-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {chatHistory.length === 0 && archivedChats.length === 0 && (
                  <div className="text-center text-muted-foreground text-xs py-4">
                    No chat history yet
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col w-full min-w-0">
          {/* Mobile Header for Sidebar Toggle */}
          <div className="md:hidden p-4 border-b border-border/50 flex items-center">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="p-2 -ml-2 text-muted-foreground hover:text-foreground"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            <span className="ml-2 font-medium text-foreground">Chat</span>
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 scroll-smooth">
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-accent/50 flex items-center justify-center mb-4">
                    <MessageSquare className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    Start a conversation
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Ask me anything about your business data including finance,
                    sales, inventory, manufacturing, and user information.
                  </p>
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className={cn('flex gap-4 max-w-full mb-6', message.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-md', 
                      message.role === 'user' 
                        ? 'bg-accent border border-border text-foreground' 
                        : 'bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-purple-500/30 text-purple-400'
                    )}>
                      {message.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>

                    <div className="flex flex-col gap-1 max-w-[80%]">
                      {message.role === 'assistant' && (
                        <span className="text-sm font-medium text-foreground ml-1">Aupulens Assistant</span>
                      )}
                      {message.role === 'user' && (
                        <span className="text-sm font-medium text-foreground mr-1 text-right">You</span>
                      )}
                      
                      <div className={cn(
                        'px-4 py-3 text-[15px] leading-7 shadow-sm w-full',
                        message.role === 'user'
                          ? 'bg-accent text-foreground rounded-2xl rounded-tr-sm border border-border/50'
                          : 'bg-card/80 text-foreground rounded-2xl rounded-tl-sm border border-white/5 backdrop-blur-sm'
                      )}>
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="mb-2 flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
                            {message.attachments.map((att, ai) => (
                              att.type.startsWith("image/") ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={ai} src={att.dataUrl} alt={att.name} title={att.name} className="h-16 w-16 rounded border border-border object-cover shrink-0" />
                              ) : (
                                <span key={ai} className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-accent text-[12px] text-foreground shrink-0 max-w-[180px]">
                                  <FileText className="w-3.5 h-3.5 shrink-0 text-purple-400" />
                                  <span className="truncate">{att.name}</span>
                                </span>
                              )
                            ))}
                          </div>
                        )}
                        {message.isLoading ? (
                          <div className="flex items-center gap-2 text-purple-400">
                            <div className="h-4 w-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                            <span className="text-[15px]">Thinking…</span>
                          </div>
                        ) : (
                          <>
                            <div className="whitespace-pre-wrap">{message.content}</div>
                            {message.role === 'assistant' && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-3 border-t border-white/5 pt-2">
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                <span>Updated & Synced with ERP Analytics</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area at Bottom */}
          <div className="border-t border-border/50 p-4 bg-card/30 backdrop-blur-sm z-10 shrink-0">
            <div className="max-w-3xl mx-auto">
              <form onSubmit={handleSubmit} className="relative">
                {/* Attached files — horizontal, scrollable, no wrapping */}
                {attachments.length > 0 && (
                  <div className="mb-2 flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
                    {attachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-card text-[13px] text-foreground shrink-0 max-w-[220px]">
                        <button
                          type="button"
                          onClick={() => setPreviewIndex(i)}
                          className="flex items-center gap-2 min-w-0 text-left cursor-pointer hover:opacity-80"
                          title="Click to preview"
                        >
                          {att.type.startsWith("image/") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={att.dataUrl} alt={att.name} className="w-6 h-6 rounded object-cover shrink-0" />
                          ) : (
                            <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          )}
                          <span className="truncate max-w-[150px]">{att.name}</span>
                        </button>
                        <button type="button" onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-foreground shrink-0" title="Remove file">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="relative flex items-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.docx,image/*"
                    className="hidden"
                    onChange={(e) => { addFiles(e.target.files); if (e.target) e.target.value = ""; }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    title="Attach a document (PDF, DOCX, image)"
                    className="absolute left-2 h-8 w-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 transition-all"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder="Ask Anything"
                    className="w-full pl-12 pr-20 py-4 bg-card border-white/10 hover:border-white/20 focus-visible:ring-1 focus-visible:ring-purple-500/50 rounded-2xl text-[15px] text-foreground placeholder:text-muted-foreground transition-all shadow-inner min-h-[52px] max-h-[120px] resize-none"
                    rows={1}
                  />
                  {micSupported && (
                    <button
                      type="button"
                      onClick={toggleMic}
                      disabled={isLoading || transcribing}
                      title={listening ? "Stop and transcribe" : transcribing ? "Transcribing…" : "Speak your message"}
                      className={`absolute right-11 h-8 w-8 flex items-center justify-center rounded-xl transition-all ${listening ? "text-red-400 animate-pulse" : transcribing ? "text-purple-400" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  )}
                  <Button
                    type="submit"
                    size="icon"
                    disabled={(!input.trim() && attachments.length === 0) || isLoading}
                    className="absolute right-2 h-8 w-8 rounded-xl bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 disabled:bg-accent disabled:text-muted-foreground transition-all"
                  >
                    {isLoading ? (
                      <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>

                {/* Suggested Queries Chips */}
                {messages.length === 0 && (
                  <div className="flex gap-2 mt-3 overflow-x-auto pb-2 scrollbar-hide">
                    {SUGGESTED_QUERIES.map((item, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={(e) => handleSubmit(e, item.query)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-accent/50 hover:bg-accent border border-border/50 rounded-full text-xs text-foreground whitespace-nowrap transition-colors"
                      >
                        <item.icon className="h-3 w-3 text-blue-400" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="text-xs text-muted-foreground text-center mt-2">
                  Aupulens Assistant can make mistakes. Consider checking important
                  information.
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {previewIndex !== null && attachments[previewIndex] && (
        <AttachmentPreview attachment={attachments[previewIndex]} onClose={() => setPreviewIndex(null)} />
      )}
    </DashboardLayout>
  );
}
