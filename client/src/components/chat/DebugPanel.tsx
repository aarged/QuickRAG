import { useState } from "react";
import { useAppStore } from "@/store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, BrainCircuit, Activity, Hash, AlignLeft, Info, TerminalSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function DebugPanel() {
  const store = useAppStore();
  const [activeTab, setActiveTab] = useState("context");
  const [contextTab, setContextTab] = useState("chunks");

  // Mock retrieved chunks for demonstration
  const mockChunks = [
    {
      id: "chunk-1",
      text: "Well, Prince, so Genoa and Lucca are now just family estates of the Buonapartes. But I warn you, if you don't tell me that this means war, if you still try to defend the infamies and horrors perpetrated by that Antichrist—I really believe he is Antichrist—I will have nothing more to do with you and you are no longer my friend, no longer my 'faithful slave,' as you call yourself!",
      score: 0.89,
      source: "War and Peace - Chapter 1"
    },
    {
      id: "chunk-2",
      text: "If you have nothing better to do, Count [or Prince], and if the prospect of spending an evening with a poor invalid is not too terrible, I shall be very charmed to see you tonight between seven and ten—Annette Scherer.",
      score: 0.76,
      source: "War and Peace - Chapter 1"
    }
  ];

  return (
    <div className="flex flex-col h-full bg-secondary/20">
      <div className="h-14 px-4 border-b bg-background/50 flex items-center shrink-0">
        <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
          Output
        </h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="p-3 border-b bg-background/50 shrink-0">
          <TabsList className="grid w-full grid-cols-2 bg-secondary/50 h-9">
            <TabsTrigger value="context" className="text-xs data-[state=active]:bg-card">
              Context
            </TabsTrigger>
            <TabsTrigger value="reasoning" className="text-xs data-[state=active]:bg-card">
              Reasoning
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
                  {store.source === "War and Peace" ? (
                    mockChunks.map((chunk, i) => (
                      <div key={chunk.id} className="bg-card border rounded-lg overflow-hidden shadow-sm">
                        <div className="px-3 py-2 bg-secondary/40 border-b flex justify-between items-center text-xs">
                          <span className="font-medium text-muted-foreground">Excerpt {i + 1}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground font-mono">Simulated</span>
                            <span className="text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded">
                              {(chunk.score * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <div className="p-3">
                          <p className="text-sm font-serif leading-relaxed text-foreground/90">
                            {chunk.text}
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
                        <p className="text-sm">No context available</p>
                        <p className="text-xs opacity-70 max-w-[200px] mt-1">
                          {store.uploadedFileName 
                            ? "Submit a query to retrieve chunks from your document." 
                            : "Upload a document or switch to 'War and Peace' to see retrieved chunks."}
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
                          <span>~120 tokens</span>
                        </div>
                        <div className="line-clamp-2 opacity-70">
                          You are an AI assistant powered by a RAG pipeline...
                        </div>
                      </div>
                      <div className="p-2 bg-secondary/30 rounded border text-[10px] font-mono text-muted-foreground">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-foreground/70 font-semibold">Conversation History</span>
                          <span>{store.messages.length} msgs • ~{store.messages.length * 25} tokens</span>
                        </div>
                        <div className="line-clamp-2 opacity-70">
                          {store.messages[store.messages.length - 1]?.content || "No history"}
                        </div>
                      </div>
                      <div className="p-2 bg-secondary/30 rounded border text-[10px] font-mono text-muted-foreground">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-foreground/70 font-semibold">Retrieved Context</span>
                          <span>{store.source === "War and Peace" ? "2 chunks" : "0 chunks"} • ~180 tokens</span>
                        </div>
                        <div className="line-clamp-2 opacity-70">
                          {store.source === "War and Peace" ? "Well, Prince, so Genoa and Lucca..." : "No context loaded."}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span>Total Context Window</span>
                    <span className="font-mono text-primary">~{120 + (store.messages.length * 25) + (store.source === "War and Peace" ? 180 : 0)} tokens</span>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="reasoning" className="flex-1 m-0 data-[state=active]:flex flex-col min-h-0">
          <div className="px-3 py-2 bg-secondary/30 border-b border-border/30 flex justify-between items-center shrink-0">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 h-7">
              <Activity className="w-3.5 h-3.5" />
              Trace Summary
            </span>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              <div className="bg-card border rounded-lg p-4 space-y-4 shadow-sm">
                
                <div>
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Pipeline Trace (Simulated)</h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 text-xs font-mono">1</div>
                      <div>
                        <p className="text-xs font-medium">Query Embedded</p>
                        <p className="text-[10px] text-muted-foreground">Using text-embedding-3-small (1536 dims)</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 text-xs font-mono">2</div>
                      <div>
                        <p className="text-xs font-medium">Vector Search</p>
                        <p className="text-[10px] text-muted-foreground">ChromaDB top_k=3 nearest neighbors</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 text-xs font-mono">3</div>
                      <div>
                        <p className="text-xs font-medium">Prompt Assembly</p>
                        <p className="text-[10px] text-muted-foreground">System rules + Context + History ({store.messages.length} msgs)</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 text-xs font-mono">4</div>
                      <div>
                        <p className="text-xs font-medium">Generation</p>
                        <p className="text-[10px] text-muted-foreground">gpt-4o-mini generating response</p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Usage Controls Box */}
              <div className="bg-card border rounded-lg p-4 space-y-3 shadow-sm">
                 <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground">Session Tokens</h4>
                 <div className="flex items-center justify-between text-sm">
                    <span>Input</span>
                    <span className="font-mono text-muted-foreground">~450</span>
                 </div>
                 <div className="flex items-center justify-between text-sm">
                    <span>Output</span>
                    <span className="font-mono text-muted-foreground">~85</span>
                 </div>
                 <div className="h-px bg-border" />
                 <div className="flex items-center justify-between text-sm font-medium">
                    <span>Total Cost</span>
                    <span className="font-mono text-primary">~$0.001</span>
                 </div>
              </div>

            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
