# QuickRAG

**A simple, fully functional RAG chatbot demo** — built to show how easy it is to ground AI answers in your own documents using OpenAI + ChromaDB, without relying on expensive Microsoft tools.

### The Story Behind It
I wasn’t really paying attention when ChatGPT dropped in late 2022. Back then I was deep in the operational trenches turning messy ERP data into insights that helped win orders. To me, chatbots were just those unhelpful bubbles on insurance websites.

Then in 2023 our IT manager demoed Microsoft Copilot. It sounded impressive — until it confidently hallucinated answers with zero access to our internal manuals, emails, service bulletins, or real tribal knowledge. That moment was a wake-up call.

What if we had a company chatbot that *actually knew* our stuff?

Off-the-shelf enterprise solutions were eye-wateringly expensive. So I rolled up my sleeves, learned Retrieval-Augmented Generation (RAG), and built this working demo. QuickRAG lets you upload documents (or use the built-in library like *War and Peace*), asks questions, and gets grounded answers with source citations — all while keeping costs low.

### What QuickRAG Does
- Upload PDFs or use pre-loaded books/documents.
- Semantic search across chunks using **ChromaDB Cloud** + OpenAI embeddings.
- Chat with GPT-4o-mini (or similar) that retrieves relevant context before answering.
- Real-time streaming responses, conversation history, and debug panel showing exactly which chunks were used.
- Rate limiting and protections so it stays safe and cheap for demos.

It's deliberately simple but production-patterned — the same approach I use in Cyntric for industrial knowledge management.

<img width="1592" height="897" alt="image" src="https://github.com/user-attachments/assets/d08ed8a3-0a04-4bfe-adf0-24b398d96547" />


### Tech Stack (Kept Lightweight)
- **Frontend**: React + TypeScript + Vite + Tailwind + shadcn/ui
- **Backend**: Express API
- **Database**: PostgreSQL (Drizzle ORM) for documents/chunks + metadata
- **Vector Store**: ChromaDB Cloud (with pre-computed OpenAI embeddings)
- **AI**: OpenAI for embeddings + chat (GPT-4o-mini)

No heavy frameworks. Designed to run easily on Replit and show how accessible this tech really is.

<img width="2497" height="925" alt="image" src="https://github.com/user-attachments/assets/2308f603-3c70-4d70-9a17-00ec8cfcdc4d" />


### Key Features
- PDF upload with chunking and automatic indexing.
- Source switching (default library vs your uploads).
- Mobile-friendly chat interface with streaming.
- Built-in safeguards: rate limits, upload caps, ephemeral user documents (cleaned on restart).
- Debug view showing retrieval process and token usage.

### Why This Matters to Me
As a Parts Manager who became an AI builder, I’ve seen too many tools designed from the outside that miss the real operational needs. QuickRAG started as a side project to solve one specific pain point — but it proved something bigger: with today’s tools (especially Replit), motivated operators can build practical solutions fast and cheaply.

This is the same RAG pattern powering Cyntric, my multi-tenant knowledge platform for heavy machinery parts and OEMs.

### Try It
Live demo: https://quick-rag.replit.app

Upload your own docs or chat with classics like *War and Peace* to see grounded answers in action.

---

**Built by Aaron Gedge** — Machinery Parts professional turned AI Solution Builder at True North Applied Technologies.  
Focusing on practical AI for supply chain and industrial operations.  

Questions or ideas? Happy to chat — especially if you're in heavy machinery parts, service, or building similar tools.  
LinkedIn: https://www.linkedin.com/in/aarongedge/
