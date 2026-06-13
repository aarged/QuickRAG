import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { uploadLimiter } from "./rateLimit";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Behind Replit's proxy the real client IP arrives via X-Forwarded-For. Trust
// the first proxy hop so per-IP rate limiting keys on the actual visitor rather
// than the proxy. (Use a numeric hop count, not `true`, which express-rate-limit
// rejects as too permissive.)
app.set("trust proxy", 1);

const captureRawBody = (req: any, _res: any, buf: Buffer) => {
  req.rawBody = buf;
};

// Rate-limit upload attempts BEFORE the 50MB body parser runs, so an over-limit
// request is rejected without the server first parsing a large payload. Only
// POST (the actual upload) is throttled; GET/DELETE on documents pass through.
app.use("/api/documents", (req, res, next) => {
  if (req.method === "POST") return uploadLimiter(req, res, next);
  next();
});

// Only the PDF upload route needs a large body. Everything else (chat, search,
// events) is capped tightly so a single request can't carry a huge payload and
// drive up OpenAI token cost or flood storage. The 50MB parser is mounted on the
// document routes first; it marks the body as parsed so the small global parser
// below skips it.
app.use("/api/documents", express.json({ limit: "50mb", verify: captureRawBody }));

app.use(express.json({ limit: "100kb", verify: captureRawBody }));

app.use(express.urlencoded({ extended: false, limit: "100kb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        const safeBody = { ...capturedJsonResponse };
        if (safeBody.content && typeof safeBody.content === "string" && safeBody.content.length > 200) {
          safeBody.content = safeBody.content.substring(0, 200) + `... [${safeBody.content.length} chars]`;
        }
        logLine += ` :: ${JSON.stringify(safeBody)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const { storage } = await import("./storage");
  const { deleteDocumentCollection } = await import("./chromadb");

  try {
    const deletedIds = await storage.deleteNonDefaultDocuments();
    if (deletedIds.length > 0) {
      console.log(`[Cleanup] Removed ${deletedIds.length} session-ephemeral document(s): ${deletedIds.join(", ")}`);
      for (const id of deletedIds) {
        deleteDocumentCollection(id).catch((err) => {
          console.error(`[Cleanup] Failed to delete ChromaDB collection for doc ${id}:`, err);
        });
      }
    }
  } catch (err) {
    console.error("[Cleanup] Failed to clean up non-default documents:", err);
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);

      // Ensure the default book library exists in this environment's database and
      // is indexed in ChromaDB. Runs non-blocking AFTER the server is listening so
      // it never delays startup or trips deployment health checks. Idempotent:
      // already-seeded books and already-indexed collections are skipped cheaply.
      // This is what populates the production database (separate from development;
      // publishing syncs code/schema but not data rows) on first boot after deploy.
      import("./seed-defaults")
        .then(({ ensureDefaultLibrary }) => ensureDefaultLibrary())
        .catch((err) => {
          console.error("[bootstrap] failed to start default library bootstrap:", err);
        });
    },
  );
})();
