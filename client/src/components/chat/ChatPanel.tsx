import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, User, ChevronLeft, ChevronRight } from "lucide-react";
import { GuideContent, GUIDE_TITLE } from "./GuideContent";
import { track, getVisitorId } from "@/lib/analytics";

export function ChatPanel() {
  const {
    messages, addMessage, updateLastAssistantContent, clearChat,
    isGenerating, setIsGenerating,
    isConfigOpen, toggleConfig, isDebugOpen, toggleDebug,
    activeDocumentId, grounding, voice, style,
    setLastRetrievedChunks, incrementTokens, setLastTokens,
    setPipelineSteps, updatePipelineStep,
  } = useAppStore();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const GUIDE_SEEN_KEY = "quickrag_guide_seen";
  const [guideActive, setGuideActive] = useState(
    () => typeof window !== "undefined" && sessionStorage.getItem(GUIDE_SEEN_KEY) !== "true"
  );

  useEffect(() => {
    sessionStorage.setItem(GUIDE_SEEN_KEY, "true");
  }, []);

  useEffect(() => {
    if (messages.length > 1 && guideActive) {
      setGuideActive(false);
    }
  }, [messages.length, guideActive]);

  const showGuide = guideActive && messages.length === 1;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return;

    const userMessage = input.trim();
    addMessage({ role: "user", content: userMessage });
    setInput("");
    setIsGenerating(true);
    track("chat", { documentId: activeDocumentId });

    setPipelineSteps([
      { step: 1, label: "Query Analysis", detail: "Parsing user query", status: "active" },
      { step: 2, label: "Chunk Retrieval", detail: "Searching document via full-text search", status: "pending" },
      { step: 3, label: "Prompt Assembly", detail: "Building system prompt with context", status: "pending" },
      { step: 4, label: "Generation", detail: "gpt-4o-mini streaming response", status: "pending" },
    ]);

    const history = messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .filter(m => m.id !== "welcome")
      .slice(-10)
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          documentId: activeDocumentId,
          config: { grounding, voice, style },
          history,
          visitorId: getVisitorId(),
        }),
      });

      if (!response.ok) {
        throw new Error("Chat request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let fullContent = "";
      let assistantAdded = false;
      let buffer = "";

      updatePipelineStep(1, "done");
      updatePipelineStep(2, "active");

      const processEvent = (jsonStr: string) => {
        try {
          const event = JSON.parse(jsonStr);

          if (event.type === "context") {
            setLastRetrievedChunks(event.chunks || []);
            updatePipelineStep(2, "done");
            updatePipelineStep(3, "done");
            updatePipelineStep(4, "active");

            if (!assistantAdded) {
              addMessage({ role: "assistant", content: "" });
              assistantAdded = true;
            }
          } else if (event.type === "token") {
            fullContent += event.content;
            updateLastAssistantContent(fullContent);
          } else if (event.type === "done") {
            updatePipelineStep(4, "done");
            const inputT = event.inputTokens || 0;
            const outputT = event.outputTokens || 0;
            incrementTokens(inputT, outputT);
            setLastTokens(inputT, outputT);
          } else if (event.type === "error") {
            if (!assistantAdded) {
              addMessage({ role: "assistant", content: "Sorry, an error occurred while generating the response." });
            } else {
              updateLastAssistantContent(fullContent || "Sorry, an error occurred.");
            }
          }
        } catch {}
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr) processEvent(jsonStr);
          }
        }
      }

      buffer += decoder.decode();

      if (buffer.trim()) {
        const lines = buffer.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr) processEvent(jsonStr);
        }
      }
    } catch (err) {
      addMessage({ role: "assistant", content: "Failed to connect to the server. Please try again." });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-card relative">
      <div className="h-14 flex items-center justify-between px-4 border-b bg-background/50 shrink-0">
        <div className="flex items-center">
          {!isConfigOpen && (
            <Button variant="ghost" size="icon" onClick={toggleConfig} title="Open Configuration Panel" className="h-8 w-8 shrink-0 -ml-2" data-testid="button-open-config">
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={clearChat} title="Clear Chat" className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover-elevate active-elevate-2 border border-transparent min-h-8 rounded-md px-3 text-xs h-8 hover:text-foreground text-[#ffffff] bg-[#0048ade6]" data-testid="button-clear-chat">
            Clear
          </Button>
          {!isDebugOpen && (
            <Button variant="ghost" size="icon" onClick={toggleDebug} title="Open Debug Panel" className="h-8 w-8 shrink-0 -mr-2" data-testid="button-open-debug">
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-6 max-w-3xl mx-auto pb-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              data-testid={`message-${msg.role}-${msg.id}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              }`}>
                {msg.role === "user" ? <User size={16} /> : <span className="font-bold text-[10px]">QR</span>}
              </div>

              <div className={`flex flex-col gap-1 max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`px-4 py-3 rounded-2xl ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-secondary text-secondary-foreground rounded-tl-sm"
                }`}>
                  <div className="prose prose-sm dark:prose-invert max-w-none break-words whitespace-pre-wrap leading-relaxed font-sans">
                    {msg.content}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {showGuide && (
            <div className="ml-12 mt-2" data-testid="guide-session">
              <div className="border border-[#0048ad]/20 bg-[#0048ad]/[0.03] rounded-xl p-4 max-w-[80%]">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#0048ad] mb-3">
                  {GUIDE_TITLE}
                </p>
                <GuideContent />
              </div>
            </div>
          )}
          {isGenerating && messages[messages.length - 1]?.content === "" && (
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center shrink-0">
                <span className="font-bold text-[10px]">QR</span>
              </div>
              <div className="px-4 py-3 rounded-2xl bg-secondary text-secondary-foreground rounded-tl-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse"></div>
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse delay-150"></div>
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse delay-300"></div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="p-4 bg-background border-t">
        <div className="max-w-3xl mx-auto relative flex items-center">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeDocumentId ? "Ask about the source material..." : "Select a document first..."}
            className="pr-12 py-6 rounded-xl border-muted bg-card shadow-sm focus-visible:ring-1 focus-visible:ring-primary/30"
            data-testid="input-chat-message"
          />
          <Button
            size="icon"
            className="absolute right-2 h-8 w-8 rounded-lg"
            onClick={handleSend}
            disabled={!input.trim() || isGenerating}
            data-testid="button-send-message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <div className="text-center mt-2">
          <p className="text-[10px] text-muted-foreground font-mono">True North Applied Technologies</p>
        </div>
      </div>
    </div>
  );
}
