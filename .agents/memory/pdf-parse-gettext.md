---
name: pdf-parse getText returns TextResult
description: pdf-parse v2 getText() resolves to an object, not a string — extract .text before string ops
---

`PDFParse(...).getText()` resolves to a `TextResult` object: `{ pages: PageTextResult[], text: string, total: number }`. The concatenated document string is on `.text`.

**Why:** Assigning the result directly to a `string` and passing it to a string helper (e.g. a text-cleaner that calls `.split`) throws `raw.split is not a function` at runtime and 500s the request. In QuickRag this silently broke every parseable PDF upload (the request 500'd *after* the daily upload slot was consumed), which looked like a rate-limit bug. TypeScript also flags it (`Type 'TextResult' is not assignable to type 'string'`).

**How to apply:** Always use `const result = await parser.getText(); const text = result.text;` before any string processing. Treat a pre-existing tsc "TextResult not assignable to string" error as a real latent runtime bug, not noise.
