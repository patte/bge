import { chromium } from 'playwright'
const URL = process.argv[2] || 'http://localhost:5173/'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
page.on('pageerror', e => console.log('PAGEERR', e.message))
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('#bubblesSVG', { timeout: 45000 })
await page.waitForSelector('.max, #gotoEvaluation', { timeout: 45000 })
await page.waitForTimeout(1000)

// ---- BUG 1: select yes -> favorited? ----
const before = await page.evaluate(() => {
  const fav = document.querySelector('#toggle-favorite')
  return { favActive: fav ? fav.classList.contains('active') : null }
})
await page.locator('.max').first().click()
await page.waitForTimeout(400)
const after = await page.evaluate(() => {
  const fav = document.querySelector('#toggle-favorite')
  const stars = document.querySelectorAll('#bubblesSVG image[*|href]').length
  // count images with star href
  const imgs = Array.from(document.querySelectorAll('#bubblesSVG image'))
  const starImgs = imgs.filter(i => (i.getAttribute('xlink:href')||i.getAttributeNS('http://www.w3.org/1999/xlink','href')||'').includes('c3Rhcg')).length
  return { favActive: fav ? fav.classList.contains('active') : null, numImages: imgs.length, starImgs }
})
console.log('BUG1 favorite-on-yes: before=', JSON.stringify(before), 'after=', JSON.stringify(after))

// ---- BUG 2: about navbar alignment ----
await page.locator('.toggle-about').first().click()
await page.waitForTimeout(600)
await page.screenshot({ path: '/tmp/claude-1001/-home-patte-src-bge/88ea04b2-d18b-4b67-bb99-a5ea5ed2fcec/scratchpad/new-about.png' })
const navInfo = await page.evaluate(() => {
  const header = document.querySelector('#smartervote-modal .smartervote-modal-header')
  if (!header) return null
  const links = Array.from(header.querySelectorAll('a')).map(a => {
    const r = a.getBoundingClientRect()
    return { text: a.textContent.trim(), top: Math.round(r.top), left: Math.round(r.left), cls: a.className }
  })
  const hr = header.getBoundingClientRect()
  return { headerRect: { top: Math.round(hr.top), height: Math.round(hr.height) }, links }
})
console.log('BUG2 navbar:', JSON.stringify(navInfo, null, 2))

// ---- BUG 3: click header anchor in about -> scroll? ----
const scrollBefore = await page.evaluate(() => {
  const m = document.querySelector('#smartervote-modal')
  return { modalScrollTop: m ? m.scrollTop : null, windowScrollY: window.scrollY }
})
// click "Daten und Technisches"
await page.locator('#smartervote-modal .smartervote-modal-header a', { hasText: 'Daten' }).click().catch(()=>{})
await page.waitForTimeout(700)
const scrollAfter = await page.evaluate(() => {
  const m = document.querySelector('#smartervote-modal')
  return { modalScrollTop: m ? m.scrollTop : null, windowScrollY: window.scrollY }
})
console.log('BUG3 scroll-on-header: before=', JSON.stringify(scrollBefore), 'after=', JSON.stringify(scrollAfter))

await browser.close()
