'use client';
import { confirmDialog } from "@/components/providers/ConfirmRoot";


import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { salesSidebarConfig } from '@/config/sidebar/sales';
import { Send, Trash2, Archive, Plus, MessageSquare, Mic, Paperclip } from 'lucide-react';
import { useChatAttachments } from '@/lib/hooks/useChatAttachments';
import { tryAiCreateFlow } from '@/lib/ai/createFlow';
import { tryAiMemoryFlow } from '@/lib/ai/memoryFlow';
import { tryAiNavFlow } from '@/lib/ai/navFlow';
import { useAutoResizeTextarea } from '@/lib/hooks/useAutoResizeTextarea';
import { ChatAttachmentBar } from '@/components/ai/ChatAttachmentBar';
import { ShimmerSkeleton } from '@/components/ui/loading-skeletons';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AiMarkdown } from '@/components/ai/AiMarkdown';
import { toast } from 'sonner';
import { useSpeechToText } from '@/lib/hooks/useSpeechToText';

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

export default function SalesAIAssistant() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const { supported: micSupported, listening, transcribing, toggle: toggleMic } = useSpeechToText({
    onFinalText: (t) => setInput((prev) => (prev ? `${prev} ${t}` : t)),
    onError: (m) => toast.error(m),
  });
  const { attachments, addFiles, removeAttachment, handlePaste, fileInputRef, clear: clearAttachments } = useChatAttachments({ onError: (m) => toast.error(m) });
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [archivedChats, setArchivedChats] = useState<ChatHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useAutoResizeTextarea(textareaRef, input);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/sales');
    }
    // Any authenticated user (incl. admin / master-admin) may view this — the
    // old role gate bounced other roles to /auth/sales → their dashboard.
  }, [status, router, session]);

  useEffect(() => {
    // Only auto-follow the stream when the user is already near the bottom —
    // otherwise scrolling up to re-read is impossible while tokens arrive.
    const el = scrollContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (nearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchChatHistory();
    }
  }, [status]);

  const fetchChatHistory = async () => {
    try {
      setLoadingHistory(true);
      const response = await fetch('/api/sales/chat-history?includeArchived=true');
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
      toast.error('Failed to load chat', { description: 'This conversation could not be opened.' });
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
      const response = await fetch(`/api/sales/chat-history?chatId=${chatId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        if (currentChatId === chatId) {
          setMessages([]);
          setCurrentChatId(null);
        }
        await fetchChatHistory();
        toast.success('Chat deleted', {
          description: 'Chat has been permanently deleted.'
        });
      } else {
        throw new Error('Failed to delete chat');
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
      toast.error('Failed to delete chat. Please try again.');
    } finally {
      setDeletingChatId(null);
    }
  };

  const toggleArchive = async (chatId: string, isArchived: boolean, event: React.MouseEvent) => {
    event.stopPropagation();
    
    try {
      const response = await fetch('/api/sales/chat-history/archive', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, isArchived: !isArchived })
      });

      if (response.ok) {
        await fetchChatHistory();
        toast.success(isArchived ? 'Chat restored' : 'Chat archived', {
          description: isArchived ? 'Chat moved to recent chats' : 'Chat moved to archive'
        });
      }
    } catch (error) {
      console.error('Error toggling archive:', error);
      toast.error('Failed to update chat. Please try again.');
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setCurrentChatId(null);
    textareaRef.current?.focus();
    toast.success('New chat started', {
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
    clearAttachments();
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
          fetch('/api/sales/chat-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, messages: [
              { role: 'user', content: userInputText, timestamp: userMessage.timestamp },
              { role: 'assistant', content: outcome.message, timestamp: assistantMessage.timestamp },
            ] }),
          }).then((r) => r.ok && r.json()).then((saved) => {
            if (saved?.chat?._id) { setCurrentChatId(saved.chat._id); fetchChatHistory(); }
          }).catch(() => {});
        } else if (currentChatId) {
          const allMessages = [...messages.filter(m => !m.isLoading), userMessage, assistantMessage].map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp }));
          fetch('/api/sales/chat-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: currentChatId, messages: allMessages }),
          }).then(() => fetchChatHistory()).catch(() => {});
        }
        if (outcome.route) router.push(outcome.route);
        return;
      }
    } catch {
      /* fall through to the normal assistant on any unexpected error */
    }

    // AI "memory": real database lookups for factual questions about a
    // customer or invoice ("does this customer exist", "was an invoice
    // created in the first week of August", "show me invoices from last
    // month") — cheap regex-gated, so this is a no-op fetch skip for any
    // message that isn't plausibly a lookup. Falls through to normal Q&A on
    // anything it can't resolve.
    try {
      const priorTurnsForMemory = messages
        .filter(m => !m.isLoading && m.content)
        .map(m => ({ role: m.role, content: m.content }));
      const memOutcome = await tryAiMemoryFlow({ text: userInputText, history: priorTurnsForMemory });
      if (memOutcome.handled) {
        const assistantMessage: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: memOutcome.message || '', timestamp: new Date() };
        setMessages(prev => prev.filter(m => !m.isLoading).concat(assistantMessage));
        setIsLoading(false);
        if (isFirstMessage) {
          const title = userInputText.slice(0, 50).toUpperCase();
          fetch('/api/sales/chat-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, messages: [
              { role: 'user', content: userInputText, timestamp: userMessage.timestamp },
              { role: 'assistant', content: assistantMessage.content, timestamp: assistantMessage.timestamp },
            ] }),
          }).then((r) => r.ok && r.json()).then((saved) => {
            if (saved?.chat?._id) { setCurrentChatId(saved.chat._id); fetchChatHistory(); }
          }).catch(() => {});
        } else if (currentChatId) {
          const allMessages = [...messages.filter(m => !m.isLoading), userMessage, assistantMessage].map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp }));
          fetch('/api/sales/chat-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: currentChatId, messages: allMessages }),
          }).then(() => fetchChatHistory()).catch(() => {});
        }
        if (memOutcome.route) router.push(memOutcome.route);
        return;
      }
    } catch {
      /* fall through to the normal assistant on any unexpected error */
    }

    // AI navigation: "redirect to X" / "take me to X" / "open X" for ANY
    // feature in ANY module — resolved against the app's real sidebar routes
    // (lib/ai/navRoutes.ts), never guessed. Actually navigates instead of
    // just describing the click-path.
    try {
      const navOutcome = await tryAiNavFlow({ text: userInputText });
      if (navOutcome.handled) {
        const assistantMessage: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: navOutcome.message || '', timestamp: new Date() };
        setMessages(prev => prev.filter(m => !m.isLoading).concat(assistantMessage));
        setIsLoading(false);
        if (isFirstMessage) {
          const title = userInputText.slice(0, 50).toUpperCase();
          fetch('/api/sales/chat-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, messages: [
              { role: 'user', content: userInputText, timestamp: userMessage.timestamp },
              { role: 'assistant', content: assistantMessage.content, timestamp: assistantMessage.timestamp },
            ] }),
          }).then((r) => r.ok && r.json()).then((saved) => {
            if (saved?.chat?._id) { setCurrentChatId(saved.chat._id); fetchChatHistory(); }
          }).catch(() => {});
        } else if (currentChatId) {
          const allMessages = [...messages.filter(m => !m.isLoading), userMessage, assistantMessage].map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp }));
          fetch('/api/sales/chat-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: currentChatId, messages: allMessages }),
          }).then(() => fetchChatHistory()).catch(() => {});
        }
        if (navOutcome.route) router.push(navOutcome.route);
        return;
      }
    } catch {
      /* fall through to the normal assistant on any unexpected error */
    }

    try {
      // Prior conversation (this render's messages, before the new turn) is
      // sent for multi-turn context.
      const priorTurns = messages
        .filter(m => !m.isLoading && m.content)
        .map(m => ({ role: m.role, content: m.content }));

      const response = await fetch('/api/sales/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userInputText, stream: true, history: priorTurns, attachments: sentAttachments })
      });

      // Gated / error — surface the server's message instead of a blank reply.
      if (!response.ok || !response.body) {
        let msg = 'I apologize, but I encountered an error processing your request.';
        try { const j = await response.json(); if (j?.error) msg = j.error; } catch { /* not json */ }
        setMessages(prev => prev.filter(m => !m.isLoading).concat({
          id: (Date.now() + 1).toString(), role: 'assistant', content: msg, timestamp: new Date(),
        }));
        toast.error('Failed to get response. Please try again.');
        return;
      }

      // Stream deltas into a single live assistant bubble for an instant feel.
      const assistantId = (Date.now() + 1).toString();
      setMessages(prev => prev.filter(m => !m.isLoading).concat({
        id: assistantId, role: 'assistant', content: '', timestamp: new Date(),
      }));

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamed = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        streamed += decoder.decode(value, { stream: true });
        const current = streamed;
        setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, content: current } : m)));
      }
      const finalText = streamed.trim() || 'I apologize, but I encountered an error processing your request.';
      setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, content: finalText } : m)));

      // Persist via the chat-history CRUD route (single source of truth).
      if (isFirstMessage) {
        const title = userInputText.slice(0, 50).toUpperCase();
        const newMessages = [
          { role: 'user' as const, content: userInputText, timestamp: userMessage.timestamp },
          { role: 'assistant' as const, content: finalText, timestamp: new Date() },
        ];
        const saveResponse = await fetch('/api/sales/chat-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, messages: newMessages }),
        });
        if (saveResponse.ok) {
          const savedData = await saveResponse.json();
          setCurrentChatId(savedData.chat._id);
          await fetchChatHistory();
        }
      } else if (currentChatId) {
        // Rebuild the full transcript explicitly (avoids stale-closure saves).
        const allMessages = [
          ...priorTurns.map((m, i) => ({ role: m.role, content: m.content, timestamp: messages[i]?.timestamp || new Date() })),
          { role: 'user' as const, content: userInputText, timestamp: userMessage.timestamp },
          { role: 'assistant' as const, content: finalText, timestamp: new Date() },
        ];
        await fetch('/api/sales/chat-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: currentChatId, messages: allMessages }),
        });
        await fetchChatHistory();
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => prev.filter(msg => !msg.isLoading).concat({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again.',
        timestamp: new Date()
      }));
      toast.error('Failed to get response. Please try again.');
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
        sidebarConfig={salesSidebarConfig}
        dashboardTitle="Sales"
        userName="Sales User"
        userRole="sales"
        onSignOut={() => signOut({ callbackUrl: '/auth/sales' })}
        profileHref="/sales/profile"
      >
        <div className="flex h-[calc(100vh-8rem)] gap-4 bg-background p-4">
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
      sidebarConfig={salesSidebarConfig}
      dashboardTitle="Sales"
      userName={session?.user?.name || 'User'}
      userRole={session?.user?.role || 'sales'}
      onSignOut={() => signOut({ callbackUrl: '/auth/sales' })}
      profileHref="/sales/profile"
    >
      <div className="flex h-[calc(100vh-8rem)] ">
        {/* Chat History Sidebar */}
        <div className="w-64 border-r border-border bg-card/30 backdrop-blur-sm flex flex-col">
          <div className="p-4 border-b border-border flex-shrink-0">
            <Button 
              onClick={startNewChat}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
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
                      className={`p-2 rounded-none cursor-pointer transition-all group hover:bg-muted ${
                        currentChatId === chat._id ? 'bg-muted ring-1 ring-primary/40' : ''
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
                      className={`p-2 rounded-none cursor-pointer transition-all group hover:bg-muted ${
                        currentChatId === chat._id ? 'bg-muted ring-1 ring-primary/40' : ''
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
          <div className="p-4 border-b border-border bg-card/50 backdrop-blur-sm flex-shrink-0">
            <h2 className="text-xl font-bold text-foreground">
              {currentChatId ? chatHistory.find(c => c._id === currentChatId)?.title || 'Sales AI Assistant' : 'Sales AI Assistant'}
            </h2>
          </div>

          {/* Messages Area with Scroll */}
          <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Sales AI Assistant</h2>
                <p className="text-muted-foreground max-w-md">
                  Ask me anything about your orders, revenue, products, quotations, or sales reports.
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
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />
                        <span className="text-sm">Thinking...</span>
                      </div>
                    ) : message.role === 'assistant' ? (
                      <AiMarkdown content={message.content} />
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed m-0">{message.content}</p>
                    )}
                  </div>
                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-muted text-foreground flex items-center justify-center shrink-0">
                      <span className="text-sm font-medium">
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
          <div className="p-4 border-t border-border bg-card/50 backdrop-blur-sm flex-shrink-0">
            <ChatAttachmentBar attachments={attachments} removeAttachment={removeAttachment} fileInputRef={fileInputRef} addFiles={addFiles} />
            <form onSubmit={handleSubmit} className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder="Ask Anything"
                  className="min-h-[60px] max-h-[200px] resize-none bg-background border-border text-foreground placeholder:text-muted-foreground pl-10 pr-10"
                />
                <Button type="button" size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={isLoading} title="Attach a document or image" className="absolute left-2 bottom-2 h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                  <Paperclip className="w-4 h-4" />
                </Button>
                {micSupported && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={toggleMic}
                    disabled={isLoading || transcribing}
                    title={listening ? "Stop and transcribe" : transcribing ? "Transcribing…" : "Speak your message"}
                    className={`absolute right-2 bottom-2 h-8 w-8 p-0 ${listening ? "text-red-500 animate-pulse" : transcribing ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Mic className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <Button
                type="submit"
                disabled={isLoading || (!input.trim() && attachments.length === 0)}
                className="h-[60px] px-6 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </form>
            <div className="text-xs text-muted-foreground text-center mt-2">
              AI Assistant for Sales • Powered by Aupulens
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
