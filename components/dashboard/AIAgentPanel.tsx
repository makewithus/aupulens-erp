"use client";

import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  X,
  Minus,
  Send,
  Bot,
  User,
  ChevronDown,
  Zap,
  BarChart3,
  FileText,
  TrendingUp,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const SUGGESTED_PROMPTS = [
  { icon: BarChart3, label: "Revenue this month", text: "What is the total revenue for this month?" },
  { icon: FileText, label: "Pending invoices", text: "Show me all pending invoices" },
  { icon: TrendingUp, label: "Top customers", text: "Who are my top 5 customers by revenue?" },
  { icon: Zap, label: "Cash flow summary", text: "Give me a quick cash flow summary" },
];

export function AIAgentPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I'm Aupulens AI — your intelligent ERP assistant. Ask me anything about your financials, invoices, inventory, or team.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hasBounced, setHasBounced] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Attention-grabbing bounce on first load
  useEffect(() => {
    const t = setTimeout(() => setHasBounced(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    const loadingMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput("");
    setShowSuggestions(false);
    setIsLoading(true);

    // Simulated response (no real API integration yet)
    await new Promise((r) => setTimeout(r, 1500));
    setMessages((prev) =>
      prev.map((m) =>
        m.id === loadingMsg.id
          ? {
              ...m,
              content:
                "This is a demo response. AI integration will be connected soon. I can help you analyze revenue, track invoices, monitor inventory and much more!",
            }
          : m
      )
    );
    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  };

  return (
    <>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open AI Agent"
          className={cn(
            "fixed bottom-6 right-6 z-50 group",
            "h-14 w-14 rounded-full",
            "bg-gradient-to-br from-violet-600 via-blue-600 to-cyan-500",
            "shadow-2xl shadow-violet-500/40",
            "flex items-center justify-center",
            "transition-all duration-300 ease-out",
            "hover:scale-110 hover:shadow-violet-500/60",
            "focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2",
            hasBounced && "animate-bounce"
          )}
          style={{ animationIterationCount: hasBounced ? 3 : "infinite" }}
        >
          <Sparkles className="h-6 w-6 text-white drop-shadow" />
          {/* Pulse ring */}
          <span className="absolute inset-0 rounded-full bg-violet-400/30 animate-ping" />
          {/* Badge */}
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-400 border-2 border-background flex items-center justify-center">
            <span className="sr-only">AI Online</span>
          </span>
        </button>
      )}

      {/* Panel */}
      {isOpen && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50",
            "w-[380px] rounded-2xl border border-border/60",
            "bg-background/95 backdrop-blur-xl",
            "shadow-2xl shadow-black/20",
            "flex flex-col overflow-hidden",
            "transition-all duration-300 ease-out",
            isMinimized ? "h-[60px]" : "h-[560px]"
          )}
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--muted)/0.4) 100%)",
          }}
        >
          {/* ── Header ── */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-gradient-to-r from-violet-500/10 via-blue-500/5 to-transparent flex-shrink-0">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-md">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-background" />
            </div>

            {/* Title */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground leading-none">
                Aupulens AI
              </p>
              <p className="text-[11px] text-emerald-500 font-medium mt-0.5">
                ● Online · Ready to help
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setIsMinimized(!isMinimized)}
                aria-label={isMinimized ? "Expand" : "Minimize"}
              >
                {isMinimized ? (
                  <ChevronDown className="h-3.5 w-3.5 rotate-180" />
                ) : (
                  <Minus className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-red-500"
                onClick={() => setIsOpen(false)}
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* ── Body (hidden when minimized) ── */}
          {!isMinimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-2.5",
                      msg.role === "user" ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    {/* Avatar */}
                    <div
                      className={cn(
                        "flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center",
                        msg.role === "assistant"
                          ? "bg-gradient-to-br from-violet-500 to-blue-600"
                          : "bg-gradient-to-br from-slate-600 to-slate-700"
                      )}
                    >
                      {msg.role === "assistant" ? (
                        <Bot className="h-3.5 w-3.5 text-white" />
                      ) : (
                        <User className="h-3.5 w-3.5 text-white" />
                      )}
                    </div>

                    {/* Bubble */}
                    <div
                      className={cn(
                        "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                        msg.role === "assistant"
                          ? "bg-muted/60 text-foreground rounded-tl-sm"
                          : "bg-gradient-to-br from-violet-600 to-blue-600 text-white rounded-tr-sm shadow-md"
                      )}
                    >
                      {msg.content ? (
                        <span>{msg.content}</span>
                      ) : (
                        <div className="flex items-center gap-1.5 py-0.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      )}
                      <p className={cn(
                        "text-[10px] mt-1 font-medium",
                        msg.role === "assistant" ? "text-muted-foreground" : "text-white/60"
                      )}>
                        {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Suggested Prompts */}
              {showSuggestions && messages.length === 1 && (
                <div className="px-4 pb-3">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">
                    Suggested
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SUGGESTED_PROMPTS.map((s) => {
                      const Icon = s.icon;
                      return (
                        <button
                          key={s.label}
                          onClick={() => handleSuggestion(s.text)}
                          className={cn(
                            "flex items-center gap-2 text-left px-3 py-2 rounded-xl",
                            "text-[11px] font-medium text-foreground",
                            "border border-border/60 bg-muted/40",
                            "hover:bg-violet-500/10 hover:border-violet-400/40 hover:text-violet-600 dark:hover:text-violet-400",
                            "transition-all duration-150"
                          )}
                        >
                          <Icon className="h-3 w-3 flex-shrink-0 opacity-70" />
                          <span className="truncate">{s.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Input ── */}
              <div className="px-4 pb-4 flex-shrink-0 border-t border-border/40 pt-3">
                <div className="relative flex items-end gap-2">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything about your ERP data…"
                    className={cn(
                      "min-h-[44px] max-h-[110px] resize-none text-sm",
                      "rounded-xl border-border/60 bg-muted/40",
                      "focus-visible:ring-1 focus-visible:ring-violet-500/50 focus-visible:border-violet-400/60",
                      "placeholder:text-muted-foreground/60 pr-12"
                    )}
                    disabled={isLoading}
                    rows={1}
                  />
                  <Button
                    size="icon"
                    disabled={!input.trim() || isLoading}
                    onClick={handleSend}
                    className={cn(
                      "absolute right-2 bottom-2 h-7 w-7 rounded-lg flex-shrink-0",
                      "bg-gradient-to-br from-violet-600 to-blue-600",
                      "hover:from-violet-500 hover:to-blue-500",
                      "disabled:opacity-40 disabled:cursor-not-allowed",
                      "shadow-md shadow-violet-500/30",
                      "transition-all duration-200"
                    )}
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5 text-white" />
                    )}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/50 text-center mt-2">
                  Press ⏎ to send · Shift+⏎ for new line
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
