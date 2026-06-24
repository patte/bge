import { chromium } from 'playwright'
const URL = process.argv[2] || 'http://localhost:4190/de'
const TAG = process.argv[3] || 'base'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERR', e.message))
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForSelector('#bubblesSVG', { timeout: 60000 })
await page.waitForSelector('.max, #gotoEvaluation', { timeout: 60000 })
await page.waitForTimeout(1500)

// BUG1: select yes -> favorite?
const before = await page.evaluate(() => {
  const fav = document.querySelector('#toggle-favorite')
  return { favActive: fav ? fav.classList.contains('active') : null }
})
await page.locator('.max').first().click()
await page.waitForTimeout(500)
const after = await page.evaluate(() => {
  const fav = document.querySelector('#toggle-favorite')
  return { favActive: fav ? fav.classList.contains('active') : null }
})
console.log(`[${TAG}] BUG1 favorite-on-yes: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)

// BUG2: about navbar
await page.locator('.toggle-about').first().click()
await page.waitForTimeout(800)
await page.screenshot({ path: `/tmp/claude-1001/-home-patte-src-bge/88ea04b2-d18b-4b67-bb99-a5ea5ed2fcec/scratchpad/${TAG}-about.png` })
const navInfo = await page.evaluate(() => {
  const header = document.querySelector('#smartervote-modal .smartervote-modal-header')
  if (!header) return null
  const links = Array.from(header.querySelectorAll('a')).map(a => {
    const r = a.getBoundingClientRect()
    return { text: a.textContent.trim(), top: Math.round(r.top), left: Math.round(r.left) }
  })
  const modal = document.querySelector('#smartervote-modal')
  const mr = modal.getBoundingClientRect()
  // first content heading
  const h1 = modal.querySelector('h1')
  const h1r = h1 ? h1.getBoundingClientRect() : null
  return { modalRect: { left: Math.round(mr.left), width: Math.round(mr.width) }, h1Left: h1r ? Math.round(h1r.left) : null, links, headings: Array.from(modal.querySelectorAll('h1,h2')).slice(0,6).map(h=>({tag:h.tagName,id:h.id,text:h.textContent.trim().slice(0,30)})) }
})
console.log(`[${TAG}] BUG2 navbar:`, JSON.stringify(navInfo, null, 2))

// BUG3: click header anchor -> scroll
const sb = await page.evaluate(() => ({ modalScrollTop: document.querySelector('#smartervote-modal').scrollTop, win: window.scrollY }))
await page.locator('#smartervote-modal .smartervote-modal-header a', { hasText: 'Daten' }).click().catch(()=>{})
await page.waitForTimeout(900)
const sa = await page.evaluate(() => ({ modalScrollTop: document.querySelector('#smartervote-modal').scrollTop, win: window.scrollY, hash: location.hash, target: (()=>{const t=document.querySelector('#daten-und-technisches'); return t?Math.round(t.getBoundingClientRect().top):null})() }))
console.log(`[${TAG}] BUG3 scroll-on-header: before=${JSON.stringify(sb)} after=${JSON.stringify(sa)}`)

await browser.close()
