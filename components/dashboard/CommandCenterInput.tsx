"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Mic, X, Sparkles, Loader2, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CommandCenterInput() {
  const [query, setQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  
  // Speech recognition setup (browser dependent)
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setQuery(transcript);
        handleProcessCommand(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
        toast.error("Microphone error. Please try again.");
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (recognitionRef.current) {
        setQuery("");
        recognitionRef.current.start();
        setIsListening(true);
        toast.info("Listening...");
      } else {
        toast.error("Speech recognition not supported in this browser.");
      }
    }
  };

  const handleProcessCommand = async (command: string) => {
    if (!command.trim()) return;
    setIsProcessing(true);
    
    try {
      // Fake processing delay for visual effect
      await new Promise((resolve) => setTimeout(resolve, 800));
      
      // Send the command and the current pathname context to the AI endpoint
      const res = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          command, 
          context: { pathname } 
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to process command");
      }

      const data = await res.json();
      
      if (data.action === "navigate" && data.url) {
        toast.success(`Navigating: ${data.message || 'Done'}`);
        router.push(data.url);
      } else if (data.action === "action") {
        toast.success(data.message || "Command executed successfully");
        if (data.refresh) {
          router.refresh();
        }
      } else {
        toast.info(data.message || "Command understood, no action taken");
      }
      
      setQuery("");
    } catch (error) {
      console.error(error);
      toast.error("Sorry, I couldn't process that command.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleProcessCommand(query);
  };

  return (
    <form onSubmit={handleSubmit} className="relative hidden lg:flex items-center">
      <div className="relative group flex items-center">
        <Sparkles className={cn("absolute left-3 h-4 w-4 transition-colors", isProcessing ? "text-primary animate-pulse" : "text-muted-foreground group-focus-within:text-primary")} />
        <Input
          type="text"
          placeholder="Ask AI to do something..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isProcessing}
          className="w-64 xl:w-80 pl-9 pr-14 h-9 bg-muted/50 border-border/60 focus:bg-background rounded-full focus:ring-1 focus:ring-primary focus:border-primary transition-all text-sm placeholder:text-xs"
        />
        <div className="absolute right-1 flex items-center gap-0.5">
          {query && !isProcessing && (
             <Button
               type="button"
               variant="ghost"
               size="icon"
               onClick={() => setQuery("")}
               className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
             >
               <X className="h-3 w-3" />
             </Button>
          )}
          {query && !isProcessing ? (
             <Button
               type="submit"
               variant="ghost"
               size="icon"
               className="h-7 w-7 rounded-full text-primary hover:text-primary hover:bg-primary/10"
             >
               <Send className="h-3.5 w-3.5" />
             </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleListen}
              disabled={isProcessing}
              className={cn("h-7 w-7 rounded-full", isListening ? "text-red-500 bg-red-500/10 hover:bg-red-500/20" : "text-muted-foreground hover:text-foreground")}
            >
              {isProcessing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <Mic className={cn("h-3.5 w-3.5", isListening && "animate-pulse")} />
              )}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
