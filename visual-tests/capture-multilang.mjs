// Capture the per-language question text (de/fr/it) from one app into
// <name>/questions.json. Only needed for the legacy baseline (the new build
// ships all three languages in new/state.json already). Used to (re)generate
// the frozen fixture and in the --reverify path.
// Usage: node capture-multilang.mjs baseline http://localhost:4190/
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { extractQuestions } from './lib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const name = process.argv[2] || 'baseline'
const url = process.argv[3] || 'http://localhost:4190/'

const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage()

// retry for the scale-to-zero baseline VM
let ready = false
for (let attempt = 1; attempt <= 4 && !ready; attempt++) {
  try {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await p.waitForSelector('#bubblesSVG', { timeout: 45000 })
    await p.waitForSelector('.max', { timeout: 45000 })
    ready = true
  } catch (e) {
    console.log(`  [${name}] load attempt ${attempt} failed (${e.message.split('\n')[0]}), retrying…`)
    await p.waitForTimeout(3000)
  }
}
if (!ready) throw new Error(`${name}: never became ready at ${url}`)

const got = {}
for (const lg of ['de', 'fr', 'it']) {
  await p.evaluate((l) => {
    try {
      if (window.I18NConf) I18NConf.setLanguage(l)
      else if (window.TAPi18n) TAPi18n.setLanguage(l)
    } catch (e) {}
  }, lg)
  // wait until the client has this language's fields loaded (legacy fetches per language over DDP)
  await p
    .waitForFunction(
      (l) => {
        if (!window.Questions) return false
        const q = window.Questions.findOne({ index: 0 })
        return q && q.languages && q.languages[l] && q.languages[l].label
      },
      lg,
      { timeout: 20000 }
    )
    .catch(() => {})
  await p.waitForTimeout(1500)
  got[lg] = await extractQuestions(p)
}
await b.close()

mkdirSync(resolve(__dirname, name), { recursive: true })
writeFileSync(resolve(__dirname, name, 'questions.json'), JSON.stringify(got, null, 2))
console.log(`[${name}] wrote ${name}/questions.json (de/fr/it × ${got.de ? got.de.length : '?'})`)
