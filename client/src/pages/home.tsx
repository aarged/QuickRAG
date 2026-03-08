import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ControlsPanel } from "@/components/chat/ControlsPanel";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { DebugPanel } from "@/components/chat/DebugPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Home() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex flex-col h-screen h-[100dvh] bg-background">
        <Tabs defaultValue="chat" className="flex-1 flex flex-col">
          <div className="px-4 py-2 border-b bg-card">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="config">Config</TabsTrigger>
              <TabsTrigger value="chat">Chat</TabsTrigger>
              <TabsTrigger value="debug">Debug</TabsTrigger>
            </TabsList>
          </div>
          
          <div className="flex-1 overflow-hidden relative">
            <TabsContent value="config" className="h-full m-0 data-[state=active]:flex flex-col border-0">
              <ControlsPanel />
            </TabsContent>
            <TabsContent value="chat" className="h-full m-0 data-[state=active]:flex flex-col border-0">
              <ChatPanel />
            </TabsContent>
            <TabsContent value="debug" className="h-full m-0 data-[state=active]:flex flex-col border-0">
              <DebugPanel />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    );
  }

  // Desktop Layout
  return (
    <div className="h-screen h-[100dvh] w-full bg-background flex flex-col overflow-hidden">
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={22} minSize={15} maxSize={30} className="bg-secondary/10">
          <ControlsPanel />
        </ResizablePanel>
        
        <ResizableHandle withHandle className="bg-border/60 hover:bg-primary/50 transition-colors" />
        
        <ResizablePanel defaultSize={50} minSize={30}>
          <ChatPanel />
        </ResizablePanel>
        
        <ResizableHandle withHandle className="bg-border/60 hover:bg-primary/50 transition-colors" />
        
        <ResizablePanel defaultSize={28} minSize={20} maxSize={40} className="bg-secondary/10">
          <DebugPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
