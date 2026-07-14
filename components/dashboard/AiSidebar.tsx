"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Send, Sparkles, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: string;
  text: string;
  isLoading?: boolean;
}

export function AiSidebar({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sendQuery = async (queryText: string, customMessagesHistory?: Message[]) => {
    setIsLoading(true);

    const baseHistory = customMessagesHistory || messages;
    const nextMessages = [...baseHistory];

    if (customMessagesHistory === undefined) {
      nextMessages.push({ role: "user", text: queryText });
    }
    nextMessages.push({ role: "assistant", text: "", isLoading: true });
    setMessages(nextMessages);

    try {
      const response = await fetch("/api/admin/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: queryText }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      setMessages((prev) => {
        const newMsgs = [...prev];
        if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].role === "assistant") {
          newMsgs[newMsgs.length - 1] = { role: "assistant", text: data.response };
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
            { role: "assistant", content: data.response, timestamp: new Date() },
          ],
        }),
      });

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

  const handleEditMessage = (index: number) => {
    const targetMsg = messages[index];
    if (targetMsg.role !== "user") return;
    setInput(targetMsg.text);
    setMessages((prev) => prev.slice(0, index));
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleRetry = (userIndex: number) => {
    const userMsg = messages[userIndex];
    if (userMsg.role !== "user") return;
    const nextHistory = messages.slice(0, userIndex + 1);
    sendQuery(userMsg.text, nextHistory);
  };

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Markdown customized components object
  const markdownComponents = {
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || "");
      const codeVal = String(children).replace(/\n$/, "");
      if (!inline && match) {
        return (
          <div className="relative group/code my-3 border border-neutral-800 rounded bg-[#161618] font-mono text-xs overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-800 bg-[#0d0d0e] text-neutral-500 uppercase tracking-wider text-[10px] select-none">
              <span>{match[1]}</span>
              <button
                onClick={() => navigator.clipboard.writeText(codeVal)}
                className="text-[10px] hover:text-neutral-300 transition-colors uppercase tracking-wider cursor-pointer font-mono"
              >
                Copy
              </button>
            </div>
            <pre className="p-3 overflow-x-auto text-neutral-200 leading-relaxed font-mono">
              <code {...props}>{children}</code>
            </pre>
          </div>
        );
      }
      return (
        <code
          className="font-mono text-[11px] bg-neutral-900 text-neutral-300 px-1 py-0.5 rounded border border-neutral-800/60"
          {...props}
        >
          {children}
        </code>
      );
    },
    table({ children }: any) {
      return (
        <div className="overflow-x-auto my-3 border border-neutral-800 rounded">
          <table className="w-full text-left text-xs font-mono border-collapse">
            {children}
          </table>
        </div>
      );
    },
    thead({ children }: any) {
      return <thead className="bg-[#0f0f11] border-b border-neutral-800">{children}</thead>;
    },
    tbody({ children }: any) {
      return <tbody className="divide-y divide-neutral-800/60">{children}</tbody>;
    },
    tr({ children }: any) {
      return <tr>{children}</tr>;
    },
    th({ children }: any) {
      return <th className="px-3 py-2 font-medium text-neutral-400 border-r border-neutral-800 last:border-r-0">{children}</th>;
    },
    td({ children }: any) {
      return <td className="px-3 py-2 text-neutral-300 border-r border-neutral-800 last:border-r-0">{children}</td>;
    },
    h1({ children }: any) {
      return <h1 className="text-xs font-bold text-white uppercase tracking-wider mt-4 mb-2 first:mt-0">{children}</h1>;
    },
    h2({ children }: any) {
      return <h2 className="text-xs font-semibold text-neutral-200 mt-3 mb-1.5 first:mt-0">{children}</h2>;
    },
    h3({ children }: any) {
      return <h3 className="text-xs text-neutral-300 font-medium mt-3 mb-1">{children}</h3>;
    },
    p({ children }: any) {
      return <p className="mb-2.5 last:mb-0 leading-relaxed text-[12.5px] text-neutral-300 font-sans">{children}</p>;
    },
    ul({ children }: any) {
      return <ul className="list-disc pl-4 space-y-1 my-2.5 text-[12.5px] text-neutral-300 font-sans">{children}</ul>;
    },
    ol({ children }: any) {
      return <ol className="list-decimal pl-4 space-y-1 my-2.5 text-[12.5px] text-neutral-300 font-sans">{children}</ol>;
    },
    li({ children }: any) {
      return <li className="leading-relaxed">{children}</li>;
    },
    blockquote({ children }: any) {
      return (
        <div className="border-l border-indigo-500 bg-indigo-950/10 px-3 py-2 my-2.5 rounded-r text-[12.5px] text-neutral-300 font-mono">
          {children}
        </div>
      );
    }
  };

  return (
    <aside
      className={cn(
        "bg-neutral-950 flex flex-col flex-shrink-0 animate-in slide-in-from-right duration-200 transition-all ease-in-out shadow-2xl",
        "absolute inset-y-0 right-0 z-50 w-full max-w-[460px] sm:relative sm:w-[450px] sm:max-w-none h-full border-l border-neutral-800"
      )}
    >
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-xl shrink-0 font-mono">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded border border-neutral-800 bg-neutral-900/60 flex items-center justify-center text-purple-400 select-none shadow-sm shadow-purple-500/5">
            <Sparkles className="w-3 h-3" />
          </div>
          <h2 className="font-semibold text-xs tracking-wider uppercase text-neutral-400">AI Workspace</h2>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => {
                setMessages([]);
                setInput("");
              }}
              className="px-2 py-1 text-[10px] text-neutral-500 hover:text-neutral-300 border border-transparent hover:border-neutral-850 rounded font-mono uppercase tracking-wider transition-all cursor-pointer mr-1"
              title="Clear chat history"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => {
              onClose();
              router.push("/admin/ai-assistant");
            }}
            className="p-1.5 rounded text-neutral-500 hover:text-white hover:bg-neutral-900 transition-colors cursor-pointer"
            title="Open Full Screen AI Assistant"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-neutral-500 hover:text-white hover:bg-neutral-900 transition-colors cursor-pointer"
            title="Close panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Conversation or Workspace Area */}
      <div className="flex-1 overflow-y-auto bg-gradient-to-b from-neutral-950 to-neutral-950/40 flex flex-col justify-start">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">

            {/* Compact suggested chips */}
            <div className="flex flex-wrap gap-2 justify-center max-w-[340px]">
              {[
                "Analyze sales pipeline",
                "Summarize customer activity",
                "Create follow-up tasks",
              ].map((promptText) => (
                <button
                  key={promptText}
                  onClick={() => handleSuggestedPrompt(promptText)}
                  className="px-3 py-1.5 rounded-full border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900 hover:border-neutral-700 text-[11px] text-neutral-400 hover:text-neutral-200 font-mono transition-all cursor-pointer whitespace-nowrap shadow-sm"
                >
                  {promptText}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-grow p-4 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className="group relative flex gap-3 py-4 px-3 hover:bg-neutral-900/20 transition-colors duration-150 rounded border border-neutral-900/50 hover:border-neutral-900"
              >
                {/* Minimal Avatar identifier */}
                <div className="flex-shrink-0 mt-0.5">
                  {msg.role === "user" ? (
                    <div className="w-5.5 h-5.5 rounded border border-neutral-800 bg-neutral-900 flex items-center justify-center text-neutral-400 select-none text-[9px] font-mono">
                      U
                    </div>
                  ) : (
                    <div className="w-5.5 h-5.5 rounded border border-neutral-850 bg-neutral-900/40 flex items-center justify-center text-purple-400 select-none shadow-sm shadow-purple-500/5">
                      <Sparkles className="w-3 h-3" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {msg.isLoading ? (
                    <div className="flex items-center gap-2 text-neutral-500 font-mono text-xs py-1">
                      <div className="h-3 w-3 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin" />
                      <span>Thinking...</span>
                    </div>
                  ) : (
                    <div className="prose prose-invert max-w-none text-xs text-neutral-300 font-sans">
                      {msg.role === "user" ? (
                        <p className="whitespace-pre-wrap leading-relaxed text-[12.5px] text-neutral-300">{msg.text}</p>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {msg.text}
                        </ReactMarkdown>
                      )}
                    </div>
                  )}
                </div>

                {/* Hover actions */}
                {!msg.isLoading && (
                  <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1 bg-neutral-950/90 border border-neutral-800 px-1 py-0.5 rounded shadow-lg backdrop-blur-sm">
                    <button
                      onClick={() => navigator.clipboard.writeText(msg.text)}
                      className="p-1 text-[9px] text-neutral-500 hover:text-white uppercase tracking-wider font-mono cursor-pointer"
                      title="Copy message"
                    >
                      Copy
                    </button>
                    {msg.role === "user" && (
                      <>
                        <span className="text-neutral-800 text-[10px] select-none">|</span>
                        <button
                          onClick={() => handleEditMessage(i)}
                          className="p-1 text-[9px] text-neutral-500 hover:text-white uppercase tracking-wider font-mono cursor-pointer"
                          title="Edit message"
                        >
                          Edit
                        </button>
                      </>
                    )}
                    {msg.role === "assistant" && i > 0 && (
                      <>
                        <span className="text-neutral-800 text-[10px] select-none">|</span>
                        <button
                          onClick={() => handleRetry(i - 1)}
                          className="p-1 text-[9px] text-neutral-500 hover:text-white uppercase tracking-wider font-mono cursor-pointer"
                          title="Retry"
                        >
                          Retry
                        </button>
                      </>
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
      <div className="p-4 border-t border-neutral-900 bg-neutral-950 shrink-0 w-full">
        <div className="relative border border-neutral-800/80 hover:border-neutral-700/80 focus-within:border-neutral-700 focus-within:ring-1 focus-within:ring-neutral-700/30 rounded bg-neutral-900/50 p-2.5 transition-all shadow-sm">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && !isLoading) {
                  sendQuery(input.trim());
                  setInput("");
                }
              }
            }}
            disabled={isLoading}
            placeholder="Ask anything..."
            className="w-full bg-transparent border-none text-[12.5px] text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-0 resize-none font-sans min-h-[44px] max-h-[200px]"
            style={{
              height: `${Math.min(200, Math.max(44, (input.split("\n").length || 1) * 18 + 12))}px`,
            }}
          />
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-900/50">
            <span className="text-[9px] text-neutral-500 font-mono">
              ⏎ to send · ⇧⏎ for newline
            </span>
            <button
              onClick={() => {
                if (input.trim() && !isLoading) {
                  sendQuery(input.trim());
                  setInput("");
                }
              }}
              disabled={!input.trim() || isLoading}
              className="h-6 px-2.5 rounded bg-neutral-850 hover:bg-neutral-800 disabled:opacity-40 text-[9px] text-neutral-300 font-mono uppercase tracking-wider transition-colors flex items-center gap-1 cursor-pointer"
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
    </aside>
  );
}
