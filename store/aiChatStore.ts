import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Global AI assistant chat state.
 *
 * Lives at module scope (not in a per-page component) so the conversation and
 * the open/closed state SURVIVE client-side navigation — e.g. when the AI
 * navigates the user to a create form, the chat panel stays exactly as it was.
 * It only resets when the user clicks "New Chat".
 *
 * `messages` is also persisted to sessionStorage so a full page reload keeps the
 * thread (attachment image data is stripped from the persisted copy to stay well
 * under the storage quota — thumbnails remain for the live session).
 */
export interface AiChatMessage {
  role: string;
  text: string;
  isLoading?: boolean;
  proposal?: { proposalId: string; destructive: boolean; status: "pending" | "confirmed" | "rejected" | "failed" };
  attachments?: { name: string; type: string; dataUrl: string }[];
}

type Updater = AiChatMessage[] | ((prev: AiChatMessage[]) => AiChatMessage[]);

interface AiChatStore {
  isOpen: boolean;
  messages: AiChatMessage[];
  /** Server conversation id — keeps multi-turn memory tied to one thread. */
  conversationId: string | null;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setMessages: (updater: Updater) => void;
  setConversationId: (id: string | null) => void;
  newChat: () => void;
}

export const useAiChatStore = create<AiChatStore>()(
  persist(
    (set) => ({
      isOpen: false,
      messages: [],
      conversationId: null,
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      setMessages: (updater) =>
        set((s) => ({ messages: typeof updater === "function" ? (updater as (p: AiChatMessage[]) => AiChatMessage[])(s.messages) : updater })),
      setConversationId: (id) => set({ conversationId: id }),
      newChat: () => set({ messages: [], conversationId: null }),
    }),
    {
      name: "aupulens-ai-chat",
      storage: createJSONStorage(() => sessionStorage),
      // Persist only the finished thread; drop in-progress bubbles and the heavy
      // attachment data URLs (keep name/type so chips still render after reload).
      partialize: (s) => ({
        conversationId: s.conversationId,
        messages: s.messages
          .filter((m) => !m.isLoading && !(m.role === "assistant" && !m.text))
          .map((m) => (m.attachments ? { ...m, attachments: m.attachments.map((a) => ({ name: a.name, type: a.type, dataUrl: "" })) } : m)),
      }),
    },
  ),
);
