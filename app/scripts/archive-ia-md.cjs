#!/usr/bin/env node
'use strict'

/**
 * Compactação sem perda do IA.md (ou de qualquer arquivo de contexto no mesmo
 * formato).
 *
 * O template de contexto do padrão de qualidade manda MOVER, nunca apagar, os
 * registros antigos quando o arquivo cresce demais: eles vão, na íntegra e sem
 * edição, para `docs/ia-archive/`, e o IA.md guarda um ponteiro datado para
 * cada arquivo. Este script faz o movimento e prova que nada se perdeu ANTES de
 * escrever qualquer byte; depois de escrever, lê o disco e prova de novo.
 *
 * Uma "seção" é um bloco que começa em `## ` fora de bloco de código. A data
 * vem do primeiro dia citado no cabeçalho (`[2026-09-02]`, `2026-09-02 —` ou
 * `02/09/2026 —`). Seção sem data (Objetivo, Stack, o ponteiro) nunca é movida.
 * As movidas vão para um arquivo por mês, na ordem em que estavam.
 *
 * Uso, a partir da raiz do repositório (sem --apply só mostra o plano):
 *   node app/scripts/archive-ia-md.cjs --file IA.md --keep-from 2026-10-01 \
 *     --archive-dir docs/ia-archive --prefix IA-ARCHIVE [--today AAAA-MM-DD] [--apply]
 */

const fs = require('node:fs')
const path = require('node:path')

const POINTER_HEADING = '## Registros arquivados'
const FENCE = /^\s*(```|~~~)/
const SECTION = /^## /

function normalizeEol(text) {
  return text.replace(/\r\n/g, '\n')
}

function isRealDate(year, month, day) {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000
}

/** A data do cabeçalho em AAAA-MM-DD, ou null quando ele não cita nenhuma. */
function headingDate(heading) {
  const iso = heading.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso && isRealDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`
  }

  const br = heading.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (br && isRealDate(Number(br[3]), Number(br[2]), Number(br[1]))) {
    return `${br[3]}-${br[2]}-${br[1]}`
  }

  return null
}

/**
 * Divide o texto em preâmbulo e seções. `lines.join('\n')` de tudo, na ordem,
 * devolve exatamente o texto normalizado: nenhuma linha é descartada.
 */
function splitSections(text) {
  const preamble = []
  const sections = []
  let current = null
  let inFence = false

  for (const line of normalizeEol(text).split('\n')) {
    if (FENCE.test(line)) inFence = !inFence

    if (!inFence && SECTION.test(line)) {
      current = { heading: line, lines: [line] }
      sections.push(current)
    } else if (current) {
      current.lines.push(line)
    } else {
      preamble.push(line)
    }
  }

  if (inFence) {
    throw new Error('há um bloco de código aberto sem fechar; não dá para separar as seções com segurança')
  }

  return { preamble, sections }
}

const isPointer = (section) => section.heading.trim() === POINTER_HEADING

/** Separa o que fica do que vai para o arquivo, por mês, sem mexer no conteúdo. */
function planArchive(text, { keepFrom }) {
  const { preamble, sections } = splitSections(text)
  const kept = []
  const moved = new Map()

  for (const section of sections) {
    const date = headingDate(section.heading)
    if (date && date < keepFrom) {
      const month = date.slice(0, 7)
      if (!moved.has(month)) moved.set(month, [])
      moved.get(month).push(section)
    } else {
      kept.push(section)
    }
  }

  return { preamble, kept, moved }
}

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function pointerLine({ today, month, count, link }) {
  const noun = count === 1 ? 'seção' : 'seções'
  return `- [${today}] Registros de ${month} (${count} ${noun}) movidos para [${link}](${link})`
}

/** Acrescenta os itens ao ponteiro existente, ou cria a seção logo após o preâmbulo. */
function withPointer(kept, items) {
  const existing = kept.find(isPointer)
  if (existing) {
    let last = existing.lines.length - 1
    while (last > 0 && existing.lines[last].trim() === '') last -= 1
    const lines = [...existing.lines.slice(0, last + 1), ...items, ...existing.lines.slice(last + 1)]
    return kept.map((section) => (section === existing ? { ...section, lines } : section))
  }

  const pointer = {
    heading: POINTER_HEADING,
    lines: [
      POINTER_HEADING,
      '',
      'Registros antigos movidos, na íntegra e sem edição, para o arquivo. A linha do tempo completa',
      'é este arquivo mais os de `docs/ia-archive/`, em ordem cronológica.',
      '',
      ...items,
      '',
    ],
  }
  return [pointer, ...kept]
}

function renderSource({ preamble, kept }) {
  return [...preamble, ...kept.flatMap((section) => section.lines)].join('\n')
}

function archiveHeader({ month, sourceName, sourceLink, today }) {
  return [
    `# Arquivo do ${path.basename(sourceName)} — ${month}`,
    '',
    `> Registros movidos, na íntegra e sem edição, de [\`${sourceName}\`](${sourceLink}) em ${today}`,
    '> (compactação sem perda do template de contexto). Não edite aqui: se uma decisão mudar,',
    `> acrescente uma entrada nova e datada no \`${sourceName}\`.`,
    '',
  ]
}

/** Texto do arquivo do mês: o que já existia (ou o cabeçalho) mais as seções novas. */
function renderArchive(existingText, header, sections) {
  const base = existingText === null ? splitSections(header.join('\n')) : splitSections(existingText)
  return [...base.preamble, ...base.sections.flatMap((s) => s.lines), ...sections.flatMap((s) => s.lines)].join('\n')
}

function countLines(lines) {
  const counts = new Map()
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1)
  return counts
}

/**
 * A prova de que nada se perdeu: as linhas do original são exatamente as do
 * preâmbulo, das seções que ficaram e das que foram movidas. O ponteiro fica
 * de fora dos dois lados, porque é o único texto que a compactação escreve (e,
 * numa segunda execução, o original já o traz).
 */
function assertLossless(originalText, { preamble, kept, moved }) {
  const original = splitSections(originalText)
  const before = [
    ...original.preamble,
    ...original.sections.filter((section) => !isPointer(section)).flatMap((section) => section.lines),
  ]
  const after = [
    ...preamble,
    ...kept.filter((section) => !isPointer(section)).flatMap((section) => section.lines),
    ...[...moved.values()].flat().flatMap((section) => section.lines),
  ]
  const expected = countLines(before)
  const now = countLines(after)

  for (const [line, count] of expected) {
    if (now.get(line) !== count) {
      throw new Error(`a compactação perderia ou duplicaria linhas (primeira diferença: ${JSON.stringify(line.slice(0, 80))})`)
    }
  }
  if (after.length !== before.length) {
    throw new Error('a compactação mudaria o total de linhas do conteúdo original')
  }
}

function sameLines(a, b) {
  return a.length === b.length && a.every((line, index) => line === b[index])
}

/** Relê o que foi renderizado e confere que cada seção está inteira e na ordem. */
function assertRendered({ sourceText, archiveTexts, plan }) {
  const source = splitSections(sourceText)
  const keptNow = source.sections.filter((section) => !isPointer(section))
  const keptPlanned = plan.kept.filter((section) => !isPointer(section))
  if (
    !sameLines(source.preamble, plan.preamble) ||
    keptNow.length !== keptPlanned.length ||
    !keptNow.every((section, index) => sameLines(section.lines, keptPlanned[index].lines))
  ) {
    throw new Error('o IA.md renderizado não bate com o plano')
  }

  for (const [month, sections] of plan.moved) {
    const archived = splitSections(archiveTexts.get(month)).sections
    const tail = archived.slice(archived.length - sections.length)
    if (tail.length !== sections.length || !tail.every((section, index) => sameLines(section.lines, sections[index].lines))) {
      throw new Error(`o arquivo de ${month} não contém as seções movidas, inteiras e na ordem`)
    }
  }
}

/** Recusa escrever se o arquivo mudou depois de lido (outro agente pode estar anexando). */
function assertUnchanged(file, expectedText) {
  if (normalizeEol(fs.readFileSync(file, 'utf8')) !== expectedText) {
    throw new Error(`${file} mudou durante a execução; nada foi escrito, rode de novo`)
  }
}

function readIfExists(file) {
  return fs.existsSync(file) ? normalizeEol(fs.readFileSync(file, 'utf8')) : null
}

function buildOutputs({ text, file, keepFrom, archiveDir, prefix, today, cwd }) {
  const plan = planArchive(text, { keepFrom })
  assertLossless(text, plan)

  const sourceName = toPosix(path.relative(cwd, file))
  const archives = new Map()
  const archiveTexts = new Map()
  const items = []

  for (const [month, sections] of plan.moved) {
    const archiveFile = path.join(archiveDir, `${prefix}-${month}.md`)
    const sourceLink = toPosix(path.relative(path.dirname(archiveFile), file))
    const header = archiveHeader({ month, sourceName, sourceLink, today })
    const archiveText = renderArchive(readIfExists(archiveFile), header, sections)

    archives.set(month, archiveFile)
    archiveTexts.set(month, archiveText)
    items.push(pointerLine({ today, month, count: sections.length, link: toPosix(path.relative(path.dirname(file), archiveFile)) }))
  }

  const withPointers = { ...plan, kept: items.length > 0 ? withPointer(plan.kept, items) : plan.kept }
  const sourceText = renderSource(withPointers)
  assertRendered({ sourceText, archiveTexts, plan: withPointers })

  return { plan: withPointers, sourceText, archives, archiveTexts, items }
}

function describePlan({ plan, sourceText, archiveTexts, items }, before) {
  const bytes = (value) => Buffer.byteLength(value)
  const lines = [`${before.split('\n').length} linhas, ${bytes(before)} bytes antes; ${sourceText.split('\n').length} linhas, ${bytes(sourceText)} bytes depois.`]
  for (const [month, sections] of plan.moved) {
    lines.push(`  ${month}: ${sections.length} seções para o arquivo (${bytes(archiveTexts.get(month))} bytes)`)
  }
  lines.push('Ponteiros que entram no arquivo de origem:', ...items.map((item) => `  ${item}`))
  return lines.join('\n')
}

/** Executa o plano; sem `apply` só devolve o resumo. Lança em qualquer inconsistência. */
function run({ file, keepFrom, archiveDir, prefix, today, apply = false, cwd = process.cwd() }) {
  const absoluteFile = path.resolve(cwd, file)
  const absoluteDir = path.resolve(cwd, archiveDir)
  const text = normalizeEol(fs.readFileSync(absoluteFile, 'utf8'))
  const outputs = buildOutputs({ text, file: absoluteFile, keepFrom, archiveDir: absoluteDir, prefix, today, cwd })

  if (outputs.plan.moved.size === 0) return 'Nada a arquivar: nenhuma seção datada é anterior ao corte.'
  const summary = describePlan(outputs, text)
  if (!apply) return `${summary}\n\nDry-run: nada foi escrito. Use --apply para executar.`

  assertUnchanged(absoluteFile, text)
  fs.mkdirSync(absoluteDir, { recursive: true })
  // O arquivo de origem é o último a ser escrito: se algo falhar antes, nada se perdeu.
  for (const [month, archiveFile] of outputs.archives) fs.writeFileSync(archiveFile, outputs.archiveTexts.get(month))
  fs.writeFileSync(absoluteFile, outputs.sourceText)

  const written = new Map([...outputs.archives].map(([month, archiveFile]) => [month, normalizeEol(fs.readFileSync(archiveFile, 'utf8'))]))
  assertRendered({ sourceText: normalizeEol(fs.readFileSync(absoluteFile, 'utf8')), archiveTexts: written, plan: outputs.plan })
  return `${summary}\n\nEscrito e conferido no disco.`
}

function parseArgs(argv) {
  const options = { archiveDir: 'docs/ia-archive', prefix: 'IA-ARCHIVE', apply: false }
  const names = { '--file': 'file', '--keep-from': 'keepFrom', '--archive-dir': 'archiveDir', '--prefix': 'prefix', '--today': 'today' }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--apply') {
      options.apply = true
    } else if (names[arg]) {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} precisa de um valor`)
      options[names[arg]] = value
      index += 1
    } else {
      throw new Error(`argumento desconhecido: ${arg}`)
    }
  }

  const isoDate = /^\d{4}-\d{2}-\d{2}$/
  if (!options.file) throw new Error('informe --file')
  if (!isoDate.test(options.keepFrom ?? '')) throw new Error('informe --keep-from no formato AAAA-MM-DD')
  options.today ??= new Date().toLocaleDateString('sv-SE')
  if (!isoDate.test(options.today)) throw new Error('--today deve estar no formato AAAA-MM-DD')
  return options
}

if (require.main === module) {
  try {
    console.log(run(parseArgs(process.argv.slice(2))))
  } catch (error) {
    console.error(`[archive-ia-md] ${error.message}`)
    process.exitCode = 1
  }
}

module.exports = {
  POINTER_HEADING,
  assertLossless,
  assertUnchanged,
  headingDate,
  parseArgs,
  planArchive,
  run,
  splitSections,
}
