// One deterministic, action-rich scenario that is driven IDENTICALLY against
// both the legacy baseline and the new build. After each step we snapshot the
// network-graph signature (extractNetwork) and the UI signature (extractUI);
// the two apps must produce identical snapshot sequences (positions excluded).
//
// This is what verifies the bubble network "looks the same AND behaves the
// same", and exercises these interactive actions: answer max/min/skip, favourite
// toggle, info expand/collapse, next/back, go-to-evaluation, topic select +
// deselect, go-to-questions, the about modal (nav alignment + anchor scroll),
// and the language switch.
//
// NOT yet exercised here: the importance SLIDER. Its handle position is fully
// deterministic (verified run-stable), so the earlier "too hard to drive
// deterministically, skip it" was wrong — and that gap is exactly where a real
// rendering bug (handle drawn left of the track) went undetected. It is covered
// by the pixel-diff pass (see screenshot-diff.mjs) and will be driven here too.
import {
  waitReady,
  extractNetwork,
  extractUI,
  clickIf,
  openAbout,
  clickAboutAnchorAndMeasureScroll,
  aboutHeaderGeometry,
} from './lib.mjs'

const NUM_QUESTIONS = 21

async function snap(page, label, steps) {
  // let the force layout / re-render settle so the signature is stable
  await page.waitForTimeout(250)
  const net = await extractNetwork(page)
  const ui = await extractUI(page)
  steps.push({ label, net, ui })
}

export async function runScenario(page) {
  await waitReady(page)
  const steps = []

  await snap(page, 'initial', steps)

  // ---- info expand / collapse on the first question ----
  let infoExpanded = false
  if (await clickIf(page, '.showInfo', 300)) {
    infoExpanded = true
    await snap(page, 'info-expanded', steps)
    await clickIf(page, '.hideInfo a', 300)
    await snap(page, 'info-collapsed', steps)
  }

  // ---- walk all questions with a deterministic per-index action ----
  for (let i = 0; i < NUM_QUESTIONS; i++) {
    if ((await page.locator('#next').count()) === 0) break
    const mod = i % 4
    if (mod === 0) {
      await clickIf(page, '.max', 150)
      await clickIf(page, '#toggle-favorite', 150) // favourite this one
    } else if (mod === 1) {
      await clickIf(page, '.min', 150)
    } else if (mod === 3) {
      await clickIf(page, '.max', 150)
    }
    // mod === 2 -> skip (answer nothing)

    // snapshot the graph at a couple of mid points (favourite + dead visible)
    if (i === 4) await snap(page, 'after-q4', steps)

    await clickIf(page, '#next', 300)
  }

  // if not auto-advanced into evaluation, force it
  if ((await page.locator('.final-score').count()) === 0) {
    await clickIf(page, '#gotoEvaluation', 500)
  }
  await page.waitForTimeout(600)
  await snap(page, 'evaluation', steps)

  // ---- topic select (dims non-topic bubbles to fill-opacity 0.05) ----
  const topicCount = await page.locator('.topics .topic').count()
  if (topicCount > 0) {
    await page.locator('.topics .topic').first().click()
    await page.waitForTimeout(600)
    await snap(page, 'topic-selected', steps)
    // deselect
    await page.locator('.topics .topic').first().click()
    await page.waitForTimeout(600)
    await snap(page, 'topic-cleared', steps)
  }

  // ---- back to questions ----
  await clickIf(page, '#gotoQuestions', 500)
  await snap(page, 'back-to-questions', steps)

  // ---- about modal: alignment + anchor scrolling ----
  await openAbout(page)
  const aboutGeom = await aboutHeaderGeometry(page)
  const anchors = {}
  for (const t of ['About', 'Impressum', 'Daten']) {
    anchors[t] = await clickAboutAnchorAndMeasureScroll(page, t)
  }
  // close the modal again and reset the window scroll (the anchor clicks above
  // scrolled the page down; #app-header is at the top, so leaving it scrolled
  // would hide the language switcher).
  await page.evaluate(() => {
    const m = document.querySelector('#smartervote-modal')
    if (m && getComputedStyle(m).display !== 'none') {
      const close = m.querySelector('a.toggle-about')
      if (close) close.click()
    }
  })
  await page.waitForTimeout(400)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(200)

  // ---- language switch (de -> fr -> it -> de), capture the question label ----
  // The switcher is only shown/clickable on desktop; on mobile it is hidden, so
  // we record null on both apps (which still compares equal).
  // Select by the span's text (the lang code) so it works on both apps — the
  // legacy switcher has no data-lang attribute. Records the visible question
  // label after the switch, or null if the switcher is hidden (mobile).
  //
  // The legacy app loads each language's question text over DDP on demand, so
  // after clicking we must WAIT for the label to actually change (the new app
  // switches instantly, client-side). We go de -> fr -> it and, for fr/it, wait
  // until the label differs from the German one.
  const readLabel = () =>
    page.evaluate(() => {
      const el = document.querySelector('.the-question')
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : null
    })
  const langLabels = {}
  let deLabel = null
  for (const lang of ['de', 'fr', 'it']) {
    const clicked = await page.evaluate((code) => {
      const spans = Array.from(document.querySelectorAll('#app-header .languages span'))
      const span = spans.find((s) => s.textContent.replace(/\s+/g, '').toLowerCase() === code)
      if (!span) return false
      const r = span.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return false // hidden (mobile)
      span.click()
      return true
    }, lang)
    if (!clicked) {
      langLabels[lang] = null
      continue
    }
    // poll for the label to settle (and, for fr/it, to leave German)
    let label = null
    for (let t = 0; t < 30; t++) {
      await page.waitForTimeout(200)
      label = await readLabel()
      if (label && (lang === 'de' || label !== deLabel)) break
    }
    langLabels[lang] = label
    if (lang === 'de') deLabel = label
  }

  return { infoExpanded, steps, about: { geom: aboutGeom, anchors }, langLabels }
}
