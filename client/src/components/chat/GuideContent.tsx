export function GuideContent() {
  return (
    <div>
      <p className="text-sm text-foreground/80 leading-relaxed mb-4">
        QuickRAG is a lightweight app that demonstrates retrieval-augmented
        generation (RAG). RAG lets you pair source material of your choosing with
        a large language model (LLM), creating a chat interface that answers using
        only the knowledge you provide. Here's how to get the most out of it:
      </p>
      <ul className="space-y-3 text-sm text-foreground/80 leading-relaxed">
        <li>
          <span className="font-medium text-foreground">Ask for specifics, not summaries.</span>{" "}
          RAG retrieves the most relevant passages from your source rather than
          reading it end to end, so it excels at targeted questions. New to the
          material? Begin with Creative grounding to explore freely, then switch
          to Strict for precise, source-only answers to detailed questions.
        </li>
        <li>
          <span className="font-medium text-foreground">Uploading your own document?</span>{" "}
          QuickRAG is a text-based retrieval system. Plain prose works best —
          structured content such as tables, charts, and scanned images can't be
          retrieved and will be skipped.
        </li>
        <li>
          <span className="font-medium text-foreground">Experiment with Voice and Style.</span>{" "}
          These settings reshape the system prompt that guides the LLM, showing
          how the same source can produce very different responses. Clear the chat
          after switching so the new voice takes effect cleanly.
        </li>
        <li>
          <span className="font-medium text-foreground">Review your results in the Context and Reasoning panels.</span>{" "}
          Context shows exactly which passages were surfaced for your question;
          Reasoning traces the steps taken. Together they reveal how well your
          prompt and settings are working.
        </li>
      </ul>
    </div>
  );
}

export const GUIDE_TITLE = "Getting the best out of QuickRAG";
