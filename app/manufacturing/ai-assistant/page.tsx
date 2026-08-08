'use client';
import { confirmDialog } from "@/components/providers/ConfirmRoot";


import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { manufacturingSidebarConfig } from '@/config/sidebar/manufacturing';
import { Send, Trash2, Archive, Plus, MessageSquare, Mic } from 'lucide-react';
import { AiMarkdown } from '@/components/ai/AiMarkdown';
import { ShimmerSkeleton } from '@/components/ui/loading-skeletons';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Toaster } from '@/components/ui/toaster';

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

export default function ManufacturingAIAssistant() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [archivedChats, setArchivedChats] = useState<ChatHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<any>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [currentTask, setCurrentTask] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/manufacturing');
    } else if (status === 'authenticated' && session?.user?.role !== 'manufacturing' && session?.user?.role !== 'admin') {
      router.push('/auth/manufacturing');
    }
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
      const response = await fetch('/api/manufacturing/chat-history?includeArchived=true');
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

      await fetch('/api/manufacturing/chat-history', {
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
      const response = await fetch(`/api/manufacturing/chat-history?chatId=${chatId}`, {
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
      const response = await fetch('/api/manufacturing/chat-history/archive', {
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
    if (!input.trim() || isLoading) return;

    const isFirstMessage = messages.length === 0;
    const userInputText = input.trim();
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
    setIsLoading(true);

    try {
      // A typed message is NEVER auto-interpreted as a confirmation. Executing
      // a data mutation requires an explicit click on the Confirm button below
      // (handleConfirmAction) — typing "yes" no longer triggers execution, so an
      // ambiguous reply like "yes, but change the qty" can't silently run.
      const response = await fetch('/api/manufacturing/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userInputText,
          confirmAction: false,
          actionData: null,
          currentTask: currentTask,
          cancelAction: false
        })
      });

      const data = await response.json();

      // Handle pending action for confirmation
      if (data.pendingAction) {
        setPendingAction(data.pendingAction);
        setIsConfirming(true);
      } else {
        // Clear pending action if user confirmed, cancelled, or action was completed
        setPendingAction(null);
        setIsConfirming(false);
      }

      // Handle current task context for continuations
      if (data.taskIntent && data.taskIntent !== 'none') {
        setCurrentTask({
          intent: data.taskIntent,
          providedData: data.providedData || {},
          missingFields: data.missingFields || [],
          requiresConfirmation: data.requiresConfirmation || false
        });
      } else if (!data.pendingAction && !data.success) {
        // Clear task context if not continuing a task and not a successful execution
        setCurrentTask(null);
      }

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

        const saveResponse = await fetch('/api/manufacturing/chat-history', {
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

  // Explicit confirm/cancel of a pending action — the ONLY way to execute a
  // data mutation from the assistant (replaces the old keyword matching on the
  // typed message). Triggered by the Confirm / Cancel buttons rendered below
  // the assistant's confirmation prompt.
  const resolvePendingAction = async (confirm: boolean) => {
    if (!pendingAction || isLoading) return;
    setIsLoading(true);
    setMessages(prev => [...prev, {
      id: (Date.now() + 2).toString(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    }]);

    try {
      const response = await fetch('/api/manufacturing/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: confirm ? 'Confirm action' : 'Cancel action',
          confirmAction: confirm,
          actionData: confirm ? pendingAction : null,
          cancelAction: !confirm,
          currentTask,
        }),
      });
      const data = await response.json();

      // Either path clears the pending action — it has now been resolved.
      setPendingAction(null);
      setIsConfirming(false);
      if (!data.pendingAction) setCurrentTask(null);

      setMessages(prev => prev.filter(msg => !msg.isLoading).concat({
        id: (Date.now() + 3).toString(),
        role: 'assistant',
        content: data.response || (confirm ? 'Action completed.' : 'Action cancelled.'),
        timestamp: new Date(),
      }));

      // Persist the updated conversation.
      if (currentChatId) await saveCurrentChat();
    } catch (error) {
      console.error('Error resolving action:', error);
      setMessages(prev => prev.filter(msg => !msg.isLoading).concat({
        id: (Date.now() + 3).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error resolving that action. Please try again.',
        timestamp: new Date(),
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAction = () => resolvePendingAction(true);
  const handleCancelAction = () => resolvePendingAction(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  if (status === 'loading') {
    return (
      <DashboardLayout
        sidebarConfig={manufacturingSidebarConfig}
        dashboardTitle="manufacturing Dashboard"
        userName="Manufacturing User"
        userRole="manufacturing"
        onSignOut={() => signOut({ callbackUrl: '/auth/manufacturing' })}
        profileHref="/manufacturing/profile"
      >
        <div className="flex h-[calc(100vh-8rem)] gap-4 bg-gradient-to-br from-gray-950 via-black to-gray-900 p-4">
          <div className="w-64 border-r border-gray-800 pr-4 space-y-2">
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
      sidebarConfig={manufacturingSidebarConfig}
      dashboardTitle="manufacturing Dashboard"
      userName={session?.user?.name || 'User'}
      userRole={session?.user?.role || 'manufacturing'}
      onSignOut={() => signOut({ callbackUrl: '/auth/manufacturing' })}
      profileHref="/manufacturing/profile"
    >
      <Toaster />
      <div className="flex h-[calc(100vh-8rem)] ">
        {/* Chat History Sidebar */}
        <div className="w-64 border-r border-gray-800 bg-gray-950/30 backdrop-blur-sm flex flex-col">
          <div className="p-4 border-b border-gray-800 flex-shrink-0">
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
              <h3 className="text-xs font-semibold text-gray-400 mb-2 flex items-center">
                <MessageSquare className="w-3 h-3 mr-1" />
                Recent Chats
              </h3>
              {loadingHistory ? (
                <div className="flex justify-center py-4">
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : chatHistory.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">No chat history yet</p>
              ) : (
                <div className="space-y-1">
                  {chatHistory.map((chat) => (
                    <div
                      key={chat._id}
                      onClick={() => loadChat(chat)}
                      className={`p-2 rounded-none cursor-pointer transition-all group hover:bg-gray-800/50 ${
                        currentChatId === chat._id ? 'bg-gray-800/70 ring-1 ring-blue-500/50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-300 truncate" title={chat.title}>
                            {chat.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {new Date(chat.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-gray-400 hover:text-blue-400"
                            onClick={(e) => toggleArchive(chat._id, chat.isArchived, e)}
                            title="Archive"
                          >
                            <Archive className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-gray-400 hover:text-red-400"
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
              <div className="p-3 border-t border-gray-800">
                <h3 className="text-xs font-semibold text-gray-400 mb-2 flex items-center">
                  <Archive className="w-3 h-3 mr-1" />
                  Archived Chats
                </h3>
                <div className="space-y-1">
                  {archivedChats.map((chat) => (
                    <div
                      key={chat._id}
                      onClick={() => loadChat(chat)}
                      className={`p-2 rounded-none cursor-pointer transition-all group hover:bg-gray-800/50 ${
                        currentChatId === chat._id ? 'bg-gray-800/70 ring-1 ring-blue-500/50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-400 truncate" title={chat.title}>
                            {chat.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {new Date(chat.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-gray-400 hover:text-blue-400"
                            onClick={(e) => toggleArchive(chat._id, chat.isArchived, e)}
                            title="Restore"
                          >
                            <MessageSquare className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-gray-400 hover:text-red-400"
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
          <div className="p-4 border-b border-gray-800 bg-gray-950/50 backdrop-blur-sm flex-shrink-0">
            <h2 className="text-xl font-bold text-gray-200">
              {currentChatId ? chatHistory.find(c => c._id === currentChatId)?.title || 'Manufacturing AI Assistant' : 'Manufacturing AI Assistant'}
            </h2>
          </div>

          {/* Messages Area with Scroll */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-full  flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-200 mb-2">Manufacturing AI Assistant</h2>
                <p className="text-gray-400 max-w-md">
                  Ask me anything about shipments, freight, customs clearance, tracking, or logistics reports.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-blue-800 flex items-center justify-center flex-shrink-0">
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
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm">Thinking...</span>
                      </div>
                    ) : message.role === 'assistant' ? (
                      <AiMarkdown content={message.content} />
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed m-0">{message.content}</p>
                    )}
                  </div>
                  {message.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-medium text-gray-200">
                        {session?.user?.name?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Explicit confirm gate — a data mutation only runs on a button click,
              never by typing "yes". */}
          {isConfirming && pendingAction && (
            <div className="px-4 py-3 border-t border-amber-700/40 bg-amber-950/30 flex-shrink-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm text-amber-200">
                  This will make a change to your data. Confirm to proceed?
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={handleConfirmAction}
                    disabled={isLoading}
                    className="h-9 px-4 bg-emerald-700 hover:bg-emerald-600 text-white"
                  >
                    Confirm
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelAction}
                    disabled={isLoading}
                    className="h-9 px-4 border-gray-600 text-gray-200 hover:bg-gray-800"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Input at Bottom */}
          <div className="p-4 border-t border-gray-800 bg-gray-950/50 backdrop-blur-sm flex-shrink-0">
            <form onSubmit={handleSubmit} className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me about shipments, freight, customs clearance, tracking, logistics..."
                  className="min-h-[60px] max-h-[200px] resize-none bg-gray-900/50 border-gray-700 text-gray-100 placeholder:text-gray-500 pr-10"
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="absolute right-2 bottom-2 h-8 w-8 p-0 text-gray-400 hover:text-gray-300"
                  disabled={isLoading}
                >
                  <Mic className="w-4 h-4" />
                </Button>
              </div>
              <Button 
                type="submit" 
                disabled={isLoading || !input.trim()}
                className="h-[60px] px-6 bg-blue-800"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </form>
            <div className="text-xs text-gray-600 text-center mt-2">
              AI Assistant for Manufacturing • Powered by Aupulens
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
