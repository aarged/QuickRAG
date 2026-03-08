import { create } from "zustand";

export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  metadata?: {
    chunksRetrieved?: number;
    tokens?: number;
    webResearchUsed?: boolean;
    source?: string;
  };
};

export type KnowledgeSource = "War and Peace" | "My Reference";
export type GroundingMode = "Strict" | "Creative";
export type Voice = "Standard" | "Yoda" | "Pirate" | "Valley Girl" | "Surfer Dude" | "Snarky Comic";
export type Style = "Terse" | "Standard" | "Verbose";

export type RetrievedChunk = {
  id: string;
  text: string;
  score: number;
  source: string;
};

interface AppState {
  // Settings
  source: KnowledgeSource;
  setSource: (source: KnowledgeSource) => void;
  grounding: GroundingMode;
  setGrounding: (grounding: GroundingMode) => void;
  voice: Voice;
  setVoice: (voice: Voice) => void;
  style: Style;
  setStyle: (style: Style) => void;
  uploadedFileName: string | null;
  setUploadedFileName: (name: string | null) => void;
  
  // Chat
  messages: Message[];
  addMessage: (msg: Omit<Message, "id" | "timestamp">) => void;
  clearChat: () => void;
  isGenerating: boolean;
  setIsGenerating: (isGenerating: boolean) => void;
  
  // Debug State
  lastRetrievedChunks: RetrievedChunk[];
  setLastRetrievedChunks: (chunks: RetrievedChunk[]) => void;
  
  // Stats
  sessionInputTokens: number;
  sessionOutputTokens: number;
  incrementTokens: (input: number, output: number) => void;
  clearTokens: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Defaults
  source: "War and Peace",
  setSource: (source) => set({ source }),
  grounding: "Strict",
  setGrounding: (grounding) => set({ grounding }),
  voice: "Standard",
  setVoice: (voice) => set({ voice }),
  style: "Standard",
  setStyle: (style) => set({ style }),
  uploadedFileName: null,
  setUploadedFileName: (uploadedFileName) => set({ uploadedFileName }),
  
  messages: [
    {
      id: "welcome",
      role: "assistant",
      content: "Welcome to QuickRag. How can I help you?",
      timestamp: Date.now(),
    }
  ],
  addMessage: (msg) => set((state) => ({ 
    messages: [...state.messages, { ...msg, id: Math.random().toString(36).substring(7), timestamp: Date.now() }] 
  })),
  clearChat: () => set((state) => ({ 
    messages: state.messages.filter(m => m.id === 'welcome' || m.role === 'system'),
    lastRetrievedChunks: []
  })),
  isGenerating: false,
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  
  lastRetrievedChunks: [],
  setLastRetrievedChunks: (lastRetrievedChunks) => set({ lastRetrievedChunks }),
  
  sessionInputTokens: 0,
  sessionOutputTokens: 0,
  incrementTokens: (input, output) => set((state) => ({
    sessionInputTokens: state.sessionInputTokens + input,
    sessionOutputTokens: state.sessionOutputTokens + output
  })),
  clearTokens: () => set({ sessionInputTokens: 0, sessionOutputTokens: 0 })
}));
