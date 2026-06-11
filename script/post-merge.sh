#!/bin/bash
set -e

# Post-merge setup for QuickRag.
# Idempotent and non-interactive: safe to run after every task merge.

npm install --no-audit --no-fund

# Apply any Drizzle schema changes to the database (e.g. new tables/columns
# introduced by a merged task). --force skips interactive confirmation.
npx drizzle-kit push --force
