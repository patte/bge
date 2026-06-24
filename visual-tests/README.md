# visual-tests

Verifies the static rebuild in [`../web`](../web) against the **original**
smartervote app, by driving both through identical, deterministic interactions
and comparing the results.

## Oracle

The original app is the **deployed** image at `https://bge.fly.dev` (the same
`app/Dockerfile`, built natively on fly — locally it only fails because node
0.10's native build is fragile under Apple-Silicon emulation).

This environment blocks the headless browser's external network, so
[`proxy.mjs`](proxy.mjs) reverse-proxies the live app onto `http://localhost:4190`
(rewriting Meteor's DDP connection URL to the proxy) and the browser drives the
real original app via localhost.

## What is compared

The D3 force-layout **positions are non-deterministic**, so we do NOT pixel-diff
the bubbles. Instead we compare everything that is a pure function of the
answers, which must match exactly:

- the question data (`Questions` Minimongo on the baseline vs the baked JSON)
- the score gauge %, the evaluation score, the per-topic %
- the multiset of bubble radii

across 4 scripted answer patterns (`max` / `min` / `mixed` / `skip`) × 2
viewports (desktop / mobile).

## Run

```bash
npm install
npx playwright install chromium

# 1. capture the new build (Vite dev/preview must be running on :4180)
node capture.mjs new http://localhost:4180

# 2. capture the baseline through the proxy
node proxy.mjs &                       # http://localhost:4190 -> https://bge.fly.dev
node capture.mjs baseline http://localhost:4190

# 3. compare
node compare.mjs                        # questions(de) + scoring/radii
node multilang-baseline.mjs             # fr/it/de question text
```

Last result: `compare.mjs` → **62/62 match**; `multilang-baseline.mjs` →
**251/252** (the 1 is `q12.it.info` `""` vs `undefined` — a csv-parse/fast-csv
edge case that renders identically as "no info").

Note: hammering the small scale-to-zero fly VM with full capture runs can make it
temporarily return 503 / time out; it auto-recovers on the next traffic.
