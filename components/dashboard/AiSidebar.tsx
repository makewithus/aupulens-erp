'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Send, Sparkles, Bot, User, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

export function AiSidebar({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [messages, setMessages] = useState<{ role: string; text: string; isLoading?: boolean }[]>([
    { role: 'assistant', text: 'Hello! I am Aupulens Assistant. How can I help you manage your CRM today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userText = input;
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setInput('');
    setIsLoading(true);

    // Add temporary loading message
    setMessages(prev => [...prev, { role: 'assistant', text: '', isLoading: true }]);

    try {
      const response = await fetch("/api/admin/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1] = { role: 'assistant', text: data.response };
        return newMsgs;
      });

      // Save to chat history
      await fetch("/api/admin/chat-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: userText.slice(0, 50),
          messages: [
            { role: 'user', content: userText, timestamp: new Date() },
            { role: 'assistant', content: data.response, timestamp: new Date() }
          ]
        })
      });
      
    } catch (error) {
      console.error("Error:", error);
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1] = { role: 'assistant', text: "Sorry, I encountered an error. Please try again." };
        return newMsgs;
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <aside 
      className={cn(
        "bg-neutral-950 flex flex-col flex-shrink-0 animate-in slide-in-from-right transition-all duration-300 ease-in-out shadow-2xl",
        "absolute inset-y-0 right-0 z-50 w-full max-w-[400px] sm:relative sm:w-[350px] sm:max-w-none h-full border-l border-white/5"
      )}
    >
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-white/5 bg-neutral-950/80 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <h2 className="font-semibold text-sm tracking-wide text-neutral-100">Aupulens Assistant</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => {
              onClose();
              router.push('/admin/ai-assistant');
            }} 
            className="h-8 w-8 text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
            title="Open Full Screen AI Assistant"
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-neutral-400 hover:text-white hover:bg-red-500/20 hover:text-red-400 transition-colors">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-gradient-to-b from-neutral-950 to-neutral-900/50 youtube-scrollbar">
        {messages.map((msg, i) => (
          <div key={i} className={cn('flex gap-4 max-w-full', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
            
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-md', 
              msg.role === 'user' 
                ? 'bg-neutral-800 border border-neutral-700 text-neutral-300' 
                : 'bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-purple-500/30 text-purple-400'
            )}>
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div className={cn(
              'px-4 py-3 text-[13px] leading-relaxed max-w-[90%] sm:max-w-[85%] shadow-sm', 
              msg.role === 'user' 
                ? 'bg-neutral-800 text-neutral-100 rounded-2xl rounded-tr-sm border border-neutral-700/50' 
                : 'bg-neutral-900/80 text-neutral-300 rounded-2xl rounded-tl-sm border border-white/5 backdrop-blur-sm'
            )}>
              {msg.isLoading ? (
                <div className="flex items-center gap-2 text-purple-400">
                  <div className="h-3 w-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">Thinking...</span>
                </div>
              ) : (
                msg.text
              )}
            </div>
            
          </div>
        ))}
        <div ref={endOfMessagesRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-white/5 bg-neutral-950 shrink-0 w-full">
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="relative flex items-center w-full">
          <Input 
            value={input} 
            onChange={e => setInput(e.target.value)}
            disabled={isLoading}
            placeholder="Message Aupulens Assistant..." 
            className="w-full pl-4 pr-12 py-6 bg-neutral-900 border-white/10 hover:border-white/20 focus-visible:ring-1 focus-visible:ring-purple-500/50 rounded-2xl text-[13px] text-neutral-200 placeholder:text-neutral-500 transition-all shadow-inner"
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
        </form>
        <p className="text-center text-[10px] text-neutral-500 mt-3 font-medium tracking-wide">
          Aupulens Assistant can make mistakes. Consider verifying critical info.
        </p>
      </div>
    </aside>
  );
}
