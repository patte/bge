// Compares the new build's de/fr/it question text against the frozen baseline
// (baseline/questions.json — captured from the original by capture-multilang.mjs,
// or copied from the committed fixture by run.mjs). The new build ships all three
// languages in new/state.json, so this needs no live app.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const base = JSON.parse(readFileSync(resolve(__dirname, 'baseline/questions.json'), 'utf8'))
const NEW = JSON.parse(readFileSync(resolve(__dirname, 'new/state.json'), 'utf8')).questions

// The legacy publication sends `info: ""` where the new build has it `undefined`
// (a csv-parse vs fast-csv edge case); both render as "no info", so treat
// empty/null/undefined as equal.
const norm = (v) => (v == null || v === '' ? '' : v)

let diffs = 0
let checks = 0
for (const lg of ['de', 'fr', 'it']) {
  const arr = base[lg]
  if (!arr) {
    console.log(`  ${lg}: missing in baseline`)
    continue
  }
  for (let i = 0; i < arr.length; i++) {
    const bl = (arr[i].languages && arr[i].languages[lg]) || {}
    const nl = (NEW[i] && NEW[i].languages && NEW[i].languages[lg]) || {}
    for (const k of ['label', 'minLabel', 'maxLabel', 'info']) {
      checks++
      if (JSON.stringify(norm(bl[k])) !== JSON.stringify(norm(nl[k]))) {
        diffs++
        const bs = bl[k] == null ? '<null>' : String(bl[k])
        const ns = nl[k] == null ? '<null>' : String(nl[k])
        let di = 0
        while (di < bs.length && di < ns.length && bs[di] === ns[di]) di++
        console.log(
          `  ✗ q${i}.${lg}.${k} @${di}: base=${JSON.stringify(bs.slice(Math.max(0, di - 10), di + 15))} new=${JSON.stringify(ns.slice(Math.max(0, di - 10), di + 15))}`
        )
      }
    }
  }
}
console.log(`\n${diffs === 0 ? '✅' : '❌'} multilingual question text: ${checks - diffs}/${checks} fields match (${diffs} diffs)`)
process.exit(diffs === 0 ? 0 : 1)
