# Treasury TTB Label Verification Prototype

AI-assisted alcohol label review for the Treasury / TTB take-home exercise.

The app lets a reviewer upload alcohol label images, enter the application facts, and receive automatic `Pass`, `Needs Review`, `Fail`, or `Unreadable` results with an audit trail.

## Live Demo

- App: https://treasury-takehome.vercel.app/
- Repo: `hegstadjosh/treasury-label-verification`

The deployed app uses Gemini vision extraction. Local development uses a deterministic stub by default so tests run without API calls.

## What It Does

- Upload one label or a batch of labels.
- Enter one set of expected application facts, or upload a spreadsheet mapping filenames to expected facts.
- Extract visible label text with a vision model.
- Compare extracted values against expected fields.
- Sort labels into an exception-first review queue.
- Show per-field expected value, extracted value, verdict, reason, model text, confidence, image-quality notes, and AI field boxes on the label image when available.

## How The AI Works

Gemini reads the label image and returns structured data:

- brand name
- class/type
- alcohol content
- net contents
- government warning text
- raw visible text
- confidence scores
- source boxes for visible fields
- image-quality notes

Application code then applies the compliance rules and produces the prototype verdict. This keeps the AI useful for OCR/vision while keeping the rule-sensitive judgment auditable and testable.

## Judgment Rules

- Brand, class/type, ABV, and net contents are forgiving of normal casing, punctuation, and unit-format differences.
- Government warning is strict: the `GOVERNMENT WARNING:` prefix and canonical warning text must match.
- Low confidence or image-quality problems become `Needs Review`.
- Clear missing/conflicting required information becomes `Fail`.
- Extractor failure becomes `Unreadable`.

## Running Locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

Local mode uses the stub extractor. The uploaded image content does not matter; the stub chooses the result by filename:

| Filename | Stub result |
|---|---|
| `ok.png` | Pass |
| `abv-mismatch.png` | Fail |
| `missing-warning.png` | Fail |
| `lowercase-warning.png` | Fail |
| `low-quality.png` | Needs Review |

For real Gemini locally:

```bash
export GEMINI_API_KEY=...
export USE_REAL_VISION=1
npm run dev
```

Both env vars are required. Otherwise the app falls back to the stub.

## Batch Spreadsheet

The app supports a CSV spreadsheet for batches where each image has different expected facts.

Sample file:

```text
public/demo-batch.csv
```

Required columns:

```csv
filename,brand_name,class_type,alcohol_content,net_contents,government_warning_required
```

Filenames are matched case-insensitively.

## Tests

```bash
npm test
npm run check
RUN_LIVE_TESTS=1 npm test -- src/lib/vision.live.test.ts
```

Coverage includes:

- warning validator
- field comparison rules
- verdict rollup
- confidence/image-quality policy
- CSV parser
- single-label API route
- batch API route
- bounded concurrency
- stub extractor
- gated live Gemini smoke test

Latest normal check: `109` tests passed, `2` live tests skipped by default.

## Architecture

- Next.js 16 / React 19 / TypeScript / Tailwind
- API routes for single-label and batch analysis
- `VisionExtractor` interface isolates the model provider
- `GeminiVisionExtractor` for deployed AI extraction
- `StubExtractor` for local tests and demos
- pure comparison/classification code under `src/lib`
- client-side batch state; no database required for the prototype

Key files:

```text
src/lib/vision.ts              # extractor interface + stub
src/lib/gemini-vision.ts       # Gemini adapter
src/lib/compare.ts             # field comparison rules
src/lib/classify.ts            # label verdict rollup
src/lib/extraction-quality.ts  # confidence/image-quality policy
src/app/api/analyze/route.ts
src/app/api/analyze-batch/route.ts
src/components/BatchReviewApp.tsx
```

## Known Limitations

- No authentication.
- No persisted review sessions.
- No COLA integration.
- No durable audit log.
- Uploaded batch state is lost on refresh.
- Gemini latency can exceed the ideal 5-second target on some images.
- Production would likely need Azure/FedRAMP-approved inference and storage.

These are intentional prototype trade-offs. The prompt asked for a standalone proof-of-concept, not a production COLA integration.

## Production Next Steps

- Replace Gemini with an approved Azure/OpenAI/Azure Document Intelligence backend.
- Add authentication.
- Persist batches and audit logs.
- Store uploaded images in object storage.
- Add image preprocessing for latency.
- Calibrate confidence thresholds with real reviewer feedback.
