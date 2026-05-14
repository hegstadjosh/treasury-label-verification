# Test Fixtures

## `labels/`
Real label images used for end-to-end smoke testing (gated behind `RUN_LIVE_TESTS=1`).

- `old-tom-distillery.png` — canonical happy-path fixture matching the example from the take-home brief. AI-generated via Nano Banana Pro (Gemini 3 Pro Image), 768×768. All required fields visible and correct:
  - Brand: `OLD TOM DISTILLERY`
  - Class/Type: `Kentucky Straight Bourbon Whiskey`
  - ABV: `45% Alc./Vol. (90 Proof)`
  - Net Contents: `750 mL`
  - Government warning: canonical 27 CFR §16.21 text, exact wording, all-caps "GOVERNMENT WARNING:" lede

Used by `src/lib/vision.test.ts` (live tests only) and the README screenshot.
