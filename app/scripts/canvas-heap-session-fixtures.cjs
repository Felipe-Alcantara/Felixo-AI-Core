'use strict'

/**
 * Funções puras da sessão longa de heap do Canvas — extraídas do driver
 * (`canvas-long-session-heap-capture.cjs`) para serem testadas sem precisar
 * de um Electron real nem de `ps` de verdade.
 */

/**
 * Faz o parse de `ps -eo pid,ppid,rss,comm` (RSS em KiB, uma linha por
 * processo). Usado para achar, a partir do PID do processo principal do
 * Electron, todos os processos-filho reais (renderer, GPU, utility, PTYs de
 * shell) e somar a memória residente de verdade — não só a do processo
 * principal, que sozinho não mostra nada em Electron multi-processo.
 */
function parsePsOutput(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)
      if (!match) return null
      return { pid: Number(match[1]), ppid: Number(match[2]), rssKb: Number(match[3]), comm: match[4] }
    })
    .filter(Boolean)
}

/**
 * BFS de pai→filhos a partir de um PID raiz. O processo principal do
 * Electron é pai direto dos renderers/GPU/utility; PTYs de shell (bash etc.)
 * são netos, encadeados pelo processo utility do node-pty — por isso precisa
 * ser recursivo, não só um filtro de `ppid === root`.
 */
function collectDescendantPids(rootPid, processList) {
  const byParent = new Map()
  for (const process of processList) {
    const list = byParent.get(process.ppid) ?? []
    list.push(process.pid)
    byParent.set(process.ppid, list)
  }
  const result = new Set([rootPid])
  const queue = [rootPid]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const child of byParent.get(current) ?? []) {
      if (!result.has(child)) { result.add(child); queue.push(child) }
    }
  }
  return result
}

/** Soma RSS (KiB) dos processos cujo pid está no conjunto, agrupado por `comm` para o relatório. */
function summarizeRss(processList, pidSet) {
  let totalKb = 0
  const byComm = new Map()
  for (const process of processList) {
    if (!pidSet.has(process.pid)) continue
    totalKb += process.rssKb
    byComm.set(process.comm, (byComm.get(process.comm) ?? 0) + process.rssKb)
  }
  return {
    totalKb,
    totalMiB: Number((totalKb / 1024).toFixed(1)),
    processCount: pidSet.size,
    byComm: Object.fromEntries([...byComm.entries()].sort((a, b) => b[1] - a[1])),
  }
}

/** HTML mínimo e autocontido para as webviews da fixture — sem rede, sem dependência externa. */
function fixtureWebpageHtml(label) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${label}</title></head>` +
    `<body style="font-family:sans-serif;background:#111;color:#eee;padding:2rem">` +
    `<h1>${label}</h1><p id="tick">0</p>` +
    `<script>let n=0;setInterval(()=>{n+=1;document.getElementById('tick').textContent=String(n)},1000)</script>` +
    `</body></html>`
}

module.exports = { collectDescendantPids, fixtureWebpageHtml, parsePsOutput, summarizeRss }
