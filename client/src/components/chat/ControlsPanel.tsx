import { useEffect, useRef, useState } from "react";
import { useAppStore, GroundingMode, Voice, Style, DocumentSource } from "@/store";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Upload, FileText, X, ChevronLeft, Loader2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { GuideContent, GUIDE_TITLE } from "./GuideContent";

const DISMISS_KEY = "quickrag_upload_warning_dismissed";

export function ControlsPanel() {
  const store = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [pendingSource, setPendingSource] = useState<DocumentSource | null>(null);
  const [ownerPin, setOwnerPin] = useState("");
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showGuideDialog, setShowGuideDialog] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const docs = await res.json();
        store.setDocuments(docs);
        if (docs.length > 0 && !store.activeDocumentId) {
          const defaultDoc = docs.find((d: any) => d.isDefault);
          store.setActiveDocumentId(defaultDoc ? defaultDoc.id : docs[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    }
  };

  const handleSelectFileClick = () => {
    setUploadError(null);
    const dismissed = localStorage.getItem(DISMISS_KEY) === "true";
    if (dismissed) {
      fileInputRef.current?.click();
    } else {
      setShowUploadDialog(true);
    }
  };

  const handleUploadDialogContinue = () => {
    if (dontShowAgain) {
      localStorage.setItem(DISMISS_KEY, "true");
    }
    setShowUploadDialog(false);
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError("File exceeds 10MB size limit.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploadError(null);
    store.setIsUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (ownerPin.trim()) {
        headers["X-Owner-Pin"] = ownerPin.trim();
      }

      const res = await fetch("/api/documents", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: file.name.replace(/\.pdf$/i, ""), pdfBase64: base64 }),
      });

      if (res.status === 429) {
        const data = await res.json();
        setUploadError(data.error || "Upload limit reached. Try again tomorrow.");
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setUploadError(data.error || "Upload failed.");
        return;
      }

      const doc = await res.json();
      await fetchDocuments();
      store.setDocumentSource("user");
      store.setActiveDocumentId(doc.id);
      store.clearChat();
    } catch (err) {
      console.error("Failed to upload document:", err);
      setUploadError("Failed to upload document. Please try again.");
    } finally {
      store.setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteDocument = async (id: number) => {
    try {
      await fetch(`/api/documents/${id}`, { method: "DELETE" });
      await fetchDocuments();
      if (store.activeDocumentId === id) {
        const remaining = store.documents.filter(d => d.id !== id && !d.isDefault);
        if (remaining.length > 0) {
          store.setActiveDocumentId(remaining[0].id);
        } else {
          const defaultDoc = store.documents.find(d => d.isDefault);
          store.setDocumentSource("default");
          store.setActiveDocumentId(defaultDoc ? defaultDoc.id : null);
        }
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  const handleSourceToggle = (source: DocumentSource) => {
    if (source === store.documentSource) return;

    const hasChat = store.messages.some(m => m.id !== "welcome");
    if (hasChat) {
      setPendingSource(source);
      setShowSourceDialog(true);
    } else {
      applySourceChange(source);
    }
  };

  const applySourceChange = (source: DocumentSource) => {
    store.clearChat();
    store.setDocumentSource(source);
    const filtered = store.documents.filter(d =>
      source === "default" ? d.isDefault : !d.isDefault
    );
    if (filtered.length > 0) {
      store.setActiveDocumentId(filtered[0].id);
    } else {
      store.setActiveDocumentId(null);
    }
  };

  const handleSourceDialogConfirm = () => {
    if (pendingSource) {
      applySourceChange(pendingSource);
    }
    setShowSourceDialog(false);
    setPendingSource(null);
  };

  const generateSystemPrompt = () => {
    let prompt = "You are an AI assistant powered by a RAG pipeline.\n\n";
    switch(store.voice) {
      case "Yoda": prompt += "VOICE: Speak like Yoda from Star Wars. Use inverted sentence structure.\n"; break;
      case "Pirate": prompt += "VOICE: Speak like a pirate. Use nautical terms.\n"; break;
      case "Valley Girl": prompt += "VOICE: Speak like a valley girl.\n"; break;
      case "Surfer Dude": prompt += "VOICE: Speak like a surfer dude.\n"; break;
      case "Snarky Comic": prompt += "VOICE: Snarky stand-up comedian persona. You are witty, sarcastic, and intellectually sharp. Your purpose is to demonstrate how prompt quality affects AI responses. Rules: If the prompt is clear and specific, respond normally and you may make a brief approving joke. If the prompt is vague, lazy, poorly written, or unclear, point it out humorously. If there are typos or spelling mistakes, mention them in a sarcastic but non-abusive way. If context is missing, complain about the missing information before answering. Never invent facts in strict grounding mode. If the answer is not in the provided source, say you do not have the information. Sarcasm must target the prompt quality, not the user personally. Remain helpful even when being sarcastic.\n"; break;
      default: prompt += "VOICE: Standard, helpful, professional tone.\n";
    }
    switch(store.style) {
      case "Terse": prompt += "STYLE: Be extremely brief.\n"; break;
      case "Verbose": prompt += "STYLE: Be detailed and comprehensive.\n"; break;
      default: prompt += "STYLE: Balanced, moderately detailed.\n";
    }
    if (store.grounding === "Strict") {
      prompt += "\nGROUNDING: STRICT. Only answer using provided context.\n";
    } else {
      prompt += "\nGROUNDING: CREATIVE. Use context primarily, supplement with general knowledge.\n";
    }
    return prompt;
  };

  const defaultDocs = store.documents.filter(d => d.isDefault);
  const userDocs = store.documents.filter(d => !d.isDefault);
  const filteredDocs = store.documentSource === "default" ? defaultDocs : userDocs;
  const activeDoc = filteredDocs.find(d => d.id === store.activeDocumentId);

  return (
    <div className="flex flex-col h-full bg-secondary/30">
      <div className="h-14 px-4 border-b bg-background/50 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold tracking-tight">
          Configuration
        </h2>
        <Button variant="ghost" size="icon" onClick={store.toggleConfig} className="h-8 w-8 shrink-0 -mr-2" data-testid="button-close-config">
          <ChevronLeft className="w-5 h-5 text-muted-foreground" />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          <Button
            variant="outline"
            onClick={() => setShowGuideDialog(true)}
            className="w-full border-[#0048ad] text-[#0048ad] hover:bg-[#0048ad]/5 hover:text-[#0048ad]"
            data-testid="button-guide"
          >
            Guide
          </Button>

          <div className="space-y-3">
            <Label className="font-medium text-xs uppercase tracking-wider flex items-center gap-2 text-[#0048ad]">
              Source
            </Label>

            <div className="grid grid-cols-2 gap-1 p-1 bg-secondary/50 rounded-lg" data-testid="toggle-document-source">
              <button
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  store.documentSource === "default"
                    ? "bg-card shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => handleSourceToggle("default")}
                data-testid="button-source-default"
              >
                Default
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  store.documentSource === "user"
                    ? "bg-card shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => handleSourceToggle("user")}
                data-testid="button-source-user"
              >
                User
              </button>
            </div>

            <Label className="font-medium text-xs uppercase tracking-wider flex items-center gap-2 text-[#0048ad]">
              Document
            </Label>

            {filteredDocs.length > 0 && (
              <Select
                value={store.activeDocumentId?.toString() || ""}
                onValueChange={(val) => store.setActiveDocumentId(parseInt(val))}
              >
                <SelectTrigger className="bg-card" data-testid="select-document">
                  <SelectValue placeholder="Select document" />
                </SelectTrigger>
                <SelectContent>
                  {filteredDocs.map(doc => (
                    <SelectItem key={doc.id} value={doc.id.toString()}>{doc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {activeDoc && (
              <div className="flex items-center justify-between p-2 bg-card border rounded text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-primary/70 shrink-0" />
                  <span className="truncate">{activeDoc.name}</span>
                </div>
                {!activeDoc.isDefault && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => handleDeleteDocument(activeDoc.id)}
                    data-testid="button-delete-document"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            )}

            {store.documentSource === "default" && filteredDocs.length === 0 && (
              <div className="p-3 text-center text-xs text-muted-foreground">
                No default documents available.
              </div>
            )}

            {store.documentSource === "user" && (
              <div className="p-4 border rounded-lg border-dashed bg-card/50">
                <div className="flex flex-col items-center justify-center text-center space-y-2">
                  {store.isUploading ? (
                    <>
                      <Loader2 className="w-8 h-8 text-primary/70 animate-spin" />
                      <p className="text-sm font-medium">Uploading & indexing...</p>
                      <p className="text-xs text-muted-foreground">Parsing PDF, chunking text, generating embeddings...</p>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center mb-1">
                        <Upload className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Upload Document</p>
                        <p className="text-xs text-muted-foreground mt-1">PDF files up to 10MB</p>
                      </div>
                      <div
                        className="mt-2 w-full h-8 flex items-center justify-center bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-md text-xs font-medium transition-colors cursor-pointer"
                        onClick={handleSelectFileClick}
                        data-testid="button-upload-file"
                      >
                        Select File
                      </div>
                      <input ref={fileInputRef} type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} />
                      <div className="w-full mt-2">
                        <Input
                          type="password"
                          placeholder="Owner PIN (optional)"
                          value={ownerPin}
                          onChange={(e) => setOwnerPin(e.target.value)}
                          className="h-7 text-xs"
                          data-testid="input-owner-pin-inline"
                        />
                      </div>
                      {uploadError && (
                        <p className="text-xs text-destructive mt-2 px-2" data-testid="text-upload-error">{uploadError}</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-4">
            <Label className="font-medium text-xs uppercase tracking-wider flex items-center gap-2 text-[#0048ad]">
              Response Controls
            </Label>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Grounding</Label>
                <span className="text-[10px] text-muted-foreground font-mono bg-secondary px-1 rounded">{store.grounding}</span>
              </div>
              <Select value={store.grounding} onValueChange={(val: GroundingMode) => store.setGrounding(val)}>
                <SelectTrigger className="h-8 bg-card" data-testid="select-grounding">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Strict">Strict (Source only)</SelectItem>
                  <SelectItem value="Creative">Creative (Source + general knowledge)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Voice</Label>
              <Select value={store.voice} onValueChange={(val: Voice) => store.setVoice(val)}>
                <SelectTrigger className="h-8 bg-card" data-testid="select-voice">
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
              <Label className="text-xs">Style</Label>
              <Select value={store.style} onValueChange={(val: Style) => store.setStyle(val)}>
                <SelectTrigger className="h-8 bg-card" data-testid="select-style">
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

          <div className="pt-2">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="prompt" className="border-none">
                <AccordionTrigger className="hover:no-underline py-2 rounded px-2 hover:bg-secondary/50 text-sm">
                  <div className="flex items-center gap-2 text-[#0048ad] text-[12px]">
                    SYSTEM PROMPT
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="mt-2 p-3 bg-card border rounded-md text-xs font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto leading-relaxed" data-testid="text-system-prompt">
                    {generateSystemPrompt()}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </ScrollArea>

      <AlertDialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Upload Document</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Uploaded documents are temporary and will be removed at the end of the session.
                  The vector embeddings (ChromaDB collection) will also be deleted.
                </p>
                <p className="text-xs text-muted-foreground">
                  Uploads are limited to 1 per day. If you have an owner PIN, enter it below to bypass this limit.
                </p>
                <div className="pt-1">
                  <Label className="text-xs font-medium">Owner PIN (optional)</Label>
                  <Input
                    type="password"
                    placeholder="Enter PIN to bypass daily limit"
                    value={ownerPin}
                    onChange={(e) => setOwnerPin(e.target.value)}
                    className="mt-1 h-8 text-sm"
                    data-testid="input-owner-pin"
                  />
                </div>
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dontShowAgain}
                    onChange={(e) => setDontShowAgain(e.target.checked)}
                    className="rounded border-muted-foreground"
                    data-testid="checkbox-dont-show"
                  />
                  <span className="text-xs">Don't show this again</span>
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-upload-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUploadDialogContinue} data-testid="button-upload-continue">
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSourceDialog} onOpenChange={setShowSourceDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch Document Source</AlertDialogTitle>
            <AlertDialogDescription>
              Switching sources will clear the current chat history. Do you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSource(null)} data-testid="button-source-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSourceDialogConfirm} data-testid="button-source-confirm">
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showGuideDialog} onOpenChange={setShowGuideDialog}>
        <DialogContent className="max-w-lg" data-testid="dialog-guide">
          <DialogHeader>
            <DialogTitle className="text-[#0048ad]">{GUIDE_TITLE}</DialogTitle>
          </DialogHeader>
          <GuideContent />
        </DialogContent>
      </Dialog>
    </div>
  );
}
