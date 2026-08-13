"use client";
import { confirmDialog } from "@/components/providers/ConfirmRoot";


import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { hrSidebarConfig } from "@/config/sidebar/hr";
import { Send, Trash2, Plus, MessageSquare, Menu, X, Mic, Paperclip } from "lucide-react";
import { useSpeechToText } from "@/lib/hooks/useSpeechToText";
import { useChatAttachments } from "@/lib/hooks/useChatAttachments";
import { ChatAttachmentBar } from "@/components/ai/ChatAttachmentBar";
import { AiMarkdown } from '@/components/ai/AiMarkdown';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

interface ChatHistoryItem {
  _id: string;
  title: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  messages: { role: "user" | "assistant"; content: string; timestamp: Date }[];
}

export default function HRAIAssistantPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const { supported: micSupported, listening, transcribing, toggle: toggleMic } = useSpeechToText({
    onFinalText: (t) => setInput((prev) => (prev ? `${prev} ${t}` : t)),
    onError: (m) => toast.error(m),
  });
  const { attachments, addFiles, removeAttachment, handlePaste, fileInputRef, clear: clearAttachments } = useChatAttachments({ onError: (m) => toast.error(m) });
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    
  }, [status, router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (status === "authenticated") fetchChatHistory();
  }, [status]);

  const fetchChatHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await fetch("/api/hr/chat-history");
      if (res.ok) {
        const data = await res.json();
        setChatHistory(data.chats || []);
      }
    } catch {
      console.error("Error fetching chat history");
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadChat = (chat: ChatHistoryItem) => {
    const loaded: Message[] = chat.messages.map((msg, idx) => ({
      id: `${chat._id}-${idx}`,
      role: msg.role,
      content: msg.content,
      timestamp: new Date(msg.timestamp),
    }));
    setMessages(loaded);
    setCurrentChatId(chat._id);
    setSidebarOpen(false);
  };

  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!await confirmDialog({ title: "Delete this chat?" })) return;
    try {
      const res = await fetch(`/api/hr/chat-history?chatId=${chatId}`, { method: "DELETE" });
      if (res.ok) {
        if (currentChatId === chatId) {
          setMessages([]);
          setCurrentChatId(null);
        }
        fetchChatHistory();
        toast.success("Chat deleted");
      }
    } catch {
      toast.error("Failed to delete");
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setCurrentChatId(null);
    textareaRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    const isFirstMessage = messages.length === 0;
    const sentAttachments = attachments;
    const userInput = input.trim() || (sentAttachments.length ? "Please read the attached file(s) and help accordingly." : "");
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userInput,
      timestamp: new Date(),
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
    clearAttachments();
    setIsLoading(true);

    try {
      const res = await fetch("/api/hr/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userInput, message: userInput, attachments: sentAttachments }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) =>
          prev
            .filter((m) => !m.isLoading)
            .concat({
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: `Error: ${data?.error || "Server error"}`,
              timestamp: new Date(),
            }),
        );
        return;
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response || "I encountered an error.",
        timestamp: new Date(),
      };

      setMessages((prev) => prev.filter((m) => !m.isLoading).concat(assistantMessage));

      // Save chat
      if (isFirstMessage) {
        const title = userInput.slice(0, 50).toUpperCase();
        const chatMessages = [
          { role: "user" as const, content: userInput, timestamp: userMessage.timestamp },
          { role: "assistant" as const, content: data.response, timestamp: assistantMessage.timestamp },
        ];
        const saveRes = await fetch("/api/hr/chat-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, messages: chatMessages }),
        });
        if (saveRes.ok) {
          const saved = await saveRes.json();
          setCurrentChatId(saved.chat?._id || null);
          fetchChatHistory();
        }
      } else if (currentChatId) {
        const allMsgs = [...messages.filter((m) => !m.isLoading), userMessage, assistantMessage].map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        }));
        await fetch("/api/hr/chat-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: currentChatId, messages: allMsgs }),
        });
        fetchChatHistory();
      }
    } catch {
      setMessages((prev) =>
        prev
          .filter((m) => !m.isLoading)
          .concat({
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: "Network error. Please try again.",
            timestamp: new Date(),
          }),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <DashboardLayout
      sidebarSections={hrSidebarConfig}
      dashboardTitle="HR & Payroll"
      pageName="AI Assistant"
      breadcrumbs={[{ label: "HR", href: "/hr/dashboard" }, { label: "AI Assistant" }]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      profilePath="/hr/profile"
    >
      <div className="flex h-[calc(100vh-130px)] max-w-8xl mx-auto gap-0">
        {/* Chat History Sidebar */}
        <div className={`${sidebarOpen ? "w-72" : "w-0"} transition-all duration-200 overflow-hidden border-r border-border/40 bg-muted/20 flex-shrink-0`}>
          <div className="p-3 space-y-3 h-full flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase text-muted-foreground">Chat History</h3>
              <Button size="icon" variant="ghost" onClick={startNewChat} className="h-7 w-7">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {chatHistory.map((chat) => (
                <div
                  key={chat._id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm hover:bg-muted transition-colors ${currentChatId === chat._id ? "bg-muted" : ""}`}
                  onClick={() => loadChat(chat)}
                >
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{chat.title}</span>
                  <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0" onClick={(e) => deleteChat(chat._id, e)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {chatHistory.length === 0 && !loadingHistory && (
                <p className="text-xs text-muted-foreground text-center py-4">No chats yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 p-3 border-b border-border/40">
            <Button size="icon" variant="ghost" onClick={() => setSidebarOpen(!sidebarOpen)} className="h-8 w-8">
              {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
            <h2 className="font-bold text-foreground">HR AI Assistant</h2>
            <span className="text-xs text-muted-foreground">Ask about employees, payroll, attendance, leave, or any HR query</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-bold text-lg text-foreground mb-2">HR AI Assistant</h3>
                  <p className="text-sm text-muted-foreground">
                    Ask me about employee details, payroll information, attendance stats, leave balances, department info, or any HR-related query.
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    {[
                      "How many active employees?",
                      "Show pending leave requests",
                      "Payroll summary this month",
                      "Department headcount",
                    ].map((q) => (
                      <button
                        key={q}
                        className="text-xs text-left px-3 py-2 rounded-md border border-border/40 hover:bg-muted transition-colors"
                        onClick={async () => {
                          setInput(q);
                          textareaRef.current?.focus();
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.isLoading ? (
                    <div className="flex gap-1">
                      <div className="h-2 w-2 rounded-full bg-current animate-bounce" />
                      <div className="h-2 w-2 rounded-full bg-current animate-bounce" style={{ animationDelay: "0.1s" }} />
                      <div className="h-2 w-2 rounded-full bg-current animate-bounce" style={{ animationDelay: "0.2s" }} />
                    </div>
                  ) : msg.role === "assistant" ? (
                    <AiMarkdown content={msg.content} />
                  ) : (
                    <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-border/40">
            <ChatAttachmentBar attachments={attachments} removeAttachment={removeAttachment} fileInputRef={fileInputRef} addFiles={addFiles} />
            <form onSubmit={handleSubmit} className="flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Ask about employees, payroll, attendance..."
                className="flex-1 min-h-[44px] max-h-[120px] resize-none"
                rows={1}
              />
              <Button type="button" variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={isLoading} title="Attach a document or image" className="h-11 w-11 p-0 text-muted-foreground hover:text-foreground">
                <Paperclip className="h-4 w-4" />
              </Button>
              {micSupported && (
                <Button type="button" variant="ghost" onClick={toggleMic} disabled={isLoading || transcribing} title={listening ? "Stop and transcribe" : transcribing ? "Transcribing…" : "Speak your message"} className={`h-11 w-11 p-0 ${listening ? "text-red-500 animate-pulse" : transcribing ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <Mic className="h-4 w-4" />
              </Button>
              )}
              <Button type="submit" disabled={(!input.trim() && attachments.length === 0) || isLoading} className="h-11 w-11 p-0">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
