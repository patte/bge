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

  // --- about modal geometry: the new header/body must lay out exactly like the
  // baseline (this is the alignment-bug regression test). On desktop the nav bar
  // lines up with the modal body; on mobile it's the full-width layout. Either
  // way new must equal baseline pixel-for-pixel. ---
  eq(`about modal+nav+heading geometry`, b.about.geom, n.about.geom)
  if (vp === 'desktop') {
    // document the intent: on desktop the first nav link sits at the modal's
    // left edge (the bug had it ~14px to the left).
    ok(
      `about (desktop): nav lines up with modal body`,
      Math.abs(n.about.geom.firstNavLink.left - n.about.geom.modal.left) <= 2,
      JSON.stringify(n.about.geom)
    )
  }

  // --- about anchor scrolling (clicking nav headers scrolls) ---
  for (const t of Object.keys(b.about.anchors)) {
    eq(`about anchor "${t}" didScroll`, b.about.anchors[t].didScroll, n.about.anchors?.[t]?.didScroll)
  }

  // --- language switch ---
  // The switcher is desktop-only; on mobile both apps record null.
  // On the NEW app the switch is client-side and deterministic, so we hard-
  // assert it changes the question text. The legacy app fetches each language's
  // questions over DDP, which through the proxy is load-sensitive, so we only
  // cross-check the exact strings when the baseline actually switched. (Full
  // fr/it/de text parity across all 21 questions is covered by
  // multilang-baseline.mjs regardless.)
  const bL = b.langLabels
  const nL = n.langLabels
  if (nL.de === null && bL.de === null) {
    ok(`lang switcher hidden on ${vp} (both)`, true)
  } else {
    ok(`new: fr switches from de`, !!nL.fr && nL.fr !== nL.de, JSON.stringify(nL))
    ok(`new: it switches from de`, !!nL.it && nL.it !== nL.de, JSON.stringify(nL))
    const baselineSwitched = !!bL.fr && bL.fr !== bL.de && !!bL.it && bL.it !== bL.de
    if (baselineSwitched) {
      eq(`lang labels match baseline (fr/it/de)`, bL, nL)
    } else {
      console.log(`  ~ lang cross-check skipped — baseline did not switch (cold VM / DDP). text parity covered by multilang-baseline.mjs`)
    }
  }
}

console.log(`\n${failures === 0 ? '✅ ALL MATCH' : '❌ MISMATCH'} — ${checks - failures}/${checks} checks passed`)
process.exit(failures === 0 ? 0 : 1)
