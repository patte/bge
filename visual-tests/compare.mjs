// Compares the derived state captured from the legacy baseline vs the new
// build. Only the force-layout bubble POSITIONS are timing-variable; everything
// else is deterministic. Here we assert equality of the derived numbers — a
// pure function of the answers: the score gauge %, the evaluation score, the
// per-topic %, and the multiset of bubble radii. (Pixel parity of the rendered
// surface is covered separately by the screenshot diff; bubble structure by
// extractNetwork.)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseline = JSON.parse(readFileSync(resolve(__dirname, 'baseline/state.json'), 'utf8'))
const next = JSON.parse(readFileSync(resolve(__dirname, 'new/state.json'), 'utf8'))

let failures = 0
let checks = 0

function eq(label, a, b) {
  checks++
  const pass = JSON.stringify(a) === JSON.stringify(b)
  if (!pass) {
    failures++
    console.log(`  ✗ ${label}\n      baseline: ${JSON.stringify(a)}\n      new:      ${JSON.stringify(b)}`)
  } else {
    console.log(`  ✓ ${label}  (${JSON.stringify(a)})`)
  }
}

// ---- question data (the CSV bake vs the baseline's Minimongo) ----
// The deployed app's publication does NOT project hrid/step to the client and
// the questions subscription is language-scoped (only the loaded language's
// fields are sent). So we ignore hrid/step and compare a language only where
// the baseline actually has it (fr/it are verified separately, multilingually).
function normalizeQuestion(q, ref) {
  const { hrid, step, languages, ...core } = q
  const langs = {}
  for (const l of ['de', 'fr', 'it']) {
    const refHas = ref ? ref.languages[l] != null : languages[l] != null
    if (languages[l] != null && refHas) langs[l] = languages[l]
  }
  return { ...core, languages: langs }
}

console.log('=== questions data (de exact; hrid/step & unpublished langs ignored) ===')
if (!baseline.questions || !next.questions) {
  console.log('  (skipped — questions not captured on one side)')
} else {
  eq('questions count', baseline.questions.length, next.questions.length)
  const n = Math.min(baseline.questions.length, next.questions.length)
  for (let i = 0; i < n; i++) {
    // baseline is the reference for which languages exist
    eq(`q${i} data`, normalizeQuestion(baseline.questions[i], baseline.questions[i]), normalizeQuestion(next.questions[i], baseline.questions[i]))
  }
}

for (const vp of Object.keys(baseline.viewports)) {
  console.log(`\n=== viewport: ${vp} ===`)
  for (const mode of Object.keys(baseline.viewports[vp])) {
    const b = baseline.viewports[vp][mode]
    const n = next.viewports[vp][mode]
    console.log(`-- script: ${mode} --`)
    if (!n) {
      failures++
      console.log(`  ✗ missing new state for ${vp}/${mode}`)
      continue
    }
    eq(`${mode} gauge`, b.gauge, n.gauge)
    eq(`${mode} finalScore`, b.finalScore, n.finalScore)
    eq(`${mode} topics`, b.topics, n.topics)
    eq(`${mode} radii (multiset)`, b.radii, n.radii)
    eq(`${mode} numNonZero radii`, b.numNonZero, n.numNonZero)
  }
}

console.log(`\n${failures === 0 ? '✅ ALL MATCH' : '❌ MISMATCH'} — ${checks - failures}/${checks} checks passed`)
process.exit(failures === 0 ? 0 : 1)
