// Tolerance-based pixel diff of the captured UI frames: <a>/shots vs <b>/shots
// (default baseline vs new). For each frame present in both, we pixelmatch the
// two PNGs (antialiasing-aware, so sub-pixel font noise doesn't trip it) and
// report the mismatched-pixel ratio; a diff image is written for anything above
// threshold. Differing frame DIMENSIONS are themselves a failure (a layout
// shifted), reported with both sizes.
//
// Usage: node compare-shots.mjs [aDir] [bDir]
//   node compare-shots.mjs baseline new
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const aName = process.argv[2] || 'baseline'
const bName = process.argv[3] || 'new'
const aDir = resolve(__dirname, aName, 'shots')
const bDir = resolve(__dirname, bName, 'shots')
const diffDir = resolve(__dirname, 'diffs')

// Fail a frame if more than this fraction of pixels differ (after AA-aware
// match). Measured same-app noise floor is ~0.13%; a single mispositioned slider
// handle (a 40px dot in the panel) is ~0.5%, so 0.25% cleanly separates a real
// localized regression from antialiasing noise. Override with FAIL_RATIO=… for
// cross-app runs if font hinting differs. A diff image is written for EVERY
// frame that differs at all, so sub-threshold changes are still inspectable.
const FAIL_RATIO = Number(process.env.FAIL_RATIO || 0.0025)
const REPORT_RATIO = 0.0005

rmSync(diffDir, { recursive: true, force: true })
mkdirSync(diffDir, { recursive: true })

if (!existsSync(aDir) || !existsSync(bDir)) {
  console.error(`missing shots dir: ${!existsSync(aDir) ? aDir : bDir}`)
  process.exit(2)
}

const aFiles = new Set(readdirSync(aDir).filter((f) => f.endsWith('.png')))
const bFiles = new Set(readdirSync(bDir).filter((f) => f.endsWith('.png')))
const all = [...new Set([...aFiles, ...bFiles])].sort()

let failures = 0
let checks = 0

for (const f of all) {
  checks++
  if (!aFiles.has(f) || !bFiles.has(f)) {
    failures++
    console.log(`  ✗ ${f}  (only in ${aFiles.has(f) ? aName : bName})`)
    continue
  }
  const a = PNG.sync.read(readFileSync(resolve(aDir, f)))
  const b = PNG.sync.read(readFileSync(resolve(bDir, f)))
  if (a.width !== b.width || a.height !== b.height) {
    failures++
    console.log(`  ✗ ${f}  size differs  ${aName}=${a.width}x${a.height}  ${bName}=${b.width}x${b.height}`)
    continue
  }
  const { width, height } = a
  const diff = new PNG({ width, height })
  const mismatched = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold: 0.1,
    includeAA: false,
  })
  const ratio = mismatched / (width * height)
  const pass = ratio <= FAIL_RATIO
  // write a diff image for anything visibly different, pass or fail
  if (ratio > REPORT_RATIO) writeFileSync(resolve(diffDir, f), PNG.sync.write(diff))
  if (!pass) {
    failures++
    console.log(`  ✗ ${f}  ${(ratio * 100).toFixed(2)}% differ (${mismatched}px)  → diffs/${f}`)
  } else {
    const note = ratio > REPORT_RATIO ? `  → diffs/${f}` : ''
    console.log(`  ✓ ${f}  ${(ratio * 100).toFixed(2)}% differ${note}`)
  }
}

console.log(
  `\n${failures === 0 ? '✅ ALL FRAMES MATCH' : '❌ MISMATCH'} — ${checks - failures}/${checks} frames within ${(
    FAIL_RATIO * 100
  ).toFixed(1)}% (${aName} vs ${bName})`
)
process.exit(failures === 0 ? 0 : 1)
