# bedingungslos.ch — archive

Repository for the *smartervote* basic-income quiz by [bedingungslos.ch](https://bedingungslos.ch), built for the 2016 Swiss popular initiative *«Für ein bedingungsloses Grundeinkommen»*.

Answer 21 questions and find out where you stand on universal basic income!

> This archives **only the smartervote quiz** — the interactive game. The
> original bedingungslos.ch was a much larger Meteor site (blog, news, etc);
> those server-backed parts are not part of this static archive (see
> [The original (Meteor) app](#the-original-meteor-app) and
> [What changed vs the original](#what-changed-vs-the-original)).

## Features

- **21 questions** on the unconditional basic income, in **German, French and Italian**
- For each, pick a **side** (pro / contra) and how **important** it is to you
- Your answers grow into coloured **bubbles** — a D3 force layout, sized by
  importance and placed by your stance — with a live **"% pro"** gauge
- An **evaluation** with your overall score and a **per-topic** breakdown
- **Share** your result via a link (answers are encoded in the URL — no server)
- **Download** your bubble picture as a PNG
- Runs entirely in the browser: **no backend, no tracking**, answers stay on your device

## Repository layout

- **[`web/`](web/)** — the live archive: the app rebuilt as a **dependency-free
  static SPA** (plain JS + [Vite](https://vitejs.dev), no server, no database).
  This is what gets deployed.
- **[`visual-tests/`](visual-tests/)** — verifies the rebuild against the original
  by driving both through identical interactions and diffing everything that is a
  pure function of the answers (derived numbers, the bubble-graph structure, and
  the deterministic UI surface pixel-for-pixel).

## The original (Meteor) app

The site was originally a **Meteor 1.2 + CoffeeScript + Blaze + MongoDB** app.
That source — together with its fly.io / MongoDB deployment config (`app/`,
`mongo/`) — lives on the
**[`legacy-meteor`](https://github.com/patte/bge/tree/legacy-meteor)** branch
(pinned by the **`v1-meteor`** tag). It is the baseline `visual-tests/` compared
against, and can still be rebuilt/redeployed from there via `app/Dockerfile`.

## Quickstart (the static app)

```bash
cd web
pnpm install
pnpm dev         # http://localhost:5173
pnpm build       # -> web/dist (static files, ready to host)
```

`pnpm build` bakes the questions and emits `web/dist`. `cd web && pnpm bake`
regenerates `src/data/questions.json` from `src/data/questions.csv` on its own;
`pnpm preview` serves the built `dist/`.

## What changed vs the original

- **Out of scope.** This port covers the *smartervote game* only. The rest of
  the bedingungslos.ch site — blog, news, newsletter signup, etc. —
  was never part of the game and was deliberately not ported.
- **No backend.** The 21 questions (de/fr/it) are baked from `web/src/data/questions.csv` — a copy of the original app's questions.csv, committed here so the build is self-contained — into `src/data/questions.json` (`web/scripts/bake-questions.mjs`).
- **Persistence → localStorage.** Your answers are kept in the browser (the old
  per-browser "visit").
- **Sharing → URL.** "Share" encodes all answers into the URL hash (`#s=…`); the
  recipient's static page reconstructs the bubbles. No server, no DB.
- **Image download.** The bubble image is rendered to a PNG client-side.
- **Removed** (the game's own server-backed bits): accounts, admin, the
  "compare with other people" panel, server-side image upload, Piwik analytics,
  the tutorial.

The D3 engine (`web/src/lib/network.js`) and the bubble state machine
(`web/src/smartervote/engine.js`) are faithful ports of the original
`network.coffee` / `smartervote.coffee`; the original LESS styles and assets are
reused verbatim. d3 v3 is loaded as a classic `<script>` (`web/public/vendor/`)
because its UMD wrapper needs a non-strict global `this`.

This port — the `web/` rebuild and the `visual-tests/` parity harness — was done
by **Claude** (Anthropic).

## Verify against the original

```bash
cd visual-tests
pnpm install
pnpm exec playwright install --with-deps chromium   # browsers, once
pnpm test                                           # starts both apps, drives them identically, compares
```

See [`visual-tests/README.md`](visual-tests/README.md). The comparison needs the
live original to be reachable as the oracle.

## Deployment

`web/dist` is plain static files, hostable anywhere. SEO (per-language `/`, `/fr/`,
`/it/` pages with titles/description, Open Graph, `hreflang`, FAQ structured data,
`robots.txt` + `sitemap.xml`) is generated at build time. The canonical/OG/sitemap
URLs come from `SITE_URL` (default `https://bedingungslos.ch`):

```bash
SITE_URL=https://other-host.example pnpm build
```

The public home is `https://bedingungslos.ch`; point `SITE_URL` at whichever
domain actually **serves** the site (returns 200), and 301-redirect the others
to it.

## License

Code and documentation © 2016 Patrick Recher and Tobias Vogler. Released under the
GPLv3 license — see [LICENSE.txt](LICENSE.txt).
