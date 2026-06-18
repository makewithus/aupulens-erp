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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ShimmerSkeleton } from "@/components/ui/loading-skeletons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";

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
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [archivedChats, setArchivedChats] = useState<ChatHistoryItem[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        toast({
          title: "Chat deleted",
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
      toast({
        title: "Error",
        description: "Failed to delete chat.",
        variant: "destructive",
      });
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
        toast({
          title: isArchived ? "Chat unarchived" : "Chat archived",
          description: `Chat has been ${
            isArchived ? "restored" : "archived"
          } successfully.`,
        });
        await fetchChatHistory();
      }
    } catch (error) {
      console.error("Error archiving chat:", error);
      toast({
        title: "Error",
        description: "Failed to archive chat.",
        variant: "destructive",
      });
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setCurrentChatId(null);
    setInput("");
    textareaRef.current?.focus();
    toast({
      title: "New chat started",
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
    if (!textToSend.trim() || isLoading) return;

    const isFirstMessage = messages.length === 0;
    const userInputText = textToSend.trim();

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userInputText,
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
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userInputText }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      const assistantMessage = {
        ...loadingMessage,
        content: data.response,
        isLoading: false,
      };

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === loadingMessage.id ? assistantMessage : msg
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
            content: data.response,
            timestamp: assistantMessage.timestamp,
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
          toast({
            title: "Chat saved",
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
        pageName="AI Assistant"
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
      pageName="AI Assistant"
      breadcrumbs={[
        { label: "Dashboard", href: "/admin/dashboard" },
        { label: "AI Assistant" },
      ]}
      userName={session?.user?.name || ""}
      userEmail={session?.user?.email || ""}
      userRole={session?.user?.role}
      onSignOut={() => signOut({ callbackUrl: "/auth/admin" })}
      profilePath="/admin/profile"
    >
      <div className="flex h-[calc(100vh-8rem)] gap-0 -mx-6 -my-4 bg-linear-to-br from-gray-950 via-black to-gray-900 overflow-hidden">
        {/* History Sidebar - Hidden on mobile unless toggled */}
        <div
          className={`${
            showHistory ? "translate-x-0" : "-translate-x-full"
          } md:translate-x-0 fixed md:relative z-20 w-64 h-full bg-black/95 md:bg-black/50 backdrop-blur-sm border-r border-gray-800/50 flex flex-col transition-transform duration-300 ease-in-out`}
        >
          {/* New Chat Button */}
          <div className="p-4 border-b border-gray-800/50 flex items-center justify-between">
            <Button
              onClick={startNewChat}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-white gap-2"
              size="sm"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </Button>
            <button
              onClick={() => setShowHistory(false)}
              className="md:hidden p-2 text-gray-400 hover:text-white"
            >
              <MoreVertical className="h-4 w-4 rotate-90" />
            </button>
          </div>

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto p-4">
            {loadingHistory ? (
              <div className="flex justify-center py-4">
                <div className="h-5 w-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {chatHistory.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-xs font-medium text-gray-500 mb-2 px-2">
                      Recent Chats
                    </h3>
                    <div className="space-y-1">
                      {chatHistory.map((chat) => (
                        <div
                          key={chat._id}
                          className={`group flex items-center gap-2 px-3 py-2 text-xs rounded-none transition-colors ${
                            currentChatId === chat._id
                              ? "bg-gray-800 text-white"
                              : "text-gray-400 hover:bg-gray-900/50"
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
                              className="p-1 hover:bg-gray-700 rounded transition-colors"
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
                              className="p-1 hover:bg-gray-700 rounded text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
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
                    <h3 className="text-xs font-medium text-gray-500 mb-2 px-2 flex items-center gap-2">
                      <Archive className="h-3 w-3" />
                      Archived Chats
                    </h3>
                    <div className="space-y-1">
                      {archivedChats.map((chat) => (
                        <div
                          key={chat._id}
                          className={`group flex items-center gap-2 px-3 py-2 text-xs rounded-none transition-colors ${
                            currentChatId === chat._id
                              ? "bg-gray-800 text-gray-300"
                              : "text-gray-500 hover:bg-gray-900/50"
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
                              className="p-1 hover:bg-gray-700 rounded transition-colors"
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
                              className="p-1 hover:bg-gray-700 rounded text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
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
                  <div className="text-center text-gray-600 text-xs py-4">
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
          <div className="md:hidden p-4 border-b border-gray-800/50 flex items-center">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="p-2 -ml-2 text-gray-400 hover:text-white"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            <span className="ml-2 font-medium text-white">Chat</span>
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 scroll-smooth">
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-gray-800/50 flex items-center justify-center mb-4">
                    <MessageSquare className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">
                    Start a conversation
                  </h3>
                  <p className="text-sm text-gray-400 max-w-md">
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
                        ? 'bg-neutral-800 border border-neutral-700 text-neutral-300' 
                        : 'bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-purple-500/30 text-purple-400'
                    )}>
                      {message.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>

                    <div className="flex flex-col gap-1 max-w-[80%]">
                      {message.role === 'assistant' && (
                        <span className="text-sm font-medium text-white ml-1">Aupulens Assistant</span>
                      )}
                      {message.role === 'user' && (
                        <span className="text-sm font-medium text-white mr-1 text-right">You</span>
                      )}
                      
                      <div className={cn(
                        'px-4 py-3 text-[13px] leading-relaxed shadow-sm w-full', 
                        message.role === 'user' 
                          ? 'bg-neutral-800 text-neutral-100 rounded-2xl rounded-tr-sm border border-neutral-700/50' 
                          : 'bg-neutral-900/80 text-neutral-300 rounded-2xl rounded-tl-sm border border-white/5 backdrop-blur-sm'
                      )}>
                        {message.isLoading ? (
                          <div className="flex items-center gap-2 text-purple-400">
                            <div className="h-4 w-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                            <span className="text-sm">Thinking...</span>
                          </div>
                        ) : (
                          <>
                            <div className="whitespace-pre-wrap">{message.content}</div>
                            {message.role === 'assistant' && (
                              <div className="flex items-center gap-2 text-xs text-gray-500 mt-3 border-t border-white/5 pt-2">
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
          <div className="border-t border-gray-800/50 p-4 bg-black/30 backdrop-blur-sm z-10 shrink-0">
            <div className="max-w-3xl mx-auto">
              <form onSubmit={handleSubmit} className="relative">
                <div className="relative flex items-center">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Message Aupulens Assistant..."
                    className="w-full pl-4 pr-12 py-4 bg-neutral-900 border-white/10 hover:border-white/20 focus-visible:ring-1 focus-visible:ring-purple-500/50 rounded-2xl text-[13px] text-neutral-200 placeholder:text-neutral-500 transition-all shadow-inner min-h-[52px] max-h-[120px] resize-none"
                    disabled={isLoading}
                    rows={1}
                  />
                  <Button 
                    type="submit" 
                    size="icon" 
                    disabled={!input.trim() || isLoading}
                    className="absolute right-2 h-8 w-8 rounded-xl bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 disabled:bg-neutral-800 disabled:text-neutral-500 transition-all"
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
                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 rounded-full text-xs text-gray-300 whitespace-nowrap transition-colors"
                      >
                        <item.icon className="h-3 w-3 text-blue-400" />
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="text-xs text-gray-600 text-center mt-2">
                  Aupulens Assistant can make mistakes. Consider checking important
                  information.
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      <Toaster />
    </DashboardLayout>
  );
}
