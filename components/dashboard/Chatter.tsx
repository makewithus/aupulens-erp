import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ChatMessage {
  authorId: any; // Populated User or ID
  body: string;
  type: "comment" | "notification";
  createdAt: string | Date;
}

interface ChatterProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  className?: string;
  isViewOnly?: boolean;
}

export function Chatter({
  messages = [],
  onSendMessage,
  className,
  isViewOnly,
}: ChatterProps) {
  const [newMessage, setNewMessage] = useState("");

  const handleSend = () => {
    if (!newMessage.trim()) return;
    onSendMessage(newMessage);
    setNewMessage("");
  };

  return (
    <div className={`border-t pt-4 mt-6 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold text-lg">Log & Chatter</h3>
      </div>

      <div className="space-y-4 max-h-[300px] overflow-y-auto mb-4 bg-muted/20 p-4 rounded-md">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center italic">
            No messages yet.
          </p>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${msg.type === "notification" ? "opacity-70" : ""}`}
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={msg.authorId?.image} />
                <AvatarFallback>
                  {msg.authorId?.name?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <span className="text-sm font-bold">
                    {msg.authorId?.name || "System"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {msg.createdAt
                      ? formatDistanceToNow(new Date(msg.createdAt), {
                          addSuffix: true,
                        })
                      : "Just now"}
                  </span>
                </div>
                <p className="text-sm mt-1 whitespace-pre-wrap">{msg.body}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {!isViewOnly && (
        <div className="flex gap-2">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Leave a note..."
            className="min-h-[60px]"
          />
          <Button
            onClick={handleSend}
            size="icon"
            className="h-[60px] w-[60px]"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
