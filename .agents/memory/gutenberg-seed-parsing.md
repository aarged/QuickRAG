---
name: Generic Project Gutenberg seeding
description: Heuristics that make one config-driven parser work across very different Gutenberg book layouts
---

# Generic Project Gutenberg parsing

One parser driven by a small per-book manifest (url + `headingRegex` + optional `contentStartRegex` + label formatter) handles wildly different layouts (fables, fairy tales, epic books, a play). The heuristics that made it robust:

- **Apply the heading regex to the RAW line, not the trimmed line.** Gutenberg tables-of-contents indent their entries; body headings are flush-left. Matching `^[A-Z]…` on the raw line excludes the indented TOC automatically — no separate TOC stripper needed.
- **Require headings to be blank-line-surrounded.** True for every layout tried; cheaply rejects prose lines that happen to match a title pattern.
- **Discard everything before the first detected heading.** That throws away translator prefaces / front matter without special-casing.
- **Distinguish front matter by case when titles have a known case.** Aesop fable titles are Title-Case, so requiring a lowercase letter (`(?=.*[a-z])`) drops ALL-CAPS `CONTENTS`/`PREFACE`. Andersen tale titles are ALL-CAPS, so an all-caps regex isolates them.
- **Empty-body heading → persistent prefix.** A heading with no text before the next heading (e.g. `ACT I` before its scenes) becomes a prefix carried onto following sections (`ACT I — SCENE I. …`) until the next empty heading replaces it. This yields hierarchical labels generically.
- **Normalize CRLF first** (`\r\n`→`\n`) — Gutenberg `.txt` files are CRLF; blank-line checks and regexes break otherwise.

**Why:** per-book bespoke parsers don't scale; these structural rules + a tiny regex hint per book cover most Gutenberg texts.

**How to apply:** validate with a `DRY_RUN`/`VERBOSE` pass that prints section counts + labels before any DB write. Long ChromaDB indexing must run in the foreground in chunks under the tool timeout — detached/`nohup`/`setsid` background processes get killed when the tool call returns; rely on idempotent resume (skip-by-name in PG, resume-by-collection-count in ChromaDB) to finish across calls.
