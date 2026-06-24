// Pixel-level capture of the DETERMINISTIC UI surface of one app.
// Usage: node capture-shots.mjs <name> <baseUrl> [outdir]
//   node capture-shots.mjs new      http://localhost:4180
//   node capture-shots.mjs baseline http://localhost:4190/de
//
// We screenshot opaque, deterministic ELEMENTS (the #content panel, the about
// modal, the score gauge) rather than the whole page. The force-driven bubbles
// live in #bubbles-container *behind* the opaque panel, so an element shot of
// #content is naturally bubble-free and pixel-stable — exactly the surface we
// want to compare. Each named frame is a defined interaction state.
import { chromium } from 'playwright'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { VIEWPORTS, waitReady, clearStorage } from './lib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const name = process.argv[2] || 'new'
const baseUrl = process.argv[3] || 'http://localhost:4180'
const outRoot = resolve(__dirname, process.argv[4] || name, 'shots')

rmSync(outRoot, { recursive: true, force: true })
mkdirSync(outRoot, { recursive: true })

const NUM_QUESTIONS = 21

async function loadFresh(page) {
  // retry for the scale-to-zero baseline VM
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
      await waitReady(page)
      await clearStorage(page)
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 })
      await waitReady(page)
      await page.waitForTimeout(1200)
      return
    } catch (e) {
      console.log(`  [${name}] load attempt ${attempt} failed (${e.message.split('\n')[0]}), retrying…`)
      await page.waitForTimeout(3000)
    }
  }
  throw new Error(`${name}: never became ready`)
}

async function shot(page, vp, frame, selector) {
  const el = await page.$(selector)
  if (!el) {
    console.log(`  [${name}/${vp}] frame ${frame}: selector ${selector} not found — skipped`)
    return
  }
  // skip elements that aren't visible in this viewport (e.g. #score-gauge is
  // hidden on mobile, which uses #mobile-score instead)
  const box = await el.boundingBox()
  if (!box || box.width === 0 || box.height === 0 || !(await el.isVisible())) {
    console.log(`  [${name}/${vp}] frame ${frame}: ${selector} not visible — skipped`)
    return
  }
  // settle: the slider has a 0.1s transform transition
  await page.waitForTimeout(250)
  await el.screenshot({ path: resolve(outRoot, `${vp}-${frame}.png`) })
}

// click a locator only if it exists and is visible (returns whether it clicked)
async function tryClick(page, selector, wait = 250) {
  const loc = page.locator(selector).first()
  if ((await loc.count()) === 0 || !(await loc.isVisible())) return false
  await loc.click()
  await page.waitForTimeout(wait)
  return true
}

// click the noUiSlider track at a fraction of its width (works on both the old
// and the v15 widget — both move the nearest handle to a tap)
async function tapSlider(page, frac) {
  const box = await page.evaluate(() => {
    const el = document.querySelector('#nouislider .noUi-base, #nouislider')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })
  if (!box || box.w === 0) return
  await page.mouse.click(box.x + frac * box.w, box.y + box.h / 2)
  await page.waitForTimeout(300)
}

async function runViewport(browser, vp) {
  const context = await browser.newContext({ viewport: VIEWPORTS[vp] })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log(`  [pageerror:${name}/${vp}] ${e.message}`))
  await loadFresh(page)
  // Hide ONLY the timing-variable layer: the force-driven bubbles. That layer is
  // #bubbles-container (incl. the floating pitcher bubble that drifts over the
  // panel) AND #mybubbles-preview — the evaluation screen's share image, which is
  // a PNG SNAPSHOT of those same bubbles and therefore drifts run-to-run too
  // (measured: without this the mobile evaluation/topic frames differ ~2.5%
  // between two captures of the *same* app). Everything else we screenshot
  // (#content, the slider handle, the modal, the gauge) is deterministic, so the
  // captured surface becomes pixel-stable.
  await page.addStyleTag({
    content: '#bubbles-container,#mybubbles-preview{visibility:hidden !important}',
  })

  // --- first-question panel frames (non-destructive) ---
  await shot(page, vp, 'q-initial', '#content')
  await shot(page, vp, 'gauge', '#score-gauge')
  await shot(page, vp, 'app-header', '#app-header') // logo + language switcher

  // languages
  for (const lang of ['fr', 'it', 'de']) {
    await page.evaluate((code) => {
      const s = Array.from(document.querySelectorAll('#app-header .languages span')).find(
        (x) => x.textContent.replace(/\s+/g, '').toLowerCase() === code
      )
      const r = s && s.getBoundingClientRect()
      if (s && r.width > 0) s.click()
    }, lang)
    await page.waitForTimeout(500)
    if (lang !== 'de') await shot(page, vp, `lang-${lang}`, '#content')
  }

  // more information expand / collapse
  if (await tryClick(page, '.showInfo', 300)) {
    await shot(page, vp, 'q-info-open', '#content')
    await tryClick(page, '.hideInfo a', 300)
  }

  // slider at low / high (THE frame that exposes the off-track handle)
  await tapSlider(page, 0.2)
  await shot(page, vp, 'slider-low', '#content')
  await tapSlider(page, 0.8)
  await shot(page, vp, 'slider-high', '#content')

  // answer states on the first question
  if (await tryClick(page, '.max', 300)) await shot(page, vp, 'q-max', '#content')
  if (await tryClick(page, '.min', 300)) await shot(page, vp, 'q-min', '#content')

  // --- evaluation (answer everything deterministically) ---
  for (let i = 0; i < NUM_QUESTIONS; i++) {
    if ((await page.locator('#next').count()) === 0) break
    await tryClick(page, '.max', 120)
    if (!(await tryClick(page, '#next', 220))) break
  }
  if ((await page.locator('.final-score').count()) === 0) await tryClick(page, '#gotoEvaluation', 500)
  await page.waitForTimeout(500)
  // Screenshot the DETERMINISTIC evaluation sub-sections only. We skip the
  // .sharing block on purpose: it holds #mybubbles-preview (a non-deterministic
  // PNG of the bubbles, with a generated size) and the redesigned share buttons
  // (the server-upload feature was replaced by client copy-link/download), so it
  // legitimately differs from the original.
  await shot(page, vp, 'eval-score', '.final-score')
  await shot(page, vp, 'eval-topics', '.topics')

  // topic selected (dimming applies; the panel text is deterministic)
  if (await tryClick(page, '.topics .topic', 500)) await shot(page, vp, 'topic-selected', '.topics')

  // back to questions + about modal
  await tryClick(page, '#gotoQuestions', 400)
  if (await tryClick(page, '.toggle-about', 700)) await shot(page, vp, 'about', '#smartervote-modal')

  await context.close()
}

async function main() {
  const browser = await chromium.launch()
  for (const vp of ['desktop', 'mobile']) {
    await runViewport(browser, vp)
    console.log(`[${name}/${vp}] shots captured`)
  }
  await browser.close()
  console.log(`wrote ${outRoot}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
