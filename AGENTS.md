<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project: TTB Alcohol Label Verification (Take-Home)

## Spec
The spec lives at `~/OneDrive/Obsidian Vault/Treasury-TakeHome/build-plan.md`. Read it before doing anything. The state file is `~/OneDrive/Obsidian Vault/Treasury-TakeHome/PROGRESS.md` — read it on entry, append to "Field notes" when you discover something worth flagging, never silently overwrite it.

## Discipline
- **Test-first on the pure core** (`src/lib/warning.ts`, `src/lib/compare.ts`, `src/lib/classify.ts`). Write the test, watch it fail, write the impl, watch it pass.
- **Integration tests** on routes use a `StubExtractor` — no real API calls in CI. One real-model smoke test gated behind `RUN_LIVE_TESTS=1`.
- **Atomic commits.** One logical change per commit. Tests alongside the code they cover. Don't bundle unrelated work.
- **Verify before claiming done.** `npm run check` green (lint + test + build) before saying iteration N is finished.

## Architecture seam
```
src/lib/vision.ts       ← VisionExtractor interface (StubExtractor + GeminiVisionExtractor)
src/lib/warning.ts      ← government-warning exact-match validator (pure)
src/lib/compare.ts      ← field-level comparison (pure)
src/lib/classify.ts     ← Pass/Needs Review/Fail rollup (pure)
src/lib/types.ts        ← Field, ExtractedLabel, ExpectedLabel, FieldResult, LabelResult
src/app/api/analyze     ← single-label route, wires vision+compare+classify
src/app/api/analyze-batch ← batch fan-out (concurrency cap 8)
src/app/page.tsx        ← batch upload + overview + queue (MAIN view)
src/components/LabelDrillDown.tsx ← per-label drill-down side sheet (no separate route; batch state is in-memory)
```

## File ownership (when working as a teammate)
Read PROGRESS.md "Files I own" / "Parallel agent claims" sections before touching any file. If you need to claim files for a parallel task, append to "Parallel agent claims" with your name + the file globs.

## Hard constraints from the stakeholder interviews
- **≤5 sec per label**. Slower than that and the tool dies in the field.
- **Government warning is EXACT** — case-sensitive on "GOVERNMENT WARNING:", strict on the canonical wording. Everything else is forgiving on case/punctuation.
- **Non-technical reviewer UI** — clean, obvious, no hunting for buttons. "73-year-old mom" benchmark.
- **Replaceable model layer** — the extraction adapter must be swappable for Azure OCR / Azure OpenAI later.
