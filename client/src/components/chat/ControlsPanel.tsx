import { useAppStore, KnowledgeSource, GroundingMode, Voice, Style } from "@/store";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileText, Database, Settings2, SlidersHorizontal, UserSquare2, BookOpen, ChevronLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export function ControlsPanel() {
  const store = useAppStore();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      store.setUploadedFileName(file.name);
      store.setSource("My Reference");
    }
  };

  const generateSystemPrompt = () => {
    let prompt = "You are an AI assistant powered by a RAG pipeline.\n\n";
    
    // Voice
    switch(store.voice) {
      case "Yoda": prompt += "VOICE: Speak like Yoda from the Star Wars franchise. Use an inverted sentence structure. Be cryptic on occasion. Turn the question back on the the user when the opportunity arises.\n"; break;
      case "Pirate": prompt += "VOICE: Speak like a pirate. Use nautical terms.\n"; break;
      case "Valley Girl": prompt += "VOICE: Speak like a valley girl. Use words like 'like' and 'literally'.\n"; break;
      case "Surfer Dude": prompt += "VOICE: Speak like a surfer dude. Use words like 'gnarly' and 'dude'.\n"; break;
      case "Snarky Comic": prompt += "VOICE: Be sarcastic and slightly condescending, but helpful.\n"; break;
      default: prompt += "VOICE: Use a standard, helpful, professional tone.\n";
    }

    // Style
    switch(store.style) {
      case "Terse": prompt += "STYLE: Be extremely brief. One or two sentences maximum.\n"; break;
      case "Verbose": prompt += "STYLE: Be detailed and comprehensive. Elaborate extensively.\n"; break;
      default: prompt += "STYLE: Provide a balanced, moderately detailed response.\n";
    }

    // Grounding
    if (store.grounding === "Strict") {
      prompt += "\nGROUNDING: STRICT. You must ONLY answer using the provided retrieved context. If the context does not contain the answer, say 'I do not have enough information to answer that.' Do NOT use outside knowledge.\n";
    } else {
      prompt += "\nGROUNDING: CREATIVE. Base your answer primarily on the retrieved context. If the context is insufficient, you may supplement with your general knowledge, but you must clearly indicate when you are doing so.\n";
    }

    prompt += `\nSOURCE CONTEXT: The user is querying a knowledge base containing ${store.source === "War and Peace" ? "Leo Tolstoy's 'War and Peace'" : "their uploaded reference document"}.\n`;

    return prompt;
  };

  return (
    <div className="flex flex-col h-full bg-secondary/30">
      <div className="h-14 px-4 border-b bg-background/50 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold tracking-tight">
          Configuration
        </h2>
        <Button variant="ghost" size="icon" onClick={store.toggleConfig} className="h-8 w-8 shrink-0 -mr-2">
          <ChevronLeft className="w-5 h-5 text-muted-foreground" />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {/* Source Selection */}
          <div className="space-y-3">
            <Label className="font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-xs uppercase tracking-wider flex items-center gap-2 text-[#0048ad]">
              Source
            </Label>
            
            <Select 
              value={store.source} 
              onValueChange={(val: KnowledgeSource) => store.setSource(val)}
            >
              <SelectTrigger className="bg-card">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="War and Peace">Leo Tolstoys War & Peace</SelectItem>
                <SelectItem value="My Reference">My Reference</SelectItem>
              </SelectContent>
            </Select>

            {/* Upload Area */}
            <div className={`p-4 border rounded-lg border-dashed transition-colors ${store.source === "My Reference" ? "bg-accent/30 border-primary/30" : "bg-card/50"}`}>
              <div className="flex flex-col items-center justify-center text-center space-y-2">
                {store.uploadedFileName ? (
                  <>
                    <FileText className="w-8 h-8 text-primary/70 mb-1" />
                    <p className="text-sm font-medium">{store.uploadedFileName}</p>
                    <p className="text-xs text-muted-foreground">Document loaded</p>
                    <label className="mt-2 cursor-pointer">
                      <span className="text-xs text-primary hover:underline">Replace file</span>
                      <input type="file" className="hidden" accept=".pdf,.txt,.docx" onChange={handleFileUpload} />
                    </label>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center mb-1">
                      <Upload className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Upload Reference</p>
                      <p className="text-xs text-muted-foreground mt-1">PDF, TXT, DOCX up to 10MB</p>
                    </div>
                    <label className="mt-2 w-full">
                      <div className="w-full h-8 flex items-center justify-center bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-md text-xs font-medium transition-colors cursor-pointer">
                        Select File
                      </div>
                      <input type="file" className="hidden" accept=".pdf,.txt,.docx" onChange={handleFileUpload} />
                    </label>
                  </>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* AI Controls */}
          <div className="space-y-4">
            <Label className="font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-xs uppercase tracking-wider flex items-center gap-2 text-[#0048ad]">
              Response Controls
            </Label>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Grounding</Label>
                <span className="text-[10px] text-muted-foreground font-mono bg-secondary px-1 rounded">{store.grounding}</span>
              </div>
              <Select value={store.grounding} onValueChange={(val: GroundingMode) => store.setGrounding(val)}>
                <SelectTrigger className="h-8 bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Strict">Strict (Source only)</SelectItem>
                  <SelectItem value="Creative">Creative (Source + Web)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Voice</Label>
              </div>
              <Select value={store.voice} onValueChange={(val: Voice) => store.setVoice(val)}>
                <SelectTrigger className="h-8 bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Standard">Standard</SelectItem>
                  <SelectItem value="Yoda">Yoda</SelectItem>
                  <SelectItem value="Pirate">Pirate</SelectItem>
                  <SelectItem value="Valley Girl">Valley Girl</SelectItem>
                  <SelectItem value="Surfer Dude">Surfer Dude</SelectItem>
                  <SelectItem value="Snarky Comic">Snarky Comic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Style</Label>
              </div>
              <Select value={store.style} onValueChange={(val: Style) => store.setStyle(val)}>
                <SelectTrigger className="h-8 bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Terse">Terse</SelectItem>
                  <SelectItem value="Standard">Standard</SelectItem>
                  <SelectItem value="Verbose">Verbose</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* System Prompt Viewer */}
          <div className="pt-2">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="prompt" className="border-none">
                <AccordionTrigger className="hover:no-underline py-2 rounded px-2 hover:bg-secondary/50 text-sm">
                  <div className="flex items-center gap-2 text-[#0048ad]">
                    SYSTEM PROMPT
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="mt-2 p-3 bg-card border rounded-md text-xs font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto leading-relaxed">
                    {generateSystemPrompt()}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
          
        </div>
      </ScrollArea>
    </div>
  );
}
