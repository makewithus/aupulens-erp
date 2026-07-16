'use client';
import { confirmDialog } from "@/components/providers/ConfirmRoot";


import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { financeSidebarConfig } from '@/config/sidebar/finance';
import { Send, Trash2, Archive, Plus, MessageSquare, Mic, Folder, ChevronRight, Search, ArrowUp, User, Menu, X } from 'lucide-react';
import { ShimmerSkeleton } from '@/components/ui/loading-skeletons';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface AiActionProposalSummary {
  id: string;
  actionType: string;
  preview: { summary?: string; [key: string]: unknown };
  status?: 'pending' | 'confirmed' | 'rejected';
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  proposal?: AiActionProposalSummary;
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

// Dynamically derived "folders" (quick links) from the finance sidebar config

export default function FinanceAIAssistantPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [archivedChats, setArchivedChats] = useState<ChatHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [folders, setFolders] = useState<{ name: string; href: string }[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const groupedChats = (() => {
    const today = new Date();
    const isSameDay = (d1: Date, d2: Date) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
    const isYesterday = (d: Date) => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return isSameDay(d, yesterday);
    };

    return {
      today: chatHistory.filter(c => isSameDay(new Date(c.updatedAt), today)),
      yesterday: chatHistory.filter(c => isYesterday(new Date(c.updatedAt))),
      earlier: chatHistory.filter(c => {
        const d = new Date(c.updatedAt);
        return !isSameDay(d, today) && !isYesterday(d);
      })
    };
  })();

  function formatTimeShort(dateStr: string) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/finance');
    } else if (status === 'authenticated' && session?.user?.role !== 'finance' && session?.user?.role !== 'admin') {
      router.push('/auth/finance');
    }
  }, [status, router, session]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchChatHistory();
      // derive folders from sidebar config
      const flattened = (financeSidebarConfig || []).flatMap((s) => s.items.map((i) => ({ name: i.title, href: i.href })));
      setFolders(flattened);
    }
  }, [status]);

  const fetchChatHistory = async () => {
    try {
      setLoadingHistory(true);
      const response = await fetch('/api/finance/chat-history?includeArchived=true');
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

      await fetch('/api/finance/chat-history', {
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
    const loadedMessages: Message[] = chat.messages.map((msg, idx) => ({
      id: `${chat._id}-${idx}`,
      role: msg.role,
      content: msg.content,
      timestamp: new Date(msg.timestamp)
    }));
    setMessages(loadedMessages);
    setCurrentChatId(chat._id);
  };

  const deleteChat = async (chatId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (deletingChatId) return;
    
    if (!await confirmDialog({ title: 'Are you sure you want to delete this chat?' })) {
      return;
    }

    try {
      setDeletingChatId(chatId);
      const response = await fetch(`/api/finance/chat-history?chatId=${chatId}`, {
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
      const response = await fetch('/api/finance/chat-history/archive', {
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
      const response = await fetch('/api/finance/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // send both keys to be compatible with backend expecting 'message' or 'query'
        body: JSON.stringify({ query: userInputText, message: userInputText })
      });

      const data = await response.json();

      if (!response.ok) {
        // Backend returned an error JSON like { error: 'Message is required' }
        const errMsg = data?.error || data?.message || 'Server error';
        setMessages(prev => prev.filter(msg => !msg.isLoading).concat({
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Error: ${errMsg}`,
          timestamp: new Date()
        }));
        toast.error(String(errMsg));
        return;
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || 'I apologize, but I encountered an error processing your request.',
        timestamp: new Date(),
        proposal: data.proposal ? { ...data.proposal, status: 'pending' } : undefined
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

        const saveResponse = await fetch('/api/finance/chat-history', {
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
    } finally {
      setIsLoading(false);
    }
  };

  const handleProposalDecision = async (messageId: string, proposalId: string, decision: 'confirm' | 'reject') => {
    try {
      const res = await fetch(`/api/finance/accounting/ai-actions/${proposalId}/${decision}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || `Failed to ${decision} action`);

      setMessages(prev =>
        prev.map(m =>
          m.id === messageId && m.proposal
            ? { ...m, proposal: { ...m.proposal, status: decision === 'confirm' ? 'confirmed' : 'rejected' } }
            : m
        )
      );
      toast(decision === 'confirm' ? 'Action applied' : 'Action cancelled');
    } catch (error: any) {
      toast.error(error.message || `Failed to ${decision} action`);
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
        sidebarConfig={financeSidebarConfig}
        dashboardTitle="Finance Dashboard"
        userName="Finance User"
        userRole="finance"
        onSignOut={() => signOut({ callbackUrl: '/auth/finance' })}
        profileHref="/finance/profile"
      >
        <div className="flex h-[calc(100vh-15rem)] gap-4 bg-black p-4">
           <ShimmerSkeleton className="h-full w-full bg-gray-900" />
        </div>
      </DashboardLayout>
    );
  }

  if (!session) return null;

  return (
    <DashboardLayout
      sidebarConfig={financeSidebarConfig}
      dashboardTitle="Finance Dashboard"
      userName={session?.user?.name || 'User'}
      userRole={session?.user?.role || 'finance'}
      onSignOut={() => signOut({ callbackUrl: '/auth/finance' })}
      profileHref="/finance/profile"
    >
      <div className="flex h-[calc(100vh-12rem)] bg-black text-gray-300 font-sans overflow-hidden relative">
        
        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 lg:hidden z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        {/* === LEFT SIDEBAR === */}
  <div className={`w-[280px] shrink-0 flex flex-col border-r border-gray-900 bg-black pt-4 fixed lg:static top-0 left-0 h-screen lg:h-auto z-50 transition-transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}>
          
          {/* History Section */}
          <div className="flex-1 overflow-y-auto px-4 custom-scrollbar">
            <div className="mb-6">
              <h3 className="text-sm font-medium text-white mb-4">History</h3>
              
              <div className="space-y-4">
                {/* Group chats by date: Today / Yesterday / Earlier */}
                {groupedChats.today.length > 0 && (
                  <div>
                    <h4 className="text-[11px] text-blue-400 font-semibold mb-2 uppercase tracking-wider">Today</h4>
                    <div className="space-y-1">
                      {groupedChats.today.slice(0,5).map((chat) => (
                        <div
                          key={chat._id}
                          onClick={() => loadChat(chat)}
                          className={`group flex items-center justify-between text-sm py-1.5 px-2 -mx-2 rounded cursor-pointer transition-colors ${
                            currentChatId === chat._id ? 'text-white bg-gray-900' : 'text-gray-400 hover:text-white hover:bg-gray-900/50'
                          }`}
                        >
                          <span className="truncate flex-1">{chat.title}</span>
                          <span className="ml-2 text-[10px] text-gray-500">{formatTimeShort(chat.updatedAt)}</span>
                          <div className="opacity-0 group-hover:opacity-100 flex items-center">
                            <button
                              onClick={(e) => deleteChat(chat._id, e)}
                              className="text-gray-500 hover:text-red-400 p-1"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {chatHistory.length === 0 && <span className="text-xs text-gray-600 pl-2">No history</span>}
                    </div>
                  </div>
                )}

                {groupedChats.yesterday.length > 0 && (
                  <div>
                    <h4 className="text-[11px] text-gray-600 font-semibold mb-2 uppercase tracking-wider">Yesterday</h4>
                    <div className="space-y-1">
                      {groupedChats.yesterday.slice(0,5).map((chat) => (
                        <div
                          key={chat._id}
                          onClick={() => loadChat(chat)}
                          className="text-sm text-gray-400 py-1.5 px-2 -mx-2 hover:text-white cursor-pointer truncate hover:bg-gray-900/50 rounded"
                        >
                          <span className="truncate inline-block mr-2">{chat.title}</span>
                          <span className="ml-2 text-[10px] text-gray-500 inline-block">{formatTimeShort(chat.updatedAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {groupedChats.earlier.length > 0 && (
                  <div>
                    <h4 className="text-[11px] text-gray-600 font-semibold mb-2 uppercase tracking-wider">Earlier</h4>
                    <div className="space-y-1">
                      {groupedChats.earlier.slice(0,5).map((chat) => (
                        <div
                          key={chat._id}
                          onClick={() => loadChat(chat)}
                          className="text-sm text-gray-400 py-1.5 px-2 -mx-2 hover:text-white cursor-pointer truncate hover:bg-gray-900/50 rounded"
                        >
                          {chat.title}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Archive Section */}
            <div className="mb-6">
               <h3 className="text-sm font-medium text-white mb-2 flex items-center justify-between group cursor-pointer">
                  <span>Archive</span>
                  <ChevronRight className="w-4 h-4 text-gray-600" />
               </h3>
               {/* Hidden list unless mapped */}
            </div>

             {/* Folders Section (Visual Match) */}
         <div>
           <h3 className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wider pl-1">Quick Links</h3>
           <div className="space-y-1">
             {folders.map((folder, idx) => (
               <div key={idx} onClick={() => router.push(folder.href)} className="flex items-center gap-2 text-xs text-gray-400 hover:text-white py-2 px-1 cursor-pointer">
                 <Folder className="w-3.5 h-3.5" />
                 <span className="uppercase tracking-wide">{folder.name}</span>
               </div>
             ))}
           </div>
         </div>
          </div>

          <div className="p-4 border-t border-gray-900">
             <Button 
                onClick={startNewChat}
                variant="ghost" 
                className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-900 pl-0 gap-2"
             >
                <Plus className="w-4 h-4" />
                New chat
             </Button>
             <Button
                onClick={() => setSidebarOpen(false)}
                variant="ghost"
                className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-900 pl-0 gap-2 mt-2 lg:hidden"
             >
                <X className="w-4 h-4" />
                Close
             </Button>
          </div>
        </div>

        {/* === MAIN CHAT AREA === */}
        <div className="flex-1 flex flex-col bg-black relative w-full">
          
           <div className="flex items-center lg:hidden p-2 bg-black border-b border-gray-900">
              <Button
                onClick={() => setSidebarOpen(true)}
                variant="ghost"
                size="icon"
                className="text-gray-400 hover:text-white hover:bg-gray-800"
              >
                <Menu className="w-5 h-5" />
              </Button>
           </div>
           
           <div className="p-2 sm:p-4 bg-black">
             <div className="max-w-3xl mx-auto">
                <form onSubmit={handleSubmit} className="relative bg-gray-900/50 rounded-none border border-gray-800 overflow-hidden focus-within:border-gray-700 focus-within:ring-1 focus-within:ring-gray-700 transition-all">
                   <Textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Send a message..."
                      className="w-full bg-black border-none text-sm sm:text-base text-gray-200 placeholder:text-gray-500 resize-none min-h-[25px] max-h-[200px] py-2 sm:py-3 pl-3 sm:pl-4 pr-10 sm:pr-12 focus:ring-0"
                      disabled={isLoading}
                   />
                   <Button 
                      type="submit" 
                      disabled={isLoading || !input.trim()}
                      size="icon"
                      className="absolute right-1 sm:right-2 bottom-1 sm:bottom-2 h-7 sm:h-8 w-7 sm:w-8 bg-transparent hover:bg-gray-800 text-gray-400 hover:text-white rounded-none transition-colors"
                   >
                      <ArrowUp className="w-4 sm:w-5 h-4 sm:h-5" />
                   </Button>
                </form>
                <div className="text-[9px] sm:text-[10px] text-gray-600 text-center mt-1 sm:mt-2">
                   Aupulens AI generated content may be inaccurate.
                </div>
             </div>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto pt-4 sm:pt-8 px-2 sm:px-4 lg:px-10 custom-scrollbar">
            <div className="max-w-3xl mx-auto space-y-4 sm:space-y-8 pb-10">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[50vh] opacity-50">
                  <div className="w-10 h-10 bg-white rounded-full mb-4"></div>
                  <p className="text-gray-500">How can I help you today?</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className="flex gap-2 sm:gap-6 group">
                    {/* Avatar Column */}
                    <div className="shrink-0 mt-0.5 sm:mt-1">
                      {message.role === 'user' ? (
                        <div className="w-5 sm:w-6 h-5 sm:h-6 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
                          <User className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-white" />
                        </div>
                      ) : (
                        <div className="w-5 sm:w-6 h-5 sm:h-6 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                          <span className="text-black font-semibold text-xs sm:text-sm leading-none">A</span>
                        </div>
                      )}
                    </div>

                    {/* Content Column */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
                         <span className={`text-xs sm:text-sm font-medium ${message.role === 'user' ? 'text-gray-300' : 'text-white'}`}>
                            {message.role === 'user' ? 'You' : 'Aupulens AI'}
                         </span>
                      </div>
                      
                      <div className="text-[13px] sm:text-[15px] leading-relaxed text-gray-300 font-light">
                        {message.isLoading ? (
                           <div className="flex items-center gap-2 text-gray-500">
                              <span className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></span>
                              Thinking...
                           </div>
                        ) : (
                           <div className="whitespace-pre-wrap">{message.content}</div>
                        )}
                      </div>

                      {message.proposal && !message.isLoading && (
                        <div className="mt-3 border border-amber-500/40 bg-amber-500/10 rounded-lg p-3 max-w-md">
                          <p className="text-xs text-amber-400 font-medium mb-2">Confirmation required — this action has not been applied yet.</p>
                          {message.proposal.status === 'pending' ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleProposalDecision(message.id, message.proposal!.id, 'confirm')}
                                className="text-xs font-medium px-3 py-1.5 rounded bg-white text-black hover:bg-gray-200"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => handleProposalDecision(message.id, message.proposal!.id, 'reject')}
                                className="text-xs font-medium px-3 py-1.5 rounded border border-gray-500 text-gray-300 hover:bg-white/5"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 capitalize">{message.proposal.status}</p>
                          )}
                        </div>
                      )}

                      {/* Divider after user messages to visually separate question from AI response */}
                      {message.role === 'user' && !message.isLoading && (
                        <div className="mt-2">
                          <div className="h-[1px] bg-white w-full max-w-[60%] ml-0"></div>
                        </div>
                      )}
                      
                      {/* Visual separator line only for AI responses if needed, or actions */}
                      {message.role === 'assistant' && !message.isLoading && (
                         <div className="mt-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* Action icons placeholders */}
                         </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Bottom Input Area */}
        
        </div>
      </div>
    </DashboardLayout>
  );
}
