# bedingungslos.ch — archive

Static archive of **bedingungslos.ch**, the *smartervote* basic-income quiz built
in 2016 for the Swiss popular initiative
*«Für ein bedingungsloses Grundeinkommen»*.

Answer 21 questions on the unconditional basic income (de / fr / it); your answers
become coloured D3 "bubbles" sized and placed by how you answered, with a live
"% pro" gauge and a per-topic evaluation.

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
(pinned by the **`v1-meteor`** tag). It is the baseline `visual-tests/` compares
against, and can still be rebuilt/redeployed from there via `app/Dockerfile`.

## Quickstart (the static app)

```bash
cd web
pnpm install
pnpm dev         # http://localhost:5173
pnpm build       # -> web/dist (static files, ready to host)
```

The 21 questions (de/fr/it) are baked from the original `questions.csv` into JSON
at build time — there is no backend. Answers are kept in `localStorage`; sharing
encodes the full answer set into the URL hash. See [`web/README.md`](web/README.md)
for the porting details and what was removed (accounts, admin, blog, server image
upload, …).

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
URLs come from `SITE_URL` (default `https://bge.patpat.org`):

```bash
SITE_URL=https://bedingungslos.ch pnpm build
```

The intended public home is `https://bedingungslos.ch`; point `SITE_URL` at
whichever domain actually **serves** the site (returns 200), and 301-redirect the
others to it.

## License

Code and documentation © 2016 Patrick Recher and Tobias Vogler. Released under the
GPLv3 license — see [LICENSE.txt](LICENSE.txt).
