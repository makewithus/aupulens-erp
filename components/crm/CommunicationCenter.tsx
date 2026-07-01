'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, MessageSquare, Phone, Mail, Clock } from "lucide-react";
import { toast } from "sonner";

interface CommunicationCenterProps {
  recordId: string;
  recordType: "Lead" | "Account" | "Contact" | "Opportunity" | "Case" | "Contract";
  ownerId?: string;
}

export default function CommunicationCenter({ recordId, recordType }: CommunicationCenterProps) {
  const [comms, setComms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState("Email");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchComms();
  }, [recordId]);

  const fetchComms = async () => {
    const res = await fetch(`/api/crm/communications?recordId=${recordId}`);
    const data = await res.json();
    if (data.success) {
      setComms(data.data);
    }
    setLoading(false);
  };

  const handleSend = async () => {
    if (!message) return toast.error("Message is required");
    
    setSending(true);
    const payload = {
      recordId,
      recordType,
      channel,
      direction: "outbound",
      message,
      subject: channel === "Email" ? subject : undefined,
      sender: "current_user", // Will be overridden by session.user.id on server
      recipient: "record_email_or_phone", // Dynamic in real app
    };

    const res = await fetch("/api/crm/communications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (data.success) {
      toast.success(`${channel} sent`);
      setMessage("");
      setSubject("");
      fetchComms();
    } else {
      toast.error(data.message || "Failed to send");
    }
    setSending(false);
  };

  const getChannelIcon = (c: string) => {
    switch(c) {
      case "Email": return <Mail className="w-4 h-4" />;
      case "WhatsApp": case "SMS": return <MessageSquare className="w-4 h-4" />;
      case "Phone Call": return <Phone className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900 border border-neutral-800 rounded-lg">
      <div className="p-4 border-b border-neutral-800">
        <div className="flex gap-2 mb-4">
          {["Email", "WhatsApp", "SMS", "Phone Call", "Internal Comment"].map(c => (
            <Button 
              key={c}
              size="sm" 
              variant={channel === c ? "default" : "outline"}
              onClick={() => setChannel(c)}
              className="h-8 text-xs"
            >
              {getChannelIcon(c)} <span className="ml-2 hidden sm:inline">{c}</span>
            </Button>
          ))}
        </div>
        
        {channel === "Email" && (
          <Input 
            value={subject} onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject..." className="mb-2 bg-neutral-950 border-neutral-800 text-sm h-8" 
          />
        )}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`Compose ${channel}...`}
          className="w-full h-24 bg-neutral-950 border border-neutral-800 rounded p-2 text-sm text-neutral-200 resize-none focus:outline-none focus:border-neutral-600"
        ></textarea>
        
        <div className="flex justify-between items-center mt-2">
          <Button variant="ghost" size="sm" className="h-8 text-xs text-neutral-400">Use Template</Button>
          <Button size="sm" className="h-8 text-xs bg-primary" onClick={handleSend} disabled={sending}>
            {sending ? "Sending..." : "Send"} <Send className="w-3 h-3 ml-2" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[500px]">
        {loading ? (
          <div className="text-center text-neutral-500 text-sm">Loading timeline...</div>
        ) : comms.length === 0 ? (
          <div className="text-center text-neutral-500 text-sm py-10 border border-dashed border-neutral-800 rounded">
            No communications yet.
          </div>
        ) : (
          comms.map(comm => (
            <div key={comm._id} className="flex gap-3">
              <div className={`mt-1 p-2 rounded-full h-8 w-8 flex items-center justify-center ${
                comm.direction === 'inbound' ? 'bg-blue-900/30 text-blue-400' : 'bg-neutral-800 text-neutral-400'
              }`}>
                {getChannelIcon(comm.channel)}
              </div>
              <div className="flex-1 bg-neutral-950 border border-neutral-800 rounded p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-semibold text-sm mr-2">{comm.sender === 'current_user' ? 'You' : comm.sender}</span>
                    <span className="text-xs text-neutral-500">to {comm.recipient}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-neutral-500">{new Date(comm.createdAt).toLocaleString()}</span>
                    <Badge variant="outline" className={`text-[10px] h-4 px-1 ${
                      comm.status === 'Sent' ? 'border-green-900/50 text-green-500' : ''
                    }`}>{comm.status}</Badge>
                  </div>
                </div>
                {comm.subject && <div className="font-medium text-sm mb-1">{comm.subject}</div>}
                <div className="text-sm text-neutral-300 whitespace-pre-wrap">{comm.message}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
