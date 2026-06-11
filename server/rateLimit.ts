import rateLimit from "express-rate-limit";
import type { Request } from "express";

// The owner can bypass every per-IP limit by sending the OWNER_PIN via the
// X-Owner-Pin header (same mechanism used for the upload-limit override). This
// keeps personal testing/demoing unthrottled while throttling the public.
export function isOwnerRequest(req: Request): boolean {
  const pin = req.headers["x-owner-pin"];
  return (
    typeof pin === "string" &&
    !!process.env.OWNER_PIN &&
    pin === process.env.OWNER_PIN
  );
}

function makeLimiter(opts: { windowMs: number; limit: number; message: string }) {
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => isOwnerRequest(req),
    message: { error: opts.message },
  });
}

// Cost-bearing AI endpoints: each call hits OpenAI (an embedding for retrieval
// plus a GPT completion), so these are kept deliberately tight.
export const chatLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 15,
  message: "You're sending messages too quickly. Please wait a moment and try again.",
});

export const searchLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 20,
  message: "Too many searches in a short time. Please wait a moment and try again.",
});

// Anonymous analytics ingest: higher ceiling (a normal session fires several
// events) but still bounded so it can't be used to flood the database.
export const eventsLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 60,
  message: "Too many requests.",
});

// Uploads are already globally rate-limited (1/day) and CPU-heavy; this per-IP
// cap simply stops a single client from hammering the upload endpoint.
export const uploadLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 5,
  message: "Too many upload attempts. Please wait a moment and try again.",
});
