// One-command verification of the new build.
//
//   node run.mjs              # default: SELF-CONTAINED — compare the new build
//                             # against the frozen fixtures/ (the original's
//                             # captured behaviour). Needs no old app.
//   node run.mjs --quick      # skip the slower 4-pattern derived-state pass
//   node run.mjs --reverify   # RE-PROVE against the LIVE original: start the
//                             # proxy, capture the old app, refresh fixtures/,
//                             # and also run the cross-app pixel diff. Needs the
//                             # legacy app reachable (or redeploy from
//                             # `legacy-meteor`).
//
// It starts the new build's Vite server (and, for --reverify, the proxy to the
// legacy app), runs the comparators, and tears everything down again.
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import net from 'node:net'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = resolve(__dirname, '../web')
const FIX = resolve(__dirname, 'fixtures')
const BASE = resolve(__dirname, 'baseline')

const PORT_NEW = Number(process.env.PORT_NEW || 4180)
const PORT_PROXY = Number(process.env.PROXY_PORT || 4190)
const URL_NEW = `http://localhost:${PORT_NEW}`
const URL_BASE = `http://localhost:${PORT_PROXY}/de`
const URL_BASE_ROOT = `http://localhost:${PORT_PROXY}/`
const QUICK = process.argv.includes('--quick')
const REVERIFY = process.argv.includes('--reverify')

const children = []
function spawnProc(cmd, args, opts) {
  const child = spawn(cmd, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'], ...opts })
  children.push(child)
  const tag = opts?.tag || cmd
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[${tag}] ${d}`))
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[${tag}] ${d}`))
  return child
}
function killAll() {
  for (const c of children) {
    try {
      process.kill(-c.pid, 'SIGKILL')
    } catch (e) {}
  }
}

function waitPort(port, timeoutMs = 90000) {
  const start = Date.now()
  return new Promise((res, rej) => {
    const tryOnce = () => {
      const sock = net.connect(port, '127.0.0.1')
      sock.on('connect', () => {
        sock.destroy()
        res()
      })
      sock.on('error', () => {
        sock.destroy()
        if (Date.now() - start > timeoutMs) rej(new Error(`port ${port} not up after ${timeoutMs}ms`))
        else setTimeout(tryOnce, 400)
      })
    }
    tryOnce()
  })
}

function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const c = spawn(cmd, args, { stdio: 'inherit', ...opts })
    c.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} exited ${code}`))))
  })
}
const node = (args) => run('node', args, { cwd: __dirname })
const cp = (from, to) => {
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  console.log(`▶ starting new build (vite) on :${PORT_NEW} …`)
  spawnProc('sh', ['-c', `pnpm bake && pnpm exec vite --port ${PORT_NEW} --strictPort`], { cwd: WEB_DIR, tag: 'vite' })
  const waits = [waitPort(PORT_NEW)]
  if (REVERIFY) {
    console.log(`▶ starting baseline proxy on :${PORT_PROXY} …`)
    spawnProc('node', ['proxy.mjs'], { cwd: __dirname, tag: 'proxy', env: { ...process.env, PROXY_PORT: String(PORT_PROXY) } })
    waits.push(waitPort(PORT_PROXY))
  }
  await Promise.all(waits)
  await sleep(1500)

  let failed = false
  try {
    if (REVERIFY) {
      // Capture the LIVE original and refresh the committed fixtures from it.
      console.log('\n▶ capture the live original (refreshing fixtures/)')
      if (!QUICK) await node(['capture.mjs', 'baseline', URL_BASE])
      await node(['capture-actions.mjs', 'baseline', URL_BASE])
      if (!QUICK) await node(['capture-multilang.mjs', 'baseline', URL_BASE_ROOT])
      await node(['capture-shots.mjs', 'baseline', URL_BASE])
      if (!QUICK) cp(resolve(BASE, 'state.json'), resolve(FIX, 'baseline-state.json'))
      cp(resolve(BASE, 'actions.json'), resolve(FIX, 'baseline-actions.json'))
      if (!QUICK) cp(resolve(BASE, 'questions.json'), resolve(FIX, 'baseline-questions.json'))
    } else {
      // Self-contained: the baseline IS the committed fixture snapshot.
      if (!QUICK) cp(resolve(FIX, 'baseline-state.json'), resolve(BASE, 'state.json'))
      cp(resolve(FIX, 'baseline-actions.json'), resolve(BASE, 'actions.json'))
      if (!QUICK) cp(resolve(FIX, 'baseline-questions.json'), resolve(BASE, 'questions.json'))
    }

    console.log('\n▶ capture the new build')
    if (!QUICK) await node(['capture.mjs', 'new', URL_NEW])
    await node(['capture-actions.mjs', 'new', URL_NEW])
    if (REVERIFY) await node(['capture-shots.mjs', 'new', URL_NEW])

    if (!QUICK) {
      console.log('\n▶ compare derived state (gauge / score / topics / radii)')
      await node(['compare.mjs']).catch(() => (failed = true))
      console.log('\n▶ compare question text (de/fr/it)')
      await node(['multilang-baseline.mjs']).catch(() => (failed = true))
    }
    console.log('\n▶ compare action scenario (network + UI + about + lang)')
    await node(['compare-actions.mjs']).catch(() => (failed = true))

    if (REVERIFY) {
      console.log('\n▶ compare UI pixel frames (cross-app — needs the live original)')
      await node(['compare-shots.mjs', 'baseline', 'new']).catch(() => (failed = true))
    }
  } finally {
    killAll()
  }

  const how = REVERIFY ? 'reverified against the live original; fixtures/ refreshed' : 'vs frozen fixtures/'
  console.log(`\n${failed ? '❌ SUITE FAILED' : '✅ SUITE PASSED'} (${how})`)
  process.exit(failed ? 1 : 0)
}

process.on('SIGINT', () => {
  killAll()
  process.exit(130)
})
process.on('exit', killAll)

main().catch((e) => {
  console.error(e)
  killAll()
  process.exit(1)
})
