import { defineConfig } from 'vite'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { marked } from 'marked'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Where the static site will be hosted — used for canonical / Open Graph / the
// hreflang alternates / sitemap. Override at build: `SITE_URL=… npm run build`.
const SITE_URL = (process.env.SITE_URL || 'https://bge.patpat.org').replace(/\/+$/, '')

const LANGUAGES = ['de', 'fr', 'it']

// Per-language metadata. `title` is the original Meteor app's i18n `pageTitle`
// (verbatim). `desc` is a clean one-liner — the original's description was only
// the German "Infos und Smartervote", so the fr/it lines are translations of
// the German one (please review). `path` is where each language is published.
const META = {
  de: {
    title: 'Volksinitiative für ein Bedingungsloses Grundeinkommen',
    desc: 'Beantworte 21 Fragen und finde heraus, wie Du zum bedingungslosen Grundeinkommen stehst!',
    ogLocale: 'de_CH',
    path: '/',
  },
  fr: {
    title: 'Initiative populaire fédérale pour un revenu de base inconditionnel',
    desc: 'Réponds à 21 questions et découvre ta position sur le revenu de base inconditionnel.',
    ogLocale: 'fr_CH',
    path: '/fr/',
  },
  it: {
    title: 'Iniziativa popolare federale per un reddito di base incondizionato',
    desc: 'Rispondi a 21 domande e scopri qual è la tua posizione sul reddito di base incondizionato.',
    ogLocale: 'it_CH',
    path: '/it/',
  },
}

// Faithful to the original SEO config (single, multilingual keyword list +
// German og:site_name — the original didn't localise those).
const KEYWORDS = 'bedingungslos, inconditionnel, incondizionato, Grundeinkommen, Volksinitiative, bge, ubi'
const OG_SITE_NAME = 'Volksinitiative Bedingungsloses Grundeinkommen'

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const stripHtml = (h = '') => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

function loadQuestions() {
  // bake-questions.mjs runs before vite (see package.json), so this exists.
  return JSON.parse(readFileSync(resolve(__dirname, 'src/data/questions.json'), 'utf8'))
}

// Resolve a question field in `lang`, falling back to German when a translation
// is missing (a few it `info` fields are empty in the source data).
const field = (q, lang, key) => {
  const l = q.languages || {}
  return (l[lang] && l[lang][key]) || (l.de && l.de[key]) || ''
}

// Build the crawler-facing payload for one language:
//  - `prerender`: the full Q&A as real HTML for #content (every crawler / no-JS
//    visitor gets it in the initial document; the app overwrites #content on boot)
//  - `head`: description / keywords / canonical / hreflang alternates / Open
//    Graph / Twitter + a schema.org FAQPage (21 Q&A) as JSON-LD
function buildSeo(lang) {
  const M = META[lang]
  const questions = loadQuestions()

  const items = questions
    .map((q) => {
      const label = field(q, lang, 'label')
      const answers = [field(q, lang, 'minLabel'), field(q, lang, 'maxLabel')].filter(Boolean).join(' / ')
      const info = field(q, lang, 'info')
      return (
        `<li><h2>${q.index + 1}. ${esc(label)}</h2>` +
        (answers ? `<p class="seo-answers">${esc(answers)}</p>` : '') +
        (info ? `<div class="seo-info">${marked.parse(info)}</div>` : '') +
        `</li>`
      )
    })
    .join('\n')
  const prerender =
    `<div id="seo-content">` +
    `<h1>${esc(M.title)}</h1><p>${esc(M.desc)}</p>` +
    `<ol class="seo-questions">${items}</ol>` +
    `</div>`

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: lang,
    mainEntity: questions.map((q) => {
      const info = field(q, lang, 'info')
      const answer =
        (info && stripHtml(marked.parse(info))) ||
        [field(q, lang, 'minLabel'), field(q, lang, 'maxLabel')].filter(Boolean).join(' / ')
      return { '@type': 'Question', name: field(q, lang, 'label'), acceptedAnswer: { '@type': 'Answer', text: answer } }
    }),
  }
  // escape < so question/info text can never close the <script> early
  const jsonLd = `<script type="application/ld+json">${JSON.stringify(faq).replace(/</g, '\\u003c')}</script>`

  const alternates = [
    ...LANGUAGES.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE_URL}${META[l].path}">`),
    `<link rel="alternate" hreflang="x-default" href="${SITE_URL}/">`,
  ].join('\n    ')
  const ogAltLocales = LANGUAGES.filter((l) => l !== lang)
    .map((l) => `<meta property="og:locale:alternate" content="${META[l].ogLocale}">`)
    .join('\n    ')

  const head = [
    `<meta name="description" content="${esc(M.desc)}">`,
    `<meta name="keywords" content="${esc(KEYWORDS)}">`,
    `<meta name="robots" content="index,follow">`,
    `<link rel="canonical" href="${SITE_URL}${M.path}">`,
    alternates,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="${M.ogLocale}">`,
    ogAltLocales,
    `<meta property="og:site_name" content="${esc(OG_SITE_NAME)}">`,
    `<meta property="og:title" content="${esc(M.title)}">`,
    `<meta property="og:description" content="${esc(M.desc)}">`,
    `<meta property="og:url" content="${SITE_URL}${M.path}">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${esc(M.title)}">`,
    `<meta name="twitter:description" content="${esc(M.desc)}">`,
    jsonLd,
  ].join('\n    ')

  return { title: M.title, head, prerender }
}

// Inject one language's SEO into an HTML string. Markers make the language-
// specific regions replaceable so the fr/it pages can be derived from the built
// (de) index.html without re-running Vite.
function injectSeo(html, lang) {
  const { title, head, prerender } = buildSeo(lang)
  return html
    .replace(/<html lang="[a-z]{2}">/, `<html lang="${lang}">`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(
      /(<!--bge:head-->)[\s\S]*?(<!--\/bge:head-->)/,
      `$1\n    ${head}\n    $2`
    )
    .replace(/(<!--bge:content-->)[\s\S]*?(<!--\/bge:content-->)/, `$1${prerender}$2`)
}

function sitemapXml() {
  const url = (path) =>
    `  <url>\n    <loc>${SITE_URL}${path}</loc>\n` +
    LANGUAGES.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE_URL}${META[l].path}"/>`).join('\n') +
    `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}/"/>\n  </url>`
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    LANGUAGES.map((l) => url(META[l].path)).join('\n') +
    `\n</urlset>\n`
  )
}

// Inject the de SEO into index.html (dev + build); on build, derive the fr/it
// pages and emit robots.txt / sitemap.xml.
function seoPlugin() {
  let isBuild = false
  return {
    name: 'bge-seo',
    configResolved(cfg) {
      isBuild = cfg.command === 'build'
    },
    transformIndexHtml(html) {
      // add the markers around the regions injectSeo() fills, then inject de
      const withMarkers = html
        .replace('</head>', `    <!--bge:head--><!--/bge:head-->\n  </head>`)
        .replace('<div id="content"></div>', `<div id="content"><!--bge:content--><!--/bge:content--></div>`)
      return injectSeo(withMarkers, 'de')
    },
    closeBundle() {
      if (!isBuild) return
      const out = resolve(__dirname, 'dist')
      const deHtml = readFileSync(resolve(out, 'index.html'), 'utf8')
      for (const lang of LANGUAGES) {
        if (lang === 'de') continue
        mkdirSync(resolve(out, lang), { recursive: true })
        writeFileSync(resolve(out, lang, 'index.html'), injectSeo(deHtml, lang))
      }
      writeFileSync(resolve(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`)
      writeFileSync(resolve(out, 'sitemap.xml'), sitemapXml())
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
