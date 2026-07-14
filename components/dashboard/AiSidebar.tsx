"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Send, Sparkles, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useThemeStore } from "@/store/themeStore";

interface Message {
  role: string;
  text: string;
  isLoading?: boolean;
}

export function AiSidebar({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme !== "light";

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
          <table className="w-full text-left text-xs font-mono border-collapse">
            {children}
          </table>
        </div>
      );
    },
    thead({ children }: any) {
      return <thead className={cn("border-b", isDark ? "bg-[#0f0f11] border-neutral-800" : "bg-neutral-50 border-neutral-200")}>{children}</thead>;
    },
    tbody({ children }: any) {
      return <tbody className={cn("divide-y", isDark ? "divide-neutral-800/60" : "divide-neutral-150")}>{children}</tbody>;
    },
    tr({ children }: any) {
      return <tr>{children}</tr>;
    },
    th({ children }: any) {
      return (
        <th className={cn(
          "px-3 py-2 font-medium border-r last:border-r-0",
          isDark ? "text-neutral-400 border-neutral-800" : "text-neutral-600 border-neutral-200"
        )}>
          {children}
        </th>
      );
    },
    td({ children }: any) {
      return (
        <td className={cn(
          "px-3 py-2 border-r last:border-r-0",
          isDark ? "text-neutral-300 border-neutral-800" : "text-neutral-700 border-neutral-200"
        )}>
          {children}
        </td>
      );
    },
    h1({ children }: any) {
      return <h1 className={cn("text-xs font-bold uppercase tracking-wider mt-4 mb-2 first:mt-0", isDark ? "text-white" : "text-neutral-950")}>{children}</h1>;
    },
    h2({ children }: any) {
      return <h2 className={cn("text-xs font-semibold mt-3 mb-1.5 first:mt-0", isDark ? "text-neutral-200" : "text-neutral-800")}>{children}</h2>;
    },
    h3({ children }: any) {
      return <h3 className={cn("text-xs font-medium mt-3 mb-1", isDark ? "text-neutral-300" : "text-neutral-700")}>{children}</h3>;
    },
    p({ children }: any) {
      return <p className={cn("mb-2.5 last:mb-0 leading-relaxed text-[12.5px] font-sans", isDark ? "text-neutral-300" : "text-neutral-650")}>{children}</p>;
    },
    ul({ children }: any) {
      return <ul className={cn("list-disc pl-4 space-y-1 my-2.5 text-[12.5px] font-sans", isDark ? "text-neutral-300" : "text-neutral-650")}>{children}</ul>;
    },
    ol({ children }: any) {
      return <ol className={cn("list-decimal pl-4 space-y-1 my-2.5 text-[12.5px] font-sans", isDark ? "text-neutral-300" : "text-neutral-650")}>{children}</ol>;
    },
    li({ children }: any) {
      return <li className="leading-relaxed">{children}</li>;
    },
    blockquote({ children }: any) {
      return (
        <div className={cn(
          "border-l-2 px-3 py-2 my-2.5 rounded-r text-[12.5px] font-mono",
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
          <h2 className={cn("font-semibold text-xs tracking-wider uppercase", isDark ? "text-neutral-400" : "text-neutral-600")}>AI Assistant</h2>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => {
                setMessages([]);
                setInput("");
              }}
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
              onClose();
              router.push("/admin/ai-assistant");
            }}
            className={cn(
              "p-1.5 rounded transition-colors cursor-pointer",
              isDark ? "text-neutral-500 hover:text-white hover:bg-neutral-900" : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100"
            )}
            title="Open Full Screen AI Assistant"
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
        {messages.length === 0 ? (
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
                  {msg.isLoading ? (
                    <div className="flex items-center gap-2 text-neutral-500 font-mono text-xs py-1">
                      <div className="h-3 w-3 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin" />
                      <span>Thinking...</span>
                    </div>
                  ) : (
                    <div className={cn("prose max-w-none text-xs font-sans", isDark ? "prose-invert text-neutral-300" : "text-neutral-700")}>
                      {msg.role === "user" ? (
                        <p className={cn("whitespace-pre-wrap leading-relaxed text-[12.5px]", isDark ? "text-neutral-300" : "text-neutral-650")}>{msg.text}</p>
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
                  <div className={cn(
                    "absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1 border px-1 py-0.5 rounded shadow-lg backdrop-blur-sm",
                    isDark ? "bg-neutral-950/90 border-neutral-800 shadow-black/40" : "bg-white border-neutral-200 shadow-neutral-200/50"
                  )}>
                    <button
                      onClick={() => navigator.clipboard.writeText(msg.text)}
                      className={cn(
                        "p-1 text-[9px] uppercase tracking-wider font-mono cursor-pointer",
                        isDark ? "text-neutral-500 hover:text-white" : "text-neutral-400 hover:text-neutral-800"
                      )}
                      title="Copy message"
                    >
                      Copy
                    </button>
                    {msg.role === "user" && (
                      <>
                        <span className={cn("text-[10px] select-none", isDark ? "text-neutral-800" : "text-neutral-200")}>|</span>
                        <button
                          onClick={() => handleEditMessage(i)}
                          className={cn(
                            "p-1 text-[9px] uppercase tracking-wider font-mono cursor-pointer",
                            isDark ? "text-neutral-500 hover:text-white" : "text-neutral-400 hover:text-neutral-800"
                          )}
                          title="Edit message"
                        >
                          Edit
                        </button>
                      </>
                    )}
                    {msg.role === "assistant" && i > 0 && (
                      <>
                        <span className={cn("text-[10px] select-none", isDark ? "text-neutral-800" : "text-neutral-200")}>|</span>
                        <button
                          onClick={() => handleRetry(i - 1)}
                          className={cn(
                            "p-1 text-[9px] uppercase tracking-wider font-mono cursor-pointer",
                            isDark ? "text-neutral-500 hover:text-white" : "text-neutral-400 hover:text-neutral-800"
                          )}
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
      <div className={cn("p-4 border-t shrink-0 w-full", isDark ? "border-neutral-900 bg-neutral-950" : "border-neutral-200 bg-white")}>
        <div className={cn(
          "relative border rounded p-2.5 transition-all shadow-sm",
          isDark
            ? "border-neutral-800/80 bg-neutral-900/50 hover:border-neutral-700/80 focus-within:border-neutral-700 focus-within:ring-1 focus-within:ring-neutral-700/30"
            : "border-neutral-200 bg-neutral-50 hover:border-neutral-300 focus-within:border-neutral-400 focus-within:ring-1 focus-within:ring-neutral-200"
        )}>
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
            className={cn(
              "w-full bg-transparent border-none text-[12.5px] focus:outline-none focus:ring-0 resize-none font-sans min-h-[44px] max-h-[200px]",
              isDark ? "text-neutral-200 placeholder:text-neutral-500" : "text-neutral-800 placeholder:text-neutral-400"
            )}
            style={{
              height: `${Math.min(200, Math.max(44, (input.split("\n").length || 1) * 18 + 12))}px`,
            }}
          />
          <div className={cn("flex items-center justify-between mt-2 pt-2 border-t", isDark ? "border-neutral-900/50" : "border-neutral-200/50")}>
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
    </aside>
  );
}
