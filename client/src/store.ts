import { create } from "zustand";

export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  metadata?: {
    chunksRetrieved?: number;
    tokens?: number;
  };
};

export type GroundingMode = "Strict" | "Creative";
export type Voice = "Standard" | "Yoda" | "Pirate" | "Valley Girl" | "Surfer Dude" | "Snarky Comic";
export type Style = "Terse" | "Standard" | "Verbose";

export type RetrievedChunk = {
  id: number;
  content: string;
  chunkIndex: number;
  score: number;
  source: string;
};

export type DocumentInfo = {
  id: number;
  name: string;
  createdAt: string;
  chunkCount?: number;
};

export type PipelineStep = {
  step: number;
  label: string;
  detail: string;
  status: "pending" | "active" | "done";
};

interface AppState {
  grounding: GroundingMode;
  setGrounding: (grounding: GroundingMode) => void;
  voice: Voice;
  setVoice: (voice: Voice) => void;
  style: Style;
  setStyle: (style: Style) => void;

  documents: DocumentInfo[];
  setDocuments: (docs: DocumentInfo[]) => void;
  activeDocumentId: number | null;
  setActiveDocumentId: (id: number | null) => void;
  isUploading: boolean;
  setIsUploading: (v: boolean) => void;

  messages: Message[];
  addMessage: (msg: Omit<Message, "id" | "timestamp">) => void;
  updateLastAssistantContent: (content: string) => void;
  clearChat: () => void;
  isGenerating: boolean;
  setIsGenerating: (isGenerating: boolean) => void;

  lastRetrievedChunks: RetrievedChunk[];
  setLastRetrievedChunks: (chunks: RetrievedChunk[]) => void;
  pipelineSteps: PipelineStep[];
  setPipelineSteps: (steps: PipelineStep[]) => void;
  updatePipelineStep: (step: number, status: "pending" | "active" | "done") => void;

  isConfigOpen: boolean;
  toggleConfig: () => void;
  isDebugOpen: boolean;
  toggleDebug: () => void;

  sessionInputTokens: number;
  sessionOutputTokens: number;
  incrementTokens: (input: number, output: number) => void;
  clearTokens: () => void;
  lastInputTokens: number;
  lastOutputTokens: number;
  setLastTokens: (input: number, output: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  grounding: "Strict",
  setGrounding: (grounding) => set({ grounding }),
  voice: "Standard",
  setVoice: (voice) => set({ voice }),
  style: "Standard",
  setStyle: (style) => set({ style }),

  documents: [],
  setDocuments: (documents) => set({ documents }),
  activeDocumentId: null,
  setActiveDocumentId: (activeDocumentId) => set({ activeDocumentId }),
  isUploading: false,
  setIsUploading: (isUploading) => set({ isUploading }),

  messages: [
    {
      id: "welcome",
      role: "assistant",
      content: "Welcome to QuickRag. Upload a document or select an existing one, then ask me anything about it.",
      timestamp: Date.now(),
    }
  ],
  addMessage: (msg) => set((state) => ({
    messages: [...state.messages, { ...msg, id: Math.random().toString(36).substring(7), timestamp: Date.now() }]
  })),
  updateLastAssistantContent: (content) => set((state) => {
    const msgs = [...state.messages];
    const lastIdx = msgs.length - 1;
    if (lastIdx >= 0 && msgs[lastIdx].role === "assistant") {
      msgs[lastIdx] = { ...msgs[lastIdx], content };
    }
    return { messages: msgs };
  }),
  clearChat: () => set({
    messages: [{
      id: "welcome",
      role: "assistant",
      content: "Welcome to QuickRag. Upload a document or select an existing one, then ask me anything about it.",
      timestamp: Date.now(),
    }],
    lastRetrievedChunks: [],
    pipelineSteps: [],
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    lastInputTokens: 0,
    lastOutputTokens: 0,
  }),
  isGenerating: false,
  setIsGenerating: (isGenerating) => set({ isGenerating }),

  lastRetrievedChunks: [],
  setLastRetrievedChunks: (lastRetrievedChunks) => set({ lastRetrievedChunks }),
  pipelineSteps: [],
  setPipelineSteps: (pipelineSteps) => set({ pipelineSteps }),
  updatePipelineStep: (step, status) => set((state) => ({
    pipelineSteps: state.pipelineSteps.map(s => s.step === step ? { ...s, status } : s),
  })),

  isConfigOpen: true,
  toggleConfig: () => set((state) => ({ isConfigOpen: !state.isConfigOpen })),
  isDebugOpen: true,
  toggleDebug: () => set((state) => ({ isDebugOpen: !state.isDebugOpen })),

  sessionInputTokens: 0,
  sessionOutputTokens: 0,
  incrementTokens: (input, output) => set((state) => ({
    sessionInputTokens: state.sessionInputTokens + input,
    sessionOutputTokens: state.sessionOutputTokens + output,
  })),
  clearTokens: () => set({ sessionInputTokens: 0, sessionOutputTokens: 0 }),
  lastInputTokens: 0,
  lastOutputTokens: 0,
  setLastTokens: (lastInputTokens, lastOutputTokens) => set({ lastInputTokens, lastOutputTokens }),
}));
