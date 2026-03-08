import { useState } from "react";
import { useAppStore } from "@/store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hash, Info, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DebugPanel() {
  const store = useAppStore();
  const [activeTab, setActiveTab] = useState("context");
  const [contextTab, setContextTab] = useState("chunks");

  const chunks = store.lastRetrievedChunks;

  return (
    <div className="flex flex-col h-full bg-secondary/20">
      <div className="h-14 px-4 border-b bg-background/50 flex items-center justify-between shrink-0">
        <Button variant="ghost" size="icon" onClick={store.toggleDebug} className="h-8 w-8 shrink-0 -ml-2" data-testid="button-close-debug">
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </Button>
        <h2 className="text-sm font-semibold tracking-tight">
          Output
        </h2>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="p-3 border-b bg-background/50 shrink-0">
          <TabsList className="grid w-full grid-cols-2 bg-secondary/50 h-9">
            <TabsTrigger value="context" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground data-[state=active]:shadow text-xs data-[state=active]:bg-card text-[#0048ad]">CONTEXT</TabsTrigger>
            <TabsTrigger value="reasoning" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground data-[state=active]:shadow text-xs data-[state=active]:bg-card text-[#0048ad]">
              REASONING
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="context" className="flex-1 m-0 data-[state=active]:flex flex-col min-h-0">
          <Tabs value={contextTab} onValueChange={setContextTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-3 py-2 bg-secondary/30 border-b border-border/30 flex justify-between items-center shrink-0">
              <TabsList className="h-7 bg-transparent p-0 space-x-1">
                <TabsTrigger value="chunks" className="text-xs h-7 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-border/50">
                  Retrieved Chunks
                </TabsTrigger>
                <TabsTrigger value="window" className="text-xs h-7 px-3 data-[state=active]:bg-card data-[state=active]:shadow-sm border border-transparent data-[state=active]:border-border/50">
                  Context Window
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="chunks" className="flex-1 m-0 data-[state=active]:flex flex-col min-h-0">
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {chunks.length > 0 ? (
                    chunks.map((chunk, i) => (
                      <div key={chunk.id} className="bg-card border rounded-lg overflow-hidden shadow-sm" data-testid={`card-chunk-${chunk.id}`}>
                        <div className="px-3 py-2 bg-secondary/40 border-b flex justify-between items-center text-xs">
                          <span className="font-medium text-muted-foreground">Chunk {chunk.chunkIndex + 1}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded" data-testid={`text-score-${chunk.id}`}>
                              {(chunk.score * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <div className="p-3">
                          <p className="text-sm font-serif leading-relaxed text-foreground/90 line-clamp-6">
                            {chunk.content}
                          </p>
                          <div className="mt-2 flex items-center text-[10px] text-muted-foreground font-mono">
                            <Hash className="w-3 h-3 mr-1" />
                            {chunk.source}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-center space-y-3 text-muted-foreground">
                      <Info className="w-8 h-8 opacity-20" />
                      <div>
                        <p className="text-sm">No context retrieved yet</p>
                        <p className="text-xs opacity-70 max-w-[200px] mt-1">
                          Submit a query to see retrieved chunks from your document.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="window" className="flex-1 m-0 data-[state=active]:flex flex-col min-h-0">
              <ScrollArea className="flex-1 p-4">
                <div className="bg-card border rounded-lg p-4 shadow-sm flex flex-col gap-4">
                  <div>
                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Prompt Assembly</h4>
                    <div className="space-y-2">
                      <div className="p-2 bg-secondary/30 rounded border text-[10px] font-mono text-muted-foreground">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-foreground/70 font-semibold">System Prompt</span>
                          <span>~{Math.ceil(store.lastInputTokens * 0.3)} tokens</span>
                        </div>
                        <div className="line-clamp-2 opacity-70">
                          You are an AI assistant powered by a RAG pipeline...
                        </div>
                      </div>
                      <div className="p-2 bg-secondary/30 rounded border text-[10px] font-mono text-muted-foreground">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-foreground/70 font-semibold">Conversation History</span>
                          <span>{store.messages.filter(m => m.id !== "welcome").length} msgs</span>
                        </div>
                        <div className="line-clamp-2 opacity-70">
                          {store.messages[store.messages.length - 1]?.content || "No history"}
                        </div>
                      </div>
                      <div className="p-2 bg-secondary/30 rounded border text-[10px] font-mono text-muted-foreground">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-foreground/70 font-semibold">Retrieved Context</span>
                          <span>{chunks.length} chunks</span>
                        </div>
                        <div className="line-clamp-2 opacity-70">
                          {chunks.length > 0 ? chunks[0].content.slice(0, 100) + "..." : "No context loaded."}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span>Last Request</span>
                    <span className="font-mono text-primary" data-testid="text-last-tokens">~{store.lastInputTokens + store.lastOutputTokens} tokens</span>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="reasoning" className="flex-1 m-0 data-[state=active]:flex flex-col min-h-0">
          <div className="px-3 py-2 bg-secondary/30 border-b border-border/30 flex justify-between items-center shrink-0">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 h-7">
              Pipeline Trace
            </span>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              <div className="bg-card border rounded-lg p-4 space-y-4 shadow-sm">
                <div>
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Pipeline Steps</h4>
                  <div className="space-y-3">
                    {store.pipelineSteps.length > 0 ? (
                      store.pipelineSteps.map((step) => (
                        <div key={step.step} className="flex items-start gap-3" data-testid={`pipeline-step-${step.step}`}>
                          <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 text-xs font-mono ${
                            step.status === "done" ? "bg-green-500/20 text-green-600" :
                            step.status === "active" ? "bg-primary/20 text-primary animate-pulse" :
                            "bg-secondary text-muted-foreground"
                          }`}>
                            {step.step}
                          </div>
                          <div>
                            <p className="text-xs font-medium">{step.label}</p>
                            <p className="text-[10px] text-muted-foreground">{step.detail}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <>
                        <div className="flex items-start gap-3">
                          <div className="w-5 h-5 rounded bg-secondary text-muted-foreground flex items-center justify-center shrink-0 mt-0.5 text-xs font-mono">1</div>
                          <div>
                            <p className="text-xs font-medium">Query Analysis</p>
                            <p className="text-[10px] text-muted-foreground">Parsing user query</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-5 h-5 rounded bg-secondary text-muted-foreground flex items-center justify-center shrink-0 mt-0.5 text-xs font-mono">2</div>
                          <div>
                            <p className="text-xs font-medium">Chunk Retrieval</p>
                            <p className="text-[10px] text-muted-foreground">Full-text search over document chunks</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-5 h-5 rounded bg-secondary text-muted-foreground flex items-center justify-center shrink-0 mt-0.5 text-xs font-mono">3</div>
                          <div>
                            <p className="text-xs font-medium">Prompt Assembly</p>
                            <p className="text-[10px] text-muted-foreground">System rules + Context + History</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-5 h-5 rounded bg-secondary text-muted-foreground flex items-center justify-center shrink-0 mt-0.5 text-xs font-mono">4</div>
                          <div>
                            <p className="text-xs font-medium">Generation</p>
                            <p className="text-[10px] text-muted-foreground">gpt-4o-mini streaming response</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-card border rounded-lg p-4 space-y-3 shadow-sm">
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground">Session Tokens</h4>
                <div className="flex items-center justify-between text-sm">
                  <span>Input</span>
                  <span className="font-mono text-muted-foreground" data-testid="text-session-input-tokens">~{store.sessionInputTokens}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Output</span>
                  <span className="font-mono text-muted-foreground" data-testid="text-session-output-tokens">~{store.sessionOutputTokens}</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>Est. Cost</span>
                  <span className="font-mono text-primary" data-testid="text-session-cost">
                    ~${((store.sessionInputTokens * 0.00000015) + (store.sessionOutputTokens * 0.0000006)).toFixed(4)}
                  </span>
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
