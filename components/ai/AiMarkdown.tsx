"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Shared assistant-message renderer used by every AI surface (module assistant
 * pages + the global AI sidebar). Turns the model's markdown into clean,
 * ChatGPT/Claude-style output — no raw `**`, `###`, or `-` bullets leaking to
 * the user — and is fully theme-aware (uses design tokens, so it reads well in
 * both light and dark without an `isDark` prop).
 */
export function AiMarkdown({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        "text-sm leading-relaxed text-foreground break-words",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          h1: ({ children }) => <h1 className="mt-4 mb-2 text-base font-bold text-foreground">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-4 mb-2 text-[15px] font-bold text-foreground">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-3 mb-1.5 text-sm font-semibold text-foreground">{children}</h3>,
          h4: ({ children }) => <h4 className="mt-3 mb-1.5 text-sm font-semibold text-foreground">{children}</h4>,
          ul: ({ children }) => <ul className="my-2 ml-1 list-disc space-y-1 pl-4 marker:text-muted-foreground">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 ml-1 list-decimal space-y-1 pl-4 marker:text-muted-foreground">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed pl-0.5">{children}</li>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground italic">{children}</blockquote>
          ),
          hr: () => <hr className="my-3 border-border" />,
          code: ({ className: cls, children, ...props }: any) => {
            const isBlock = /language-(\w+)/.test(cls || "");
            if (isBlock) {
              return (
                <pre className="my-3 overflow-x-auto rounded-md border border-border bg-muted/60 p-3 text-xs leading-relaxed">
                  <code className="font-mono" {...props}>{children}</code>
                </pre>
              );
            }
            return (
              <code className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...props}>
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-md border border-border">
              <table className="w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
          th: ({ children }) => <th className="border-b border-border px-3 py-2 font-semibold text-foreground">{children}</th>,
          td: ({ children }) => <td className="border-b border-border/60 px-3 py-2">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default AiMarkdown;
