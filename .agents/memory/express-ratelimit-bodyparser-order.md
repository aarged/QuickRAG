---
name: express-rate-limit + body-parser ordering and trust proxy
description: Where to mount rate limiters relative to body parsers, and the trust-proxy value express-rate-limit requires
---

When protecting an endpoint that accepts a large body (e.g. a 50MB PDF upload) with `express-rate-limit`, mount the limiter as **app-level middleware BEFORE the body parser**, not as route-level middleware on the route handler.

**Why:** Body parsers (`express.json`) are registered app-level and run in registration order, before any route handler. A route-level limiter (`app.post(path, limiter, handler)`) runs *after* the parser has already consumed/parsed the (potentially huge) body — so an over-limit request still pays the parse cost. Putting the limiter first means over-limit requests are rejected before the large body is read.

**How to apply:** For a big-body route, add `app.use(path, (req,res,next) => req.method === "POST" ? limiter(req,res,next) : next())` before the large `express.json` parser, and do NOT also attach the same limiter at the route level (that double-counts the window). Small-body endpoints (chat/search/events capped at ~100kb) can keep route-level limiters — parsing 100kb first is cheap.

**Body-limit scoping trick:** Mount a large-limit `express.json` on the upload path first, then a small-limit global `express.json`. Once the first parser parses a request it sets an internal flag and the second parser short-circuits — so upload routes get the big limit and everything else gets the small one.

**Trust proxy:** Behind a reverse proxy (Replit deploys are), set `app.set("trust proxy", 1)` (a numeric hop count) so `req.ip` reflects the real client via X-Forwarded-For. Do NOT use `app.set("trust proxy", true)` — express-rate-limit rejects it as too permissive (ERR_ERL_PERMISSIVE_TRUST_PROXY). Note: the default memory store is per-instance, so multi-instance/autoscale deployments need a shared store (e.g. Redis) or limits multiply per instance.
