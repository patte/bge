// Shared harness used to drive BOTH the legacy baseline and the new static
// build through identical, deterministic interactions and to extract the
// derived state that should match regardless of the (non-deterministic) force
// layout positions: the score gauge %, the evaluation score + per-topic %,
// and the multiset of bubble radii.
//
// Both apps expose the exact same selectors (.max/.min/#next/#gotoEvaluation,
// #score-gauge span, .final-score span, .topics .topic, #bubblesSVG circle),
// so one driver works for both.

export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
}

export async function waitReady(page) {
  // question panel rendered (answer buttons present) + svg present
  await page.waitForSelector('#bubblesSVG', { timeout: 45000 })
  await page.waitForSelector('.max, #gotoEvaluation', { timeout: 45000 })
  await page.waitForTimeout(800) // let the initial layout/render settle
}

async function inEvaluation(page) {
  return (await page.locator('.final-score').count()) > 0
}

// mode: 'max' | 'min' | 'skip' | 'mixed'
export async function playScript(page, mode) {
  for (let i = 0; i < 25; i++) {
    if (await inEvaluation(page)) break
    const hasNext = (await page.locator('#next').count()) > 0
    if (!hasNext) break

    if (mode === 'max' || (mode === 'mixed' && i % 2 === 0)) {
      const max = page.locator('.max')
      if ((await max.count()) > 0) {
        await max.first().click()
        await page.waitForTimeout(120)
      }
    } else if (mode === 'min' || (mode === 'mixed' && i % 2 === 1)) {
      const min = page.locator('.min')
      if ((await min.count()) > 0) {
        await min.first().click()
        await page.waitForTimeout(120)
      }
    }
    // 'skip' answers nothing

    const next = page.locator('#next')
    if ((await next.count()) > 0) {
      await next.first().click()
      await page.waitForTimeout(300)
    }
  }
  // ensure we are on the evaluation screen
  if (!(await inEvaluation(page))) {
    const goto = page.locator('#gotoEvaluation')
    if ((await goto.count()) > 0) {
      await goto.first().click()
      await page.waitForTimeout(500)
    }
  }
  // let the evaluation render + bubble preview settle
  await page.waitForTimeout(800)
}

export async function extractState(page) {
  return await page.evaluate(() => {
    const svg = document.querySelector('#bubblesSVG')
    const allR = svg
      ? Array.from(svg.querySelectorAll('circle')).map((c) => Math.round(parseFloat(c.getAttribute('r') || '0')))
      : []
    const radii = allR.filter((r) => r > 0).sort((a, b) => a - b)
    const gauge = document.querySelector('#score-gauge span')
    const finalScore = document.querySelector('.final-score span')
    const topics = Array.from(document.querySelectorAll('.topics .topic')).map((b) =>
      b.textContent.replace(/\s+/g, ' ').trim()
    )
    return {
      gauge: gauge ? gauge.textContent.trim() : null,
      finalScore: finalScore ? finalScore.textContent.trim() : null,
      topics,
      radii,
      numCircles: allR.length,
      numNonZero: radii.length,
    }
  })
}

// Extract the question data from whichever app we're on:
//  - legacy baseline exposes Minimongo `Questions`
//  - new build exposes window.__BGE_QUESTIONS
// Returns a normalized, index-sorted array of the meaningful fields.
export async function extractQuestions(page) {
  return await page.evaluate(() => {
    let raw = null
    if (window.Questions && typeof window.Questions.find === 'function') {
      raw = window.Questions.find({}, { sort: { index: 1 } }).fetch()
    } else if (window.__BGE_QUESTIONS) {
      raw = window.__BGE_QUESTIONS
    }
    if (!raw) return null
    const round = (n) => (typeof n === 'number' ? Math.round(n * 10000) / 10000 : n)
    const lang = (l) =>
      l ? { label: l.label, minLabel: l.minLabel, maxLabel: l.maxLabel, info: l.info } : null
    return raw
      .map((q) => ({
        index: q.index,
        cluster: q.cluster,
        topic: q.topic,
        hrid: q.hrid,
        min: round(q.min),
        max: round(q.max),
        step: round(q.step),
        isOneSided: !!q.isOneSided,
        isOnlyNegative: !!q.isOnlyNegative,
        isLeftPositiv: !!q.isLeftPositiv,
        languages: {
          de: lang(q.languages && q.languages.de),
          fr: lang(q.languages && q.languages.fr),
          it: lang(q.languages && q.languages.it),
        },
      }))
      .sort((a, b) => a.index - b.index)
  })
}

export async function clearStorage(page) {
  await page.evaluate(() => {
    try {
      localStorage.clear()
    } catch (e) {}
  })
}

// ---------------------------------------------------------------------------
// Network (D3 bubble graph) signature.
//
// The force-layout x/y POSITIONS are non-deterministic, so we never compare
// those. Everything else the renderer draws IS a pure function of the answers
// and is identical between the legacy app and the port (network.coffee ->
// network.js is a verbatim port, same star/dead base64 images & sizes). We
// snapshot that structure so we can assert the graph LOOKS and BEHAVES the same:
//   - number of <circle> nodes and how many are visible (r > 0)
//   - the multiset of radii (rounded)
//   - the multiset of fill colours (gradient refs / solid fills)
//   - the multiset of fill-opacities (topic dimming sets 0.05)
//   - number of link <line>s
//   - number of favourite-star images (w=20) and dead-question images (w=40)
//   - which nodes carry the "selected" class (the current question's bubble)
export async function extractNetwork(page) {
  return await page.evaluate(() => {
    const svg = document.querySelector('#bubblesSVG')
    if (!svg) return null
    const xlink = 'http://www.w3.org/1999/xlink'
    const nodes = Array.from(svg.querySelectorAll('#nodes > g.node'))
    const radii = []
    const colors = []
    const opacities = []
    let circles = 0
    let selected = 0
    let favStars = 0
    let deadImgs = 0
    let otherImgs = 0
    for (const g of nodes) {
      const cls = g.getAttribute('class') || ''
      if (/\bselected\b/.test(cls)) selected++
      const c = g.querySelector('circle')
      if (c) {
        circles++
        const r = Math.round(parseFloat(c.getAttribute('r') || '0'))
        if (r > 0) radii.push(r)
        const fill = c.style.fill || ''
        if (fill) colors.push(fill.replace(/\s+/g, ''))
        const op = c.style.fillOpacity || c.getAttribute('fill-opacity') || '1'
        opacities.push(Math.round(parseFloat(op) * 100) / 100)
      }
      const img = g.querySelector('image')
      if (img) {
        const href = img.getAttribute('xlink:href') || img.getAttributeNS(xlink, 'href') || img.getAttribute('href') || ''
        const w = Math.round(parseFloat(img.getAttribute('width') || '0'))
        if (href && w === 20) favStars++
        else if (href && w === 40) deadImgs++
        else if (href) otherImgs++
      }
    }
    const links = svg.querySelectorAll('#links > line.link').length
    const num = (a) => a.slice().sort((x, y) => x - y)
    const tally = (a) => {
      const m = {}
      for (const v of a) m[v] = (m[v] || 0) + 1
      return m
    }
    return {
      circles,
      visible: radii.length,
      radii: num(radii),
      links,
      selected,
      favStars,
      deadImgs,
      otherImgs,
      colorTally: tally(colors),
      opacityTally: tally(opacities),
    }
  })
}

// Compact UI signature (the answer panel / evaluation state) — also a pure
// function of the answers, so it must match between the two apps.
export async function extractUI(page) {
  return await page.evaluate(() => {
    const txt = (sel) => {
      const el = document.querySelector(sel)
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : null
    }
    const has = (sel) => document.querySelector(sel) != null
    const cls = (sel, c) => {
      const el = document.querySelector(sel)
      return el ? el.classList.contains(c) : null
    }
    return {
      showsEvaluation: has('.final-score'),
      questionIndex: txt('#question-index'),
      questionLabel: txt('.the-question'),
      gauge: txt('#score-gauge span'),
      mobileScore: txt('#mobile-score'),
      maxActive: cls('.max', 'active'),
      minActive: cls('.min', 'active'),
      favActive: cls('#toggle-favorite', 'active'),
      infoExpanded: has('.hideInfo'),
      finalScore: txt('.final-score span'),
    }
  })
}

// ---- deterministic action helpers (work identically on both apps) ----------
export async function clickIf(page, selector, wait = 250) {
  const loc = page.locator(selector)
  if ((await loc.count()) > 0) {
    await loc.first().click()
    await page.waitForTimeout(wait)
    return true
  }
  return false
}

export async function openAbout(page) {
  await clickIf(page, '.toggle-about', 600)
}

// Click an about-modal header anchor (e.g. "Daten") and report whether the
// window (or the modal) actually scrolled — i.e. the in-page anchor resolved.
export async function clickAboutAnchorAndMeasureScroll(page, hasText) {
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    const m = document.querySelector('#smartervote-modal')
    if (m) m.scrollTop = 0
  })
  await page.waitForTimeout(100)
  const before = await page.evaluate(() => ({
    win: window.scrollY,
    modal: (document.querySelector('#smartervote-modal') || {}).scrollTop || 0,
  }))
  await page
    .locator('#smartervote-modal .smartervote-modal-header a', { hasText })
    .first()
    .click()
    .catch(() => {})
  await page.waitForTimeout(700)
  const after = await page.evaluate(() => ({
    win: window.scrollY,
    modal: (document.querySelector('#smartervote-modal') || {}).scrollTop || 0,
  }))
  const scrolled = after.win - before.win + (after.modal - before.modal)
  return { scrolled, didScroll: scrolled > 20 }
}

// Pixel geometry of the about-modal nav vs the content body — used to assert
// the header lines up with the body (the alignment bug).
export async function aboutHeaderGeometry(page) {
  return await page.evaluate(() => {
    const header = document.querySelector('#smartervote-modal .smartervote-modal-header')
    const modal = document.querySelector('#smartervote-modal')
    if (!header || !modal) return null
    const firstLink = header.querySelector('a.pull-left')
    const h1 = modal.querySelector('h1')
    const r = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width) }
    }
    return { modal: r(modal), firstNavLink: r(firstLink), firstHeading: r(h1) }
  })
}
