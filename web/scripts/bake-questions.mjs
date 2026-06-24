// Bakes the legacy questions.csv into a static questions.json,
// replicating EXACTLY the parsing logic from the old Meteor fixtures
// (app/server/fixtures/questions.coffee).
//
// Run: node scripts/bake-questions.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { parse } from 'csv-parse/sync'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Self-contained: the source CSV lives in this project (copied from the legacy
// app/public/questions.csv), so the build does not depend on the old app.
const CSV_PATH = resolve(__dirname, '../src/data/questions.csv')
const OUT_PATH = resolve(__dirname, '../src/data/questions.json')

const raw = readFileSync(CSV_PATH, 'utf8')

// fast-csv was configured: headers:false, delimiter:';', ignoreEmpty:true
const rows = parse(raw, {
  delimiter: ';',
  quote: '"',
  relax_column_count: true,
  skip_empty_lines: true,
  trim: false,
})

const questions = []
let i = 0
for (const columns of rows) {
  i += 1
  if (i === 1) continue // header

  const leftPositiv = (columns[6] || '').length > 0
  const oneSided = (columns[7] || '').length > 0
  const onlyNegativ = (columns[8] || '').length > 0

  let min = -0.5
  let max = 0.5
  if (!oneSided && leftPositiv) {
    min = max // 0.5
    max = -0.5
  }
  if (oneSided) {
    if (leftPositiv) {
      max = 0
      min = onlyNegativ ? -0.5 : 0.5
    } else {
      min = 0
      max = onlyNegativ ? -0.5 : 0.5
    }
  }

  // Matches the original fixtures: `info: columns[N].replace(/"/g,'') if columns[N]?`
  // — keeps "" for a present-but-empty column, undefined when the column is absent.
  // (One it.info cell, q12, differs in "" vs undefined between csv-parse and the
  // legacy fast-csv parser; both render identically as "no info".)
  const info = (s) => (s == null ? undefined : s.replace(/"/g, ''))

  const question = {
    index: parseInt(columns[0], 10) - 1,
    cluster: columns[1],
    topic: columns[2],
    hrid: columns[3],
    optional: true,
    type: 'scale',
    min,
    max,
    step: Math.abs(max - min) / 10,
    start: 0,
    isOneSided: oneSided,
    isOnlyNegative: onlyNegativ,
    isLeftPositiv: leftPositiv,
    languages: {
      de: {
        label: columns[4],
        minLabel: columns[9],
        maxLabel: columns[10],
        info: info(columns[11]),
      },
      fr: {
        label: columns[12],
        minLabel: columns[13],
        maxLabel: columns[14],
        info: info(columns[15]),
      },
      it: {
        label: columns[16],
        minLabel: columns[17],
        maxLabel: columns[18],
        info: info(columns[19]),
      },
    },
  }
  questions.push(question)
}

questions.sort((a, b) => a.index - b.index)

writeFileSync(OUT_PATH, JSON.stringify(questions, null, 2) + '\n', 'utf8')
console.log(`baked ${questions.length} questions -> ${OUT_PATH}`)
