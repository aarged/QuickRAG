import { ControlsPanel } from "@/components/chat/ControlsPanel";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { DebugPanel } from "@/components/chat/DebugPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppStore } from "@/store";

export default function Home() {
  const isMobile = useIsMobile();
  const { isConfigOpen, isDebugOpen } = useAppStore();

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
      <div className="flex-1 flex overflow-hidden">
        {isConfigOpen && (
          <div className="w-[350px] shrink-0 bg-secondary/10 transition-all duration-300">
            <ControlsPanel />
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <ChatPanel />
        </div>
        
        {isDebugOpen && (
          <div className="w-[350px] shrink-0 bg-secondary/10 transition-all duration-300">
            <DebugPanel />
          </div>
        )}
      </div>
    </div>
  );
}
