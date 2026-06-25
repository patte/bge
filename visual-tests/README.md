# visual-tests

Verifies the static rebuild in [`../web`](../web) reproduces the **original**
smartervote app. The default run is **self-contained**: it compares the new build
against a **frozen snapshot of the original** committed in [`fixtures/`](fixtures/)
— the original's exact questions, scores, per-topic %, bubble radii, de/fr/it
text, and the full network + UI signature of every interactive action. No old app
required.

`--reverify` re-captures the **live** original to re-prove fidelity (including the
cross-app pixel diff) and refresh the fixtures.

## Run

```bash
pnpm run setup         # once: install + playwright chromium (+ system deps)
pnpm test              # self-contained: new build vs the frozen fixtures/
pnpm run test:quick    # skip the slower 4-pattern derived-state pass
pnpm run test:reverify # re-prove against the LIVE original (+ pixel diff; refresh fixtures/)
```

`pnpm test` ([`run.mjs`](run.mjs)) starts the new build's Vite server on `:4180`,
captures it, and compares against `fixtures/` — exiting non-zero on any mismatch.
It needs no old app. `--reverify` additionally starts the proxy to the live
original (see Oracle), captures it, runs the cross-app pixel diff, and rewrites
`fixtures/` from the fresh capture. Ports overridable via `PORT_NEW` /
`PROXY_PORT`; `VERBOSE=1` echoes server logs.

## Fixtures (the frozen baseline)

[`fixtures/`](fixtures/) holds the original's captured behaviour — `baseline-state.json`
(derived numbers), `baseline-actions.json` (the action-scenario network+UI
signatures) and `baseline-questions.json` (de/fr/it text). These are **committed**
and are what the default run compares against, so the suite keeps working after
the legacy app is gone. Regenerate them from the live original with
`pnpm run test:reverify`.

## Oracle (only for `--reverify`)

The original lives on the
[`legacy-meteor`](https://github.com/patte/bge/tree/legacy-meteor) branch and is
deployed as the fly image at `https://bge.fly.dev` (the same `app/Dockerfile`).
[`proxy.mjs`](proxy.mjs) reverse-proxies it onto `http://localhost:4190` so the
headless browser can drive it. Once the legacy app is decommissioned `--reverify`
can no longer run, but the default `pnpm test` keeps working off the committed
fixtures.

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

**UI pixel frames** ([`capture-shots.mjs`](capture-shots.mjs) + [`compare-shots.mjs`](compare-shots.mjs))
— **`--reverify` only** (a cross-app pixel diff needs the live original; pixel
goldens don't travel across machines, so they aren't frozen). Real `pixelmatch`
diffs of the deterministic surface, both viewports. We
screenshot opaque elements (`#content`, `.final-score`, `.topics`,
`#smartervote-modal`, `#score-gauge`) and hide the non-deterministic layers
(`#bubbles-container` and the evaluation's `#mybubbles-preview` PNG) so the
captured surface is pixel-stable (measured noise floor ≤0.13%; fail threshold
0.25%, overridable via `FAIL_RATIO`). A diff image is written to `diffs/` for any
frame that differs. Frames: question panel `initial` / `info-open` / `max` /
`min`, the **importance slider** at default + low + high (the frame that catches
the off-track handle), `eval-score`, `eval-topics` / `topic-selected`, the
`about` modal, the score `gauge`, and the question panel in `fr` / `it`.

Tall text panels (`about`, `info-open`) are compared on **height parity** rather
than pixel overlap — any sub-pixel line-height rounding accumulates over
thousands of px and breaks naive pixel overlap; their content is verified by the
action/multilang comparators. Fixed-size frames get the full pixel diff.

This pass found and drove the fix for several CSS regressions the structural
checks couldn't see: the off-track slider handle (noUiSlider v15 positioning),
the answer/reset buttons falling back to Arial, a 1.6× `rem` inflation (the
original's Bootstrap `html{font-size:10px}` root was missing), the question
heading rendering at weight 400 instead of 700, and over-tall headings/paragraphs
(missing Bootstrap `line-height:1.1` / `p` margins). After them the whole
interactive surface matches the original at ≤0.08%.

> Removed-by-design (needed a server) and therefore **not** pixel-compared: the
> evaluation **sharing** block (server `myBubbles` upload → client copy-link +
> download, and the rasterised bubble preview), plus accounts, admin,
> blog/news/newsletter, the "compare with other people" panel, Piwik, the
> tutorial. The evaluation's deterministic parts (score, sentence, per-topic %)
> are still compared via `eval-score` / `eval-topics` and the action scenario.

Note: hammering the small scale-to-zero fly VM can make it briefly return
503 / time out; it auto-recovers on the next traffic, so just re-run.
