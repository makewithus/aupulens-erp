'use client';
import { confirmDialog } from "@/components/providers/ConfirmRoot";


import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { inventorySidebarConfig } from '@/config/sidebar/inventory';
import { Send, Trash2, Archive, Plus, MessageSquare, Mic, Paperclip, X } from 'lucide-react';
import { AiMarkdown } from '@/components/ai/AiMarkdown';
import { ShimmerSkeleton } from '@/components/ui/loading-skeletons';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useSpeechToText } from '@/lib/hooks/useSpeechToText';
import { Toaster } from '@/components/ui/toaster';
import { tryAiCreateFlow } from '@/lib/ai/createFlow';
import { useAutoResizeTextarea } from '@/lib/hooks/useAutoResizeTextarea';

interface Message {
  id: string;
  role: 'user' | 'assistant';
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
  messages: {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }[];
}

export default function InventoryAIAssistant() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Voice-to-text (Azure) — speak your question; transcript is appended.
  const { supported: micSupported, listening, transcribing, toggle: toggleMic } = useSpeechToText({
    onFinalText: (t) => setInput((prev) => (prev ? `${prev} ${t}` : t)),
    onError: (m) => toast({ title: 'Microphone', description: m }),
  });

  // File attachments (PDF / DOCX / images) — multiple; paste supported. Sent
  // with the message so the assistant can read documents/screenshots.
  type Attachment = { name: string; type: string; dataUrl: string };
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const MAX_ATTACHMENTS = 8;
  const addFiles = (files: FileList | File[] | null | undefined) => {
    for (const file of files ? Array.from(files) : []) {
      if (!file) continue;
      if (file.size > MAX_FILE_BYTES) { toast({ title: 'File too large', description: `"${file.name || 'A file'}" exceeds 8 MB.` }); continue; }
      const name = file.name || (file.type.startsWith('image/') ? `pasted-image.${file.type.split('/')[1] || 'png'}` : 'pasted-file');
      const reader = new FileReader();
      reader.onload = () => setAttachments((prev) => (prev.length >= MAX_ATTACHMENTS ? prev : [...prev, { name, type: file.type, dataUrl: reader.result as string }]));
      reader.readAsDataURL(file);
    }
  };
  const removeAttachment = (i: number) => setAttachments((prev) => prev.filter((_, idx) => idx !== i));
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items; if (!items) return;
    const files: File[] = [];
    for (const it of Array.from(items)) { if (it.kind === 'file') { const f = it.getAsFile(); if (f) files.push(f); } }
    if (files.length) { e.preventDefault(); addFiles(files); }
  };
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [archivedChats, setArchivedChats] = useState<ChatHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useAutoResizeTextarea(textareaRef, input);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/inventory');
    }
    // Any authenticated user (incl. admin / master-admin) may view this — the
    // old role gate bounced other roles to /auth/inventory → their dashboard.
  }, [status, router, session]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchChatHistory();
    }
  }, [status]);

  const fetchChatHistory = async () => {
    try {
      setLoadingHistory(true);
      const response = await fetch('/api/inventory/chat-history?includeArchived=true');
      if (response.ok) {
        const data = await response.json();
        const active = data.chats.filter((chat: ChatHistoryItem) => !chat.isArchived);
        const archived = data.chats.filter((chat: ChatHistoryItem) => chat.isArchived);
        setChatHistory(active);
        setArchivedChats(archived);
      }
    } catch (error) {
      console.error('Error fetching chat history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const saveCurrentChat = async () => {
    if (!currentChatId || messages.length === 0) return;

    try {
      const chatMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      }));

      await fetch('/api/inventory/chat-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: currentChatId,
          messages: chatMessages
        })
      });
    } catch (error) {
      console.error('Error saving chat:', error);
    }
  };

  const loadChat = (chat: ChatHistoryItem) => {
    // No success toast on load — only surface a failure if it can't be opened.
    try {
      if (!chat || !Array.isArray(chat.messages)) throw new Error('Chat not found');
      const loadedMessages: Message[] = chat.messages.map((msg, idx) => ({
        id: `${chat._id}-${idx}`,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp)
      }));
      setMessages(loadedMessages);
      setCurrentChatId(chat._id);
    } catch {
      toast({ title: 'Failed to load chat', description: 'This conversation could not be opened.' });
    }
  };

  const deleteChat = async (chatId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (deletingChatId) return;
    
    if (!await confirmDialog({ title: 'Are you sure you want to delete this chat?' })) {
      return;
    }

    try {
      setDeletingChatId(chatId);
      const response = await fetch(`/api/inventory/chat-history?chatId=${chatId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        if (currentChatId === chatId) {
          setMessages([]);
          setCurrentChatId(null);
        }
        await fetchChatHistory();
        toast({
          title: 'Chat deleted',
          description: 'Chat has been permanently deleted.'
        });
      } else {
        throw new Error('Failed to delete chat');
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete chat. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setDeletingChatId(null);
    }
  };

  const toggleArchive = async (chatId: string, isArchived: boolean, event: React.MouseEvent) => {
    event.stopPropagation();
    
    try {
      const response = await fetch('/api/inventory/chat-history/archive', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, isArchived: !isArchived })
      });

      if (response.ok) {
        await fetchChatHistory();
        toast({
          title: isArchived ? 'Chat restored' : 'Chat archived',
          description: isArchived ? 'Chat moved to recent chats' : 'Chat moved to archive'
        });
      }
    } catch (error) {
      console.error('Error toggling archive:', error);
      toast({
        title: 'Error',
        description: 'Failed to update chat. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setCurrentChatId(null);
    textareaRef.current?.focus();
    toast({
      title: 'New chat started',
      description: 'Start a fresh conversation'
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    const isFirstMessage = messages.length === 0;
    const sentAttachments = attachments;
    const userInputText = input.trim() || (sentAttachments.length ? 'Please read the attached file(s) and help accordingly.' : '');
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userInputText,
      timestamp: new Date()
    };

    const loadingMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true
    };

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setInput('');
    setAttachments([]);
    setIsLoading(true);

    // AI-native create: try this FIRST. If the message is a create request —
    // for THIS module's forms or any OTHER module's — extract the fields and
    // take the user straight to the real, pre-filled form instead of just
    // describing the steps. Falls through to normal Q&A otherwise.
    try {
      const outcome = await tryAiCreateFlow({ text: userInputText, attachments: sentAttachments });
      if (outcome.handled) {
        const assistantMessage: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: outcome.message, timestamp: new Date() };
        setMessages(prev => prev.filter(m => !m.isLoading).concat(assistantMessage));
        setIsLoading(false);
        // Persist this turn just like a normal Q&A reply, so it shows up in
        // Recent Chats and the user can pick the thread back up later.
        if (isFirstMessage) {
          const title = userInputText.slice(0, 50).toUpperCase();
          fetch('/api/inventory/chat-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, messages: [
              { role: 'user', content: userInputText, timestamp: userMessage.timestamp },
              { role: 'assistant', content: outcome.message, timestamp: assistantMessage.timestamp },
            ] }),
          }).then((r) => r.ok && r.json()).then((saved) => {
            if (saved?.chat?._id) { setCurrentChatId(saved.chat._id); fetchChatHistory(); }
          }).catch(() => {});
        } else {
          setTimeout(() => saveCurrentChat(), 500);
        }
        if (outcome.route) router.push(outcome.route);
        return;
      }
    } catch {
      /* fall through to the normal assistant on any unexpected error */
    }

    try {
      const response = await fetch('/api/inventory/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userInputText, attachments: sentAttachments })
      });

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || 'I apologize, but I encountered an error processing your request.',
        timestamp: new Date()
      };

      setMessages(prev => prev.filter(msg => !msg.isLoading).concat(assistantMessage));

      if (isFirstMessage) {
        const title = userInputText.slice(0, 50).toUpperCase();
        const newMessages = [
          {
            role: 'user' as const,
            content: userInputText,
            timestamp: userMessage.timestamp
          },
          {
            role: 'assistant' as const,
            content: data.response,
            timestamp: assistantMessage.timestamp
          }
        ];

        const saveResponse = await fetch('/api/inventory/chat-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            messages: newMessages
          })
        });

        if (saveResponse.ok) {
          const savedData = await saveResponse.json();
          setCurrentChatId(savedData.chat._id);
          await fetchChatHistory();
          toast({
            title: 'Chat saved',
            description: 'New conversation started and saved.'
          });
        }
      } else {
        setTimeout(() => saveCurrentChat(), 500);
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => prev.filter(msg => !msg.isLoading).concat({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again.',
        timestamp: new Date()
      }));
      toast({
        title: 'Error',
        description: 'Failed to get response. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  if (status === 'loading') {
    return (
      <DashboardLayout
        sidebarConfig={inventorySidebarConfig}
        dashboardTitle="inventory Dashboard"
        userName="Inventory User"
        userRole="inventory"
        onSignOut={() => signOut({ callbackUrl: '/auth/inventory' })}
        profileHref="/inventory/profile"
      >
        <div className="flex h-[calc(100vh-8rem)] gap-4 bg-gradient-to-br from-gray-950 via-black to-gray-900 p-4">
          <div className="w-64 border-r border-border pr-4 space-y-2">
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

  if (!session) return null;

  return (
    <DashboardLayout
      sidebarConfig={inventorySidebarConfig}
      dashboardTitle="inventory Dashboard"
      userName={session?.user?.name || 'User'}
      userRole={session?.user?.role || 'inventory'}
      onSignOut={() => signOut({ callbackUrl: '/auth/inventory' })}
      profileHref="/inventory/profile"
    >
      <Toaster />
      <div className="flex h-[calc(100vh-8rem)] ">
        {/* Chat History Sidebar */}
        <div className="w-64 border-r border-border bg-background/30 backdrop-blur-sm flex flex-col">
          <div className="p-4 border-b border-border flex-shrink-0">
            <Button 
              onClick={startNewChat}
              className="w-full bg-blue-800"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Chat
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Recent Chats */}
            <div className="p-3">
              <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center">
                <MessageSquare className="w-3 h-3 mr-1" />
                Recent Chats
              </h3>
              {loadingHistory ? (
                <div className="flex justify-center py-4">
                  <div className="w-4 h-4 border-2 border-border border-t-transparent rounded-full animate-spin" />
                </div>
              ) : chatHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No chat history yet</p>
              ) : (
                <div className="space-y-1">
                  {chatHistory.map((chat) => (
                    <div
                      key={chat._id}
                      onClick={() => loadChat(chat)}
                      className={`p-2 rounded-none cursor-pointer transition-all group hover:bg-accent/50 ${
                        currentChatId === chat._id ? 'bg-accent/70 ring-1 ring-blue-500/50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate" title={chat.title}>
                            {chat.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(chat.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-blue-400"
                            onClick={(e) => toggleArchive(chat._id, chat.isArchived, e)}
                            title="Archive"
                          >
                            <Archive className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                            onClick={(e) => deleteChat(chat._id, e)}
                            disabled={deletingChatId === chat._id}
                            title="Delete"
                          >
                            {deletingChatId === chat._id ? (
                              <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Archived Chats */}
            {archivedChats.length > 0 && (
              <div className="p-3 border-t border-border">
                <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center">
                  <Archive className="w-3 h-3 mr-1" />
                  Archived Chats
                </h3>
                <div className="space-y-1">
                  {archivedChats.map((chat) => (
                    <div
                      key={chat._id}
                      onClick={() => loadChat(chat)}
                      className={`p-2 rounded-none cursor-pointer transition-all group hover:bg-accent/50 ${
                        currentChatId === chat._id ? 'bg-accent/70 ring-1 ring-blue-500/50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-muted-foreground truncate" title={chat.title}>
                            {chat.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(chat.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-blue-400"
                            onClick={(e) => toggleArchive(chat._id, chat.isArchived, e)}
                            title="Restore"
                          >
                            <MessageSquare className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                            onClick={(e) => deleteChat(chat._id, e)}
                            disabled={deletingChatId === chat._id}
                            title="Delete"
                          >
                            {deletingChatId === chat._id ? (
                              <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Chat Title Header */}
          <div className="p-4 border-b border-border bg-background/50 backdrop-blur-sm flex-shrink-0">
            <h2 className="text-xl font-bold text-foreground">
              {currentChatId ? chatHistory.find(c => c._id === currentChatId)?.title || 'inventory AI Assistant' : 'inventory AI Assistant'}
            </h2>
          </div>

          {/* Messages Area with Scroll */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-full  flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">inventory AI Assistant</h2>
                <p className="text-muted-foreground max-w-md">
                  Ask me anything about your inventorys, ledgers, transactions, assets, or reports.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    {message.isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-border border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm">Thinking...</span>
                      </div>
                    ) : message.role === 'assistant' ? (
                      <AiMarkdown content={message.content} />
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed m-0">{message.content}</p>
                    )}
                  </div>
                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-medium text-foreground">
                        {session?.user?.name?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input at Bottom */}
          <div className="p-4 border-t border-border bg-background/50 backdrop-blur-sm flex-shrink-0">
            {attachments.length > 0 && (
              <div className="mb-2 flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
                {attachments.map((att, i) => (
                  <span key={i} title={att.name} className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-card text-[11px] text-foreground shrink-0 max-w-[180px]">
                    <Paperclip className="w-3 h-3 shrink-0 text-blue-400" />
                    <span className="truncate">{att.name}</span>
                    <button type="button" onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-red-400 shrink-0"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt,.csv"
              className="hidden"
              onChange={(e) => { addFiles(e.target.files); if (e.target) e.target.value = ''; }}
            />
            <form onSubmit={handleSubmit} className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder="Ask me about inventory, ledgers, transactions, reports..."
                  className="min-h-[60px] max-h-[200px] resize-none bg-card/50 border-border text-foreground placeholder:text-muted-foreground pl-10 pr-10"
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  title="Attach a document or image"
                  className="absolute left-2 bottom-2 h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                >
                  <Paperclip className="w-4 h-4" />
                </Button>
                {micSupported && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={toggleMic}
                    disabled={isLoading || transcribing}
                    title={listening ? 'Stop and transcribe' : transcribing ? 'Transcribing…' : 'Speak your message'}
                    className={`absolute right-2 bottom-2 h-8 w-8 p-0 ${listening ? 'text-red-400 animate-pulse' : transcribing ? 'text-blue-400' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <Mic className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <Button
                type="submit"
                disabled={isLoading || (!input.trim() && attachments.length === 0)}
                className="h-[60px] px-6 bg-blue-800"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </form>
            <div className="text-xs text-muted-foreground text-center mt-2">
              AI Assistant for inventory • Powered by Aupulens
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
