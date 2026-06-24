// One-command, re-runnable verification of the new build against the live
// legacy app.
//
//   node run.mjs            # full run: derived-state + action-scenario, both viewports
//   node run.mjs --quick    # skip the slower 4-pattern derived-state capture
//
// It starts everything it needs and tears it down again:
//   - the new build's Vite dev server on PORT_NEW   (default 4180)
//   - the reverse proxy to the live baseline on PORT_PROXY (default 4190)
// then captures both apps and runs the comparators, exiting non-zero on any
// mismatch. Nothing needs to be running beforehand.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import net from 'node:net'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB_DIR = resolve(__dirname, '../web')

const PORT_NEW = Number(process.env.PORT_NEW || 4180)
const PORT_PROXY = Number(process.env.PROXY_PORT || 4190)
const URL_NEW = `http://localhost:${PORT_NEW}`
const URL_BASE = `http://localhost:${PORT_PROXY}/de`
const QUICK = process.argv.includes('--quick')

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

async function main() {
  console.log(`▶ starting new build (vite) on :${PORT_NEW} …`)
  spawnProc('sh', ['-c', `npm run bake && npx vite --port ${PORT_NEW} --strictPort`], { cwd: WEB_DIR, tag: 'vite' })

  console.log(`▶ starting baseline proxy on :${PORT_PROXY} …`)
  spawnProc('node', ['proxy.mjs'], { cwd: __dirname, tag: 'proxy', env: { ...process.env, PROXY_PORT: String(PORT_PROXY) } })

  await Promise.all([waitPort(PORT_NEW), waitPort(PORT_PROXY)])
  // give the apps a moment to be fully serving
  await new Promise((r) => setTimeout(r, 1500))

  let failed = false
  try {
    if (!QUICK) {
      console.log('\n▶ capture derived state — baseline')
      await run('node', ['capture.mjs', 'baseline', URL_BASE], { cwd: __dirname })
      console.log('\n▶ capture derived state — new')
      await run('node', ['capture.mjs', 'new', URL_NEW], { cwd: __dirname })
    }

    console.log('\n▶ capture action scenario — baseline')
    await run('node', ['capture-actions.mjs', 'baseline', URL_BASE], { cwd: __dirname })
    console.log('\n▶ capture action scenario — new')
    await run('node', ['capture-actions.mjs', 'new', URL_NEW], { cwd: __dirname })

    if (!QUICK) {
      console.log('\n▶ compare derived state (gauge / score / topics / radii)')
      await run('node', ['compare.mjs'], { cwd: __dirname }).catch(() => (failed = true))
      console.log('\n▶ compare question text (de/fr/it)')
      await run('node', ['multilang-baseline.mjs'], { cwd: __dirname }).catch(() => (failed = true))
    }

    console.log('\n▶ compare action scenario (network + UI + about + lang)')
    await run('node', ['compare-actions.mjs'], { cwd: __dirname }).catch(() => (failed = true))
  } finally {
    killAll()
  }

  console.log(`\n${failed ? '❌ SUITE FAILED' : '✅ SUITE PASSED'}`)
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
