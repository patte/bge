// Reverse proxy that exposes the live deployed baseline (https://bge.fly.dev)
// on http://localhost:PORT. This environment blocks the browser's external
// network, but node can reach out, so the proxy lets Playwright drive the REAL
// original Meteor app via localhost.
//
// The only rewrite needed is on the main HTML document: Meteor injects
// __meteor_runtime_config__ with ROOT_URL / DDP_DEFAULT_CONNECTION_URL pointing
// at https://bge.fly.dev; we rewrite those to the proxy origin so the client's
// DDP (SockJS long-poll, websockets disabled) also flows through the proxy.
// Everything else (JS bundle, /sockjs/ polls, fonts, images) is streamed as-is.
import http from 'node:http'
import https from 'node:https'

const TARGET = process.env.TARGET_HOST || 'bge.fly.dev'
const PORT = Number(process.env.PROXY_PORT || 4190)
const LOCAL = `localhost:${PORT}`

function rewriteHtml(buf) {
  let s = buf.toString('utf8')
  s = s.split('https://' + TARGET).join('http://' + LOCAL)
  s = s.split('https%3A%2F%2F' + TARGET).join('http%3A%2F%2F' + LOCAL)
  s = s.split('//' + TARGET).join('//' + LOCAL)
  return Buffer.from(s, 'utf8')
}

const server = http.createServer((creq, cres) => {
  const headers = { ...creq.headers, host: TARGET }
  delete headers['accept-encoding'] // disable compression so we can rewrite HTML
  const opts = { host: TARGET, port: 443, method: creq.method, path: creq.url, headers }

  const preq = https.request(opts, (pres) => {
    const ct = pres.headers['content-type'] || ''
    const isMainHtml = ct.includes('text/html') && !creq.url.startsWith('/sockjs/')
    if (isMainHtml) {
      const chunks = []
      pres.on('data', (c) => chunks.push(c))
      pres.on('end', () => {
        const body = rewriteHtml(Buffer.concat(chunks))
        const h = { ...pres.headers }
        delete h['content-length']
        delete h['content-encoding']
        delete h['transfer-encoding']
        cres.writeHead(pres.statusCode, h)
        cres.end(body)
      })
    } else {
      cres.writeHead(pres.statusCode, pres.headers)
      pres.pipe(cres)
    }
  })
  preq.on('error', (e) => {
    cres.writeHead(502)
    cres.end('proxy error: ' + e.message)
  })
  creq.pipe(preq)
})

server.listen(PORT, () => console.log(`proxy on http://${LOCAL} -> https://${TARGET}`))
