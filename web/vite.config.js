import { defineConfig } from 'vite'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { marked } from 'marked'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Where the static site will be hosted — used for canonical / Open Graph URLs,
// robots.txt and the sitemap. Override at build time: `SITE_URL=… npm run build`.
const SITE_URL = (process.env.SITE_URL || 'https://bge.patpat.org').replace(/\/+$/, '')

// German metadata, faithful to the original site: TITLE is the old Meteor app's
// i18n `pageTitle`, KEYWORDS and OG_SITE_NAME are its SEO config defaults. The
// description is a clean one-liner (the original's was just "Infos und
// Smartervote"); the original never set an og:image (it was a #TODO), so we
// don't either. Single source for <title>, the meta description, the visible
// intro and the social tags so they can't drift apart.
const TITLE = 'Volksinitiative für ein Bedingungsloses Grundeinkommen'
const DESCRIPTION = 'Beantworte 21 Fragen und finde heraus, wie Du zum bedingungslosen Grundeinkommen stehst!'
const OG_SITE_NAME = 'Volksinitiative Bedingungsloses Grundeinkommen'
const KEYWORDS = 'bedingungslos, inconditionnel, incondizionato, Grundeinkommen, Volksinitiative, bge, ubi'

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const stripHtml = (h = '') => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

function loadQuestions() {
  // bake-questions.mjs runs before vite (see package.json), so this exists.
  return JSON.parse(readFileSync(resolve(__dirname, 'src/data/questions.json'), 'utf8'))
}

// Build the crawler-facing payload from the baked questions:
//  - `prerender`: the full Q&A as real HTML, injected into #content. Every
//    crawler (and no-JS visitor) gets it in the initial document; the app
//    overwrites #content on boot, so JS users are unaffected.
//  - `head`: description / robots / canonical / Open Graph / Twitter tags plus a
//    schema.org FAQPage (the 21 questions + their info text) as JSON-LD — the
//    structured signal Googlebot indexes even though the live app is a SPA.
function buildSeo() {
  const questions = loadQuestions()
  const de = (q) => (q.languages && q.languages.de) || {}

  const items = questions
    .map((q) => {
      const l = de(q)
      const answers = [l.minLabel, l.maxLabel].filter(Boolean).join(' / ')
      return (
        `<li><h2>${q.index + 1}. ${esc(l.label || '')}</h2>` +
        (answers ? `<p class="seo-answers">${esc(answers)}</p>` : '') +
        (l.info ? `<div class="seo-info">${marked.parse(l.info)}</div>` : '') +
        `</li>`
      )
    })
    .join('\n')
  const prerender =
    `<div id="seo-content">` +
    `<h1>${esc(TITLE)}</h1><p>${esc(DESCRIPTION)}</p>` +
    `<ol class="seo-questions">${items}</ol>` +
    `</div>`

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((q) => {
      const l = de(q)
      const answer =
        (l.info && stripHtml(marked.parse(l.info))) ||
        `Mögliche Antworten: ${[l.minLabel, l.maxLabel].filter(Boolean).join(' oder ')}.`
      return {
        '@type': 'Question',
        name: l.label || '',
        acceptedAnswer: { '@type': 'Answer', text: answer },
      }
    }),
  }
  // < so info text can never close the <script> early
  const jsonLd = `<script type="application/ld+json">${JSON.stringify(faq).replace(/</g, '\\u003c')}</script>`

  const head = [
    `<meta name="description" content="${esc(DESCRIPTION)}">`,
    `<meta name="keywords" content="${esc(KEYWORDS)}">`,
    `<meta name="robots" content="index,follow">`,
    `<link rel="canonical" href="${SITE_URL}/">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="de_CH">`,
    `<meta property="og:site_name" content="${esc(OG_SITE_NAME)}">`,
    `<meta property="og:title" content="${esc(TITLE)}">`,
    `<meta property="og:description" content="${esc(DESCRIPTION)}">`,
    `<meta property="og:url" content="${SITE_URL}/">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${esc(TITLE)}">`,
    `<meta name="twitter:description" content="${esc(DESCRIPTION)}">`,
    jsonLd,
  ].join('\n    ')

  return { prerender, head }
}

// Inject the SEO payload into index.html (dev + build) and emit robots.txt /
// sitemap.xml on build.
function seoPlugin() {
  let isBuild = false
  return {
    name: 'bge-seo',
    configResolved(cfg) {
      isBuild = cfg.command === 'build'
    },
    transformIndexHtml(html) {
      const { prerender, head } = buildSeo()
      return html
        .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(TITLE)}</title>`)
        .replace('</head>', `    ${head}\n  </head>`)
        .replace('<div id="content"></div>', `<div id="content">${prerender}</div>`)
    },
    closeBundle() {
      if (!isBuild) return
      const out = resolve(__dirname, 'dist')
      writeFileSync(resolve(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`)
      writeFileSync(
        resolve(out, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          `  <url><loc>${SITE_URL}/</loc></url>\n` +
          `</urlset>\n`
      )
    },
  }
}

// Static, dependency-free (at runtime) build of the smartervote app.
// Everything ships as plain static assets so it can be hosted anywhere.
export default defineConfig({
  base: '/',
  plugins: [seoPlugin()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // keep it simple & debuggable
    sourcemap: true,
  },
})
