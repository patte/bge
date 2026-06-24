# visual-tests

Verifies the static rebuild in [`../web`](../web) against the **original**
smartervote app by driving **both** through identical, deterministic interactions
and comparing the results — the derived numbers, the full bubble-network
structure, the UI state, and every interactive action.

## Oracle

The original app is the **deployed** image at `https://bge.fly.dev` (the same
`app/Dockerfile`; locally it only fails because node 0.10's native build is
fragile under emulation). `https://bge.patpat.org` serves the same image.

This environment blocks the headless browser's external network, so
[`proxy.mjs`](proxy.mjs) reverse-proxies the live app onto `http://localhost:4190`
(rewriting Meteor's DDP connection URL to the proxy) and the browser drives the
real original app via localhost.

## Run (one command)

```bash
npm run setup        # once: npm install + playwright chromium (+ system deps)
npm test             # full suite: starts the new build + proxy, captures both, compares
npm run test:quick   # skip the slower 4-pattern derived-state capture
```

`npm test` ([`run.mjs`](run.mjs)) starts everything it needs (the new build's
Vite server on `:4180`, the baseline proxy on `:4190`), captures both apps, runs
all comparators, and tears the servers down again. It exits non-zero on any
mismatch. Ports are overridable via `PORT_NEW` / `PROXY_PORT`; `VERBOSE=1` echoes
the server logs.

To drive the pieces by hand (e.g. against an already-running dev server):

```bash
node proxy.mjs &                                   # :4190 -> https://bge.fly.dev
node capture.mjs        baseline http://localhost:4190/de   # derived state + screenshots
node capture.mjs        new      http://localhost:4180
node capture-actions.mjs baseline http://localhost:4190/de  # action scenario
node capture-actions.mjs new      http://localhost:4180
node capture-shots.mjs   baseline http://localhost:4190/de  # UI pixel frames
node capture-shots.mjs   new      http://localhost:4180
node compare.mjs            # questions(de) + scoring/radii
node multilang-baseline.mjs # fr/it/de question text
node compare-actions.mjs    # network + UI + about + language, per action
node compare-shots.mjs      # pixel diff of the UI frames (baseline vs new)
```

## What is deterministic (and what isn't)

This was originally stated too broadly ("positions are non-deterministic, so we
don't pixel-diff") and the conclusion was wrongly stretched over the whole UI.
Measured reality:

- **The entire HTML UI is deterministic and run-stable** — the question panel,
  the importance **slider and its handle**, the buttons, the header, the gauge,
  the evaluation panel and the about modal all lay out identically every run.
  This surface **is** pixel-diffed.
- **Only the force-driven bubble `<circle>` positions are timing-variable** (the
  d3 layout is still cooling and its tick count tracks wall-clock). That single
  layer is excluded from pixel comparison and checked **structurally** instead
  (radii / colours / images / link count — see `extractNetwork`).
- **Pixels carry small antialiasing/subpixel noise** even run-to-run on one app,
  so pixel diffs use a **tolerance** (pixelmatch), never exact hashing.

Everything below the bubble layer is a pure function of the answers and must
match exactly.

**Derived state** ([`compare.mjs`](compare.mjs)) — across 4 scripted answer
patterns (`max` / `min` / `mixed` / `skip`) × 2 viewports (desktop / mobile):

- the question data (`Questions` Minimongo on the baseline vs the baked JSON)
- the score gauge %, the evaluation score, the per-topic %
- the multiset of bubble radii

**Action scenario** ([`scenario.mjs`](scenario.mjs) + [`compare-actions.mjs`](compare-actions.mjs)) —
one rich run, both viewports, exercising these interactive actions and
snapshotting the network + UI after each step. The two apps must produce
identical snapshot sequences:

- answer **max** / **min** / **skip** across all 21 questions
- **favourite** toggle (star image appears on the bubble — and selecting an
  answer does **not** favourite it)
- one-sided "contra" answers → **dead** question image
- **more/less information** expand & collapse
- **next** / **back** navigation, **go to evaluation** / **go to questions**
- **topic** select & deselect (dims non-topic bubbles to fill-opacity 0.05)
- the **about** modal: header nav is pixel-aligned with the body, and clicking
  the **About / Impressum / Daten und Technisches** headers scrolls to them
- the **language** switch (de/fr/it) changes the question text

> Not yet driven by the scenario: the importance **slider** — added in the
> pixel-diff pass (its handle is deterministic, so it belongs under visual diff).

The network signature it diffs (positions excluded): node/circle counts, the
radii multiset, fill colours, fill-opacities, link count, favourite-star and
dead-question image counts, and which bubble carries the `selected` class.

**UI pixel frames** ([`capture-shots.mjs`](capture-shots.mjs) + [`compare-shots.mjs`](compare-shots.mjs)) —
real `pixelmatch` diffs of the deterministic surface, both viewports. We
screenshot opaque elements (`#content`, `#smartervote-modal`, `#score-gauge`)
and hide the bubble layer (`#bubbles-container`) so the captured surface is
pixel-stable (measured noise floor ≤0.13%; fail threshold 0.25%, overridable via
`FAIL_RATIO`). A diff image is written to `diffs/` for any frame that differs.
Frames: question panel `initial` / `info-open` / `max` / `min`, the **importance
slider** at default + low + high (this is the frame that catches the off-track
handle), `evaluation`, `topic-selected`, the `about` modal, the score `gauge`,
and the question panel in `fr` / `it`.

> Removed-by-design (needed a server) and therefore **not** compared: accounts,
> admin, blog/news/newsletter, the "compare with other people" panel, server
> image upload, Piwik, the tutorial.

Note: hammering the small scale-to-zero fly VM can make it briefly return
503 / time out; it auto-recovers on the next traffic, so just re-run.
