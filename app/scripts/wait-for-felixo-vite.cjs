#!/usr/bin/env node

// Compatibility entrypoint for callers that only need to wait. The dev
// runner uses the same marker logic, but also knows how to reuse and clean up
// the confirmed server.

const { HOST, MARKER_PATH, PORT, waitForFelixoVite } = require('./dev-runner.cjs')

async function main() {
  try {
    await waitForFelixoVite()
    console.log(`[felixo] Vite dev server confirmado em http://${HOST}:${PORT}/`)
  } catch (error) {
    console.error(`[felixo] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

if (require.main === module) {
  void main()
}

module.exports = { main, HOST, MARKER_PATH, PORT }
