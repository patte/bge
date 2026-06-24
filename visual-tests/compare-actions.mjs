// Compare the full action-scenario snapshots (baseline vs new). Asserts the
// bubble network and UI behave & look identically at every step (positions
// excluded), plus the about-modal alignment, anchor scrolling and language
// switch. Pure-function-of-the-answers state must match exactly.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseline = JSON.parse(readFileSync(resolve(__dirname, 'baseline/actions.json'), 'utf8'))
const next = JSON.parse(readFileSync(resolve(__dirname, 'new/actions.json'), 'utf8'))

let failures = 0
let checks = 0

function eq(label, a, b) {
  checks++
  const pass = JSON.stringify(a) === JSON.stringify(b)
  if (!pass) {
    failures++
    console.log(`  ✗ ${label}\n      baseline: ${JSON.stringify(a)}\n      new:      ${JSON.stringify(b)}`)
  } else {
    console.log(`  ✓ ${label}`)
  }
}

function ok(label, cond, detail) {
  checks++
  if (cond) {
    console.log(`  ✓ ${label}`)
  } else {
    failures++
    console.log(`  ✗ ${label}${detail ? `  (${detail})` : ''}`)
  }
}

function aligned(geom) {
  if (!geom || !geom.firstNavLink || !geom.modal) return false
  return Math.abs(geom.firstNavLink.left - geom.modal.left) <= 2
}

for (const vp of Object.keys(baseline.viewports)) {
  console.log(`\n=== viewport: ${vp} ===`)
  const b = baseline.viewports[vp]
  const n = next.viewports[vp]
  if (!n) {
    failures++
    console.log(`  ✗ missing new viewport ${vp}`)
    continue
  }

  // --- per-step network + UI signatures (matched by label) ---
  const bByLabel = Object.fromEntries(b.steps.map((s) => [s.label, s]))
  const nByLabel = Object.fromEntries(n.steps.map((s) => [s.label, s]))
  const labels = b.steps.map((s) => s.label)
  for (const label of labels) {
    const bs = bByLabel[label]
    const ns = nByLabel[label]
    if (!ns) {
      failures++
      console.log(`  ✗ step "${label}" missing in new`)
      continue
    }
    eq(`step ${label} · network`, bs.net, ns.net)
    eq(`step ${label} · ui`, bs.ui, ns.ui)
  }

  // --- about modal alignment (header nav lines up with body) ---
  ok(`about: baseline header aligned with body`, aligned(b.about.geom), JSON.stringify(b.about.geom))
  ok(`about: new header aligned with body`, aligned(n.about.geom), JSON.stringify(n.about.geom))

  // --- about anchor scrolling (clicking nav headers scrolls) ---
  for (const t of Object.keys(b.about.anchors)) {
    eq(`about anchor "${t}" didScroll`, b.about.anchors[t].didScroll, n.about.anchors?.[t]?.didScroll)
  }

  // --- language switch labels ---
  eq(`lang labels (fr/it/de)`, b.langLabels, n.langLabels)
}

console.log(`\n${failures === 0 ? '✅ ALL MATCH' : '❌ MISMATCH'} — ${checks - failures}/${checks} checks passed`)
process.exit(failures === 0 ? 0 : 1)
