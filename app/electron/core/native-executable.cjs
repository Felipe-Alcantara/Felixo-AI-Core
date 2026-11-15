'use strict'

/**
 * @module native-executable
 * Confere, sem executar, se um arquivo é um programa que este sistema abre.
 *
 * As CLIs instaladas pelo npm chegam como pacotes, e o executável nativo de
 * algumas delas (o `bin/claude.exe` do Claude Code, o `codex.exe` do pacote da
 * plataforma do Codex) só fica no lugar se a instalação terminar inteira. Uma
 * extração interrompida deixa um arquivo pela metade; um `postinstall` que não
 * rodou deixa o placeholder de texto do npm com nome de `.exe`. Nos dois casos o
 * `package.json` diz que a versão está instalada, e o erro só aparece ao abrir o
 * terminal ("não é compatível com a versão do Windows", "exec format error").
 *
 * Aqui lemos só o cabeçalho (PE no Windows, ELF no Linux, Mach-O no macOS) e o
 * comparamos com o tamanho do arquivo: o formato é o do sistema, a arquitetura
 * roda nesta máquina e o arquivo tem todos os bytes que o cabeçalho promete.
 */

const fs = require('node:fs')

const FIRST_READ_BYTES = 64 * 1024
// Acima disso, a tabela de seções/comandos é lixo, não um executável real.
const MAX_HEADER_BYTES = 4 * 1024 * 1024
// O placeholder do npm tem centenas de bytes; um executável real, megabytes.
const STUB_MAX_BYTES = 64 * 1024

const PE_MACHINES = { x64: 0x8664, arm64: 0xaa64, ia32: 0x14c }
const ELF_MACHINES = { x64: 62, arm64: 183, ia32: 3 }
const MACHO_CPU_TYPES = { x64: 0x01000007, arm64: 0x0100000c }

/**
 * @typedef {'ausente' | 'stub' | 'formato' | 'arquitetura' | 'truncado'} NativeExecutableProblem
 */

/**
 * @param {string} filePath
 * @param {object} [options]
 * @param {string} [options.platformName]
 * @param {string} [options.arch]
 * @param {typeof fs} [options.fileSystem]
 * @returns {{ ok: true, format: string, size: number } | { ok: false, reason: NativeExecutableProblem, detail: string }}
 */
function inspectNativeExecutable(
  filePath,
  { platformName = process.platform, arch = process.arch, fileSystem = fs } = {},
) {
  let fd
  try {
    fd = fileSystem.openSync(filePath, 'r')
  } catch (error) {
    return { ok: false, reason: 'ausente', detail: error?.code ?? 'não abriu' }
  }

  try {
    const size = fileSystem.fstatSync(fd).size
    const head = readAt(fileSystem, fd, 0, Math.min(size, FIRST_READ_BYTES))
    const read = (offset, length) => readAt(fileSystem, fd, offset, length)
    const parsed = parseHeader(head, read, size)

    if (!parsed) {
      return looksLikeText(head) && size <= STUB_MAX_BYTES
        ? { ok: false, reason: 'stub', detail: `texto de ${size} bytes no lugar do executável` }
        : { ok: false, reason: 'formato', detail: `cabeçalho desconhecido (${size} bytes)` }
    }

    if (parsed.error) {
      return { ok: false, reason: 'truncado', detail: parsed.error }
    }

    const expectedFormat = { win32: 'pe', linux: 'elf', darwin: 'macho' }[platformName]
    if (expectedFormat && parsed.format !== expectedFormat) {
      return { ok: false, reason: 'formato', detail: `${parsed.format} não roda em ${platformName}` }
    }

    if (!runsOnArch(parsed, platformName, arch)) {
      return { ok: false, reason: 'arquitetura', detail: `${parsed.format} de outra arquitetura (${arch})` }
    }

    if (parsed.requiredSize > size) {
      return {
        ok: false,
        reason: 'truncado',
        detail: `${size} de ${parsed.requiredSize} bytes`,
      }
    }

    return { ok: true, format: parsed.format, size }
  } catch (error) {
    return { ok: false, reason: 'truncado', detail: error?.message ?? String(error) }
  } finally {
    try {
      fileSystem.closeSync(fd)
    } catch {
      // Já fechado: nada a liberar.
    }
  }
}

function readAt(fileSystem, fd, offset, length) {
  const buffer = Buffer.alloc(length)
  const bytes = length > 0 ? fileSystem.readSync(fd, buffer, 0, length, offset) : 0
  return buffer.subarray(0, bytes)
}

function parseHeader(head, read, size) {
  if (head.length >= 2 && head[0] === 0x4d && head[1] === 0x5a) {
    return parsePe(head, read, size)
  }
  if (head.length >= 4 && head.readUInt32BE(0) === 0x7f454c46) {
    return parseElf(head, read)
  }
  if (head.length >= 4 && head.readUInt32LE(0) === 0xfeedfacf) {
    return parseMachO(head, read)
  }
  if (head.length >= 8 && head.readUInt32BE(0) === 0xcafebabe) {
    return parseFatMachO(head, read)
  }
  return null
}

/** Lê `length` bytes a partir de `offset`, do cabeçalho em memória ou do disco. */
function bytesAt(head, read, offset, length) {
  if (offset + length > MAX_HEADER_BYTES) {
    throw new Error(`tabela do cabeçalho fora do limite (${offset + length} bytes)`)
  }
  if (offset + length <= head.length) {
    return head.subarray(offset, offset + length)
  }
  const chunk = read(offset, length)
  if (chunk.length < length) {
    throw new Error(`cabeçalho cortado no byte ${offset + chunk.length}`)
  }
  return chunk
}

function parsePe(head, read, size) {
  if (head.length < 0x40) {
    return { format: 'pe', error: `cabeçalho cortado no byte ${head.length}` }
  }
  const peOffset = head.readUInt32LE(0x3c)
  const coff = bytesAt(head, read, peOffset, 24)
  if (coff.readUInt32BE(0) !== 0x50450000) {
    // `MZ` sem `PE\0\0` é um executável de DOS, não um programa do Windows.
    return { format: 'mz', machine: null, requiredSize: size }
  }
  const machine = coff.readUInt16LE(4)
  const sectionCount = coff.readUInt16LE(6)
  const optionalSize = coff.readUInt16LE(20)
  const optional = bytesAt(head, read, peOffset + 24, optionalSize)
  let requiredSize = peOffset + 24 + optionalSize + sectionCount * 40

  const sections = bytesAt(head, read, peOffset + 24 + optionalSize, sectionCount * 40)
  for (let index = 0; index < sectionCount; index += 1) {
    const rawSize = sections.readUInt32LE(index * 40 + 16)
    const rawPointer = sections.readUInt32LE(index * 40 + 20)
    if (rawSize > 0) {
      requiredSize = Math.max(requiredSize, rawPointer + rawSize)
    }
  }

  // A assinatura Authenticode fica depois das seções; o diretório 4 guarda um
  // deslocamento no arquivo (não um RVA), e um corte ali também quebra o .exe.
  const magic = optional.length >= 2 ? optional.readUInt16LE(0) : 0
  const directoriesAt = magic === 0x20b ? 112 : magic === 0x10b ? 96 : null
  const securityAt = directoriesAt === null ? null : directoriesAt + 4 * 8
  if (securityAt !== null && optional.length >= securityAt + 8) {
    const certificateOffset = optional.readUInt32LE(securityAt)
    const certificateSize = optional.readUInt32LE(securityAt + 4)
    if (certificateOffset > 0 && certificateSize > 0) {
      requiredSize = Math.max(requiredSize, certificateOffset + certificateSize)
    }
  }

  return { format: 'pe', machine, requiredSize }
}

function parseElf(head, read) {
  if (head.length < 0x40) {
    return { format: 'elf', error: `cabeçalho cortado no byte ${head.length}` }
  }
  const is64 = head[4] === 2
  if (head[5] !== 1) {
    // Big-endian: nenhuma das plataformas do app.
    return { format: 'elf', machine: null, requiredSize: 0 }
  }
  const machine = head.readUInt16LE(18)
  const u = (buffer, offset) =>
    is64 ? Number(buffer.readBigUInt64LE(offset)) : buffer.readUInt32LE(offset)
  const programOffset = u(head, is64 ? 0x20 : 0x1c)
  const sectionOffset = u(head, is64 ? 0x28 : 0x20)
  const programEntrySize = head.readUInt16LE(is64 ? 0x36 : 0x2a)
  const programCount = head.readUInt16LE(is64 ? 0x38 : 0x2c)
  const sectionEntrySize = head.readUInt16LE(is64 ? 0x3a : 0x2e)
  const sectionCount = head.readUInt16LE(is64 ? 0x3c : 0x30)

  let requiredSize = Math.max(
    programOffset + programEntrySize * programCount,
    sectionCount > 0 ? sectionOffset + sectionEntrySize * sectionCount : 0,
  )
  const programs = bytesAt(head, read, programOffset, programEntrySize * programCount)
  for (let index = 0; index < programCount; index += 1) {
    const base = index * programEntrySize
    const fileOffset = u(programs, base + (is64 ? 8 : 4))
    const fileSize = u(programs, base + (is64 ? 32 : 16))
    requiredSize = Math.max(requiredSize, fileOffset + fileSize)
  }

  return { format: 'elf', machine, requiredSize }
}

function parseMachO(head, read) {
  if (head.length < 32) {
    return { format: 'macho', error: `cabeçalho cortado no byte ${head.length}` }
  }
  const cpuType = head.readUInt32LE(4)
  const commandCount = head.readUInt32LE(16)
  const commandsSize = head.readUInt32LE(20)
  const commands = bytesAt(head, read, 32, commandsSize)
  let requiredSize = 32 + commandsSize
  let offset = 0
  for (let index = 0; index < commandCount && offset + 8 <= commands.length; index += 1) {
    const command = commands.readUInt32LE(offset)
    const commandSize = commands.readUInt32LE(offset + 4)
    if (commandSize < 8) {
      break
    }
    if (command === 0x19 && offset + 56 <= commands.length) {
      // LC_SEGMENT_64: fileoff e filesize.
      const fileOffset = Number(commands.readBigUInt64LE(offset + 40))
      const fileSize = Number(commands.readBigUInt64LE(offset + 48))
      requiredSize = Math.max(requiredSize, fileOffset + fileSize)
    }
    offset += commandSize
  }
  return { format: 'macho', machine: cpuType, requiredSize }
}

function parseFatMachO(head, read) {
  const archCount = head.readUInt32BE(4)
  const table = bytesAt(head, read, 8, archCount * 20)
  const machines = []
  let requiredSize = 8 + archCount * 20
  for (let index = 0; index < archCount; index += 1) {
    const base = index * 20
    machines.push(table.readUInt32BE(base))
    requiredSize = Math.max(requiredSize, table.readUInt32BE(base + 8) + table.readUInt32BE(base + 12))
  }
  return { format: 'macho', machine: null, machines, requiredSize }
}

function runsOnArch(parsed, platformName, arch) {
  const table = { pe: PE_MACHINES, elf: ELF_MACHINES, macho: MACHO_CPU_TYPES }[parsed.format]
  if (!table) {
    return false
  }
  const machines = parsed.machines ?? [parsed.machine]
  if (machines.includes(table[arch])) {
    return true
  }
  // Windows e macOS em ARM rodam binário x64 por emulação (Prism, Rosetta).
  return arch === 'arm64' && platformName !== 'linux' && machines.includes(table.x64)
}

function looksLikeText(buffer) {
  if (buffer.length === 0) {
    return true
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 512))
  return sample.every((byte) => byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte !== 127))
}

/**
 * Frase curta para a interface e o log.
 *
 * @param {NativeExecutableProblem} reason
 */
function describeNativeExecutableProblem(reason) {
  return {
    ausente: 'o executável não está no pacote',
    stub: 'o executável é o arquivo provisório do npm (o pós-instalação não rodou ou o pacote da plataforma não veio)',
    formato: 'o executável não é um programa deste sistema',
    arquitetura: 'o executável é de outra arquitetura de processador',
    truncado: 'o executável está incompleto (a instalação foi interrompida)',
  }[reason]
}

module.exports = {
  describeNativeExecutableProblem,
  inspectNativeExecutable,
}
