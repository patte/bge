// Drive ONE app through the full action scenario (scenario.mjs) and write the
// resulting snapshot sequence to <name>/actions.json.
// Usage: node capture-actions.mjs <name> <baseUrl>
//   node capture-actions.mjs new      http://localhost:4180
//   node capture-actions.mjs baseline http://localhost:4190
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { VIEWPORTS } from './lib.mjs'
import { runScenario } from './scenario.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const name = process.argv[2] || 'new'
const baseUrl = process.argv[3] || 'http://localhost:4180'

const OUT = resolve(__dirname, name)
mkdirSync(OUT, { recursive: true })

async function main() {
  const browser = await chromium.launch()
  const out = { name, baseUrl, viewports: {} }

  for (const vp of ['desktop', 'mobile']) {
    const context = await browser.newContext({ viewport: VIEWPORTS[vp] })
    const page = await context.newPage()
    page.on('pageerror', (e) => console.log(`  [pageerror:${name}/${vp}] ${e.message}`))
    // The legacy oracle is a scale-to-zero fly VM that can answer 503 / be slow
    // on a cold start. Retry the initial load+render a few times so a transient
    // cold start doesn't fail the whole run.
    let loaded = false
    for (let attempt = 1; attempt <= 4 && !loaded; attempt++) {
      try {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
        await page.waitForSelector('#bubblesSVG', { timeout: 45000 })
        loaded = true
      } catch (e) {
        console.log(`  [${name}/${vp}] load attempt ${attempt} failed (${e.message.split('\n')[0]}), retrying…`)
        await page.waitForTimeout(3000)
      }
    }
    if (!loaded) throw new Error(`${name}/${vp}: app never became ready`)
    const result = await runScenario(page)
    out.viewports[vp] = result
    const favs = result.steps.find((s) => s.label === 'evaluation')?.net?.favStars
    const deads = result.steps.find((s) => s.label === 'evaluation')?.net?.deadImgs
    console.log(
      `[${name}/${vp}] steps=${result.steps.length} favStars=${favs} deadImgs=${deads} ` +
        `aboutAnchorsScrolled=${JSON.stringify(Object.fromEntries(Object.entries(result.about.anchors).map(([k, v]) => [k, v.didScroll])))}`
    )
    await context.close()
  }

  await browser.close()
  writeFileSync(resolve(OUT, 'actions.json'), JSON.stringify(out, null, 2))
  console.log(`wrote ${resolve(OUT, 'actions.json')}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
