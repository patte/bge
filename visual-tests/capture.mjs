// Capture derived state + screenshots for one target app.
// Usage: node capture.mjs <name> <baseUrl>
//   node capture.mjs baseline http://localhost:3000
//   node capture.mjs new      http://localhost:4180
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { VIEWPORTS, waitReady, playScript, extractState, extractQuestions } from './lib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const name = process.argv[2] || 'new'
const baseUrl = process.argv[3] || 'http://localhost:4180'

const OUT = resolve(__dirname, name)
mkdirSync(OUT, { recursive: true })
const shot = (p) => resolve(OUT, p)

const SCRIPTS = ['max', 'min', 'mixed', 'skip']

// Fresh browser context per run => empty localStorage AND a fresh anonymous
// visit on the legacy baseline, so every scenario starts from a clean slate.
async function freshContextPage(browser, viewport) {
  const context = await browser.newContext({ viewport: VIEWPORTS[viewport] })
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`  [console.error:${name}] ${m.text()}`)
  })
  page.on('pageerror', (e) => console.log(`  [pageerror:${name}] ${e.message}`))
  // Meteor keeps a DDP long-poll open, so 'load' can be slow; domcontentloaded
  // + waitReady (which waits for the actual app selectors) is more reliable.
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await waitReady(page)
  return { context, page }
}

async function main() {
  const browser = await chromium.launch()
  const results = { name, baseUrl, viewports: {} }

  for (const vp of ['desktop', 'mobile']) {
    results.viewports[vp] = {}

    // initial screenshot (fresh load) + about modal + languages (desktop only)
    {
      const { context, page } = await freshContextPage(browser, vp)
      if (vp === 'desktop') {
        results.questions = await extractQuestions(page)
        console.log(`[${name}] extracted ${results.questions ? results.questions.length : 'NO'} questions`)
      }
      await page.screenshot({ path: shot(`${vp}-initial.png`) })
      const aboutLink = page.locator('.toggle-about').first()
      if ((await aboutLink.count()) > 0) {
        await aboutLink.click()
        await page.waitForTimeout(500)
        await page.screenshot({ path: shot(`${vp}-about.png`) })
      }
      await context.close()
    }

    // language screenshots on a clean page (LANGUAGES order is [de, fr, it])
    if (vp === 'desktop') {
      const langs = ['de', 'fr', 'it']
      for (let li = 0; li < langs.length; li++) {
        const { context, page } = await freshContextPage(browser, vp)
        const span = page.locator('#app-header .languages span').nth(li)
        if ((await span.count()) > 0) {
          await span.click()
          await page.waitForTimeout(700)
        }
        await page.screenshot({ path: shot(`${vp}-lang-${langs[li]}.png`) })
        await context.close()
      }
    }

    for (const mode of SCRIPTS) {
      const { context, page } = await freshContextPage(browser, vp)
      await playScript(page, mode)
      const state = await extractState(page)
      results.viewports[vp][mode] = state
      await page.screenshot({ path: shot(`${vp}-${mode}-eval.png`) })
      console.log(
        `[${name}/${vp}/${mode}] gauge=${state.gauge} final=${state.finalScore} nonZeroRadii=${state.numNonZero} topics=${JSON.stringify(state.topics)}`
      )
      await context.close()
    }
  }

  await browser.close()
  writeFileSync(resolve(OUT, 'state.json'), JSON.stringify(results, null, 2))
  console.log(`\nwrote ${resolve(OUT, 'state.json')}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
