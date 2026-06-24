# smartervote — static build

A dependency-free **static** rebuild of the *smartervote* app from
[bedingungslos.ch](https://github.com/patte/bge) — the interactive basic-income
quiz with the D3 force-directed "bubble" visualization.

The original was a Meteor 1.2 + CoffeeScript + Blaze + MongoDB app. This is the
same app, ported to plain JS + [Vite](https://vitejs.dev), with **no server and
no database**. It can be hosted as static files anywhere.

## What it does

- 21 questions (de/fr/it) on the unconditional basic income.
- For each question you pick a side (pro/contra) and an importance; answers
  become coloured bubbles sized/placed by your answer; a "% pro" gauge updates.
- An evaluation screen shows your score and a per-topic breakdown.

## What changed vs the original

- **No backend.** Questions are baked from the original `questions.csv` into
  `src/data/questions.json` at build time (`scripts/bake-questions.mjs`,
  replicating the old server fixtures parsing exactly).
- **Persistence → localStorage.** Your answers are kept in the browser (the old
  per-browser "visit").
- **Sharing → URL.** "Share" encodes all answers into the URL hash (`#s=…`); the
  recipient's static page reconstructs the bubbles. No server, no DB.
- **Image download.** The bubble image is rendered to a PNG client-side.
- **Removed** (needed a server): accounts, admin, blog/news/newsletter, the
  "compare with other people" panel, image upload, Piwik, the tutorial.

The D3 engine (`src/lib/network.js`) and the bubble state machine
(`src/smartervote/engine.js`) are faithful ports of the original
`network.coffee` / `smartervote.coffee`; the original LESS styles and assets are
reused verbatim. d3 v3 is loaded as a classic `<script>` (`public/vendor/`)
because its UMD wrapper needs a non-strict global `this`.

## Develop / build

```bash
npm install
npm run dev      # bakes questions.json, then starts Vite
npm run build    # bakes + builds to dist/
npm run preview  # serves the built dist/
```

`npm run bake` regenerates `src/data/questions.json` from
`src/data/questions.csv`.

## Verification

The build is verified against the live original app — see
[`../visual-tests`](../visual-tests). Driving both apps through identical scripted
answers, every derived value (score gauge, evaluation %, per-topic %, the exact
bubble-radius multisets) and all 21 German questions match exactly; the fr/it
question text matches too.
