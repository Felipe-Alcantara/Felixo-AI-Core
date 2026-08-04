#!/usr/bin/env node

// Waits for 127.0.0.1:5173 to come up, then verifies the server answering
// there is actually this project's Vite dev server (via the marker route
// from vite.config.ts) before letting Electron load it. `wait-on` alone only
// checks that *some* process holds the port — if an unrelated dev server
// (e.g. another project's) was already listening on 5173, Electron would
// silently load that instead of failing.

const http = require('node:http')

const HOST = '127.0.0.1'
const PORT = 5173
const MARKER_PATH = '/__felixo_dev_marker'
const EXPECTED_MARKER = 'felixo-ai-core'
const TIMEOUT_MS = 60_000
const POLL_INTERVAL_MS = 300

function fetchMarker() {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: HOST, port: PORT, path: MARKER_PATH, timeout: 2_000 },
      (res) => {
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode, body }))
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy(new Error('request timed out'))
    })
  })
}

async function main() {
  const deadline = Date.now() + TIMEOUT_MS

  while (Date.now() < deadline) {
    let result
    try {
      result = await fetchMarker()
    } catch {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      continue
    }

    if (result.status === 200 && result.body.trim() === EXPECTED_MARKER) {
      console.log(`[felixo] Vite dev server confirmado em http://${HOST}:${PORT}/`)
      return
    }

    console.error(
      `[felixo] Porta ${PORT} está ocupada por outro processo (não é o Vite do Felixo).`,
    )
    console.error(
      '[felixo] Feche o que estiver usando essa porta (ex: outro projeto com dev server na 5173) e tente novamente.',
    )
    process.exit(1)
  }

  console.error(
    `[felixo] Timeout esperando o Vite do Felixo responder em http://${HOST}:${PORT}${MARKER_PATH}.`,
  )
  process.exit(1)
}

main()
