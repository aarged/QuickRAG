---
name: Production data seeding (separate prod DB)
description: Why default/seed data must be bootstrapped at app startup, not assumed to copy from dev on publish.
---

# Production data seeding

Replit's managed Postgres gives the **production deployment its own database, separate from development**. Publishing syncs **code and schema** to prod but **not data rows**. Anything seeded only into the dev DB (one-off `tsx` seed scripts) is **absent in production**, and republishing never fixes it (it only redeploys code).

**Rule:** ship default/seed data into production via an **idempotent bootstrap that runs at app startup**, not via dev-only seed scripts and not via startup-time DDL (schema is the publish flow's job).

**Why:** there is no write path to the prod DB from the agent tooling (prod SQL is read-only), so a self-seeding boot step is the durable mechanism. It also makes the app self-healing for future default data.

**How to apply:**
- Make the seed logic idempotent (skip already-present rows) and **non-blocking after the server starts listening**, so boot/health checks aren't delayed.
- Guard against duplicate inserts under multi-instance/autoscale boots with a Postgres **session advisory lock** (`pg_try_advisory_lock`) taken on a single dedicated client — lock and unlock must run on the *same* connection; instances that can't get the lock skip.
- Gotcha: the vector store (ChromaDB Cloud) is shared across envs but collections are keyed by Postgres doc id, so prod must index its **own** ids — iterate prod's `documents`, don't reuse dev ids.
