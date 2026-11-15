'use strict'

/**
 * Executáveis mínimos (só cabeçalho e o tamanho que ele promete) para testar a
 * conferência de `core/native-executable.cjs` em qualquer SO, sem binário real.
 */

const PE_MACHINE = { x64: 0x8664, arm64: 0xaa64 }
const ELF_MACHINE = { x64: 62, arm64: 183 }
const MACHO_CPU = { x64: 0x01000007, arm64: 0x0100000c }

/** O placeholder que o `@anthropic-ai/claude-code` publica em `bin/claude.exe`. */
const NPM_PLACEHOLDER_STUB = [
  'echo "Error: claude native binary not installed." >&2',
  'echo "Either postinstall did not run (--ignore-scripts, some pnpm configs)" >&2',
  'echo "or the platform-native optional dependency was not downloaded" >&2',
  'exit 1',
  '',
].join('\n')

/**
 * PE32+ com uma seção de dados de 0x200 bytes em 0x200 e, opcionalmente, uma
 * assinatura Authenticode logo depois.
 */
function buildPe({ arch = 'x64', certificateSize = 0 } = {}) {
  const sectionPointer = 0x200
  const sectionSize = 0x200
  const certificateOffset = sectionPointer + sectionSize
  const size = certificateOffset + certificateSize
  const buffer = Buffer.alloc(size)
  buffer.write('MZ', 0, 'latin1')
  buffer.writeUInt32LE(0x40, 0x3c)
  buffer.write('PE\0\0', 0x40, 'latin1')
  const coff = 0x44
  buffer.writeUInt16LE(PE_MACHINE[arch], coff)
  buffer.writeUInt16LE(1, coff + 2)
  buffer.writeUInt16LE(240, coff + 16)
  const optional = coff + 20
  buffer.writeUInt16LE(0x20b, optional)
  if (certificateSize > 0) {
    buffer.writeUInt32LE(certificateOffset, optional + 112 + 32)
    buffer.writeUInt32LE(certificateSize, optional + 112 + 36)
  }
  const section = optional + 240
  buffer.write('.text', section, 'latin1')
  buffer.writeUInt32LE(sectionSize, section + 16)
  buffer.writeUInt32LE(sectionPointer, section + 20)
  return buffer
}

/** ELF64 com um PT_LOAD e a tabela de seções no fim, como o `ld` deixa. */
function buildElf({ arch = 'x64' } = {}) {
  const sectionOffset = 0x1000
  const buffer = Buffer.alloc(sectionOffset + 2 * 64)
  buffer.writeUInt32BE(0x7f454c46, 0)
  buffer[4] = 2
  buffer[5] = 1
  buffer[6] = 1
  buffer.writeUInt16LE(2, 16)
  buffer.writeUInt16LE(ELF_MACHINE[arch], 18)
  buffer.writeBigUInt64LE(64n, 0x20)
  buffer.writeBigUInt64LE(BigInt(sectionOffset), 0x28)
  buffer.writeUInt16LE(56, 0x36)
  buffer.writeUInt16LE(1, 0x38)
  buffer.writeUInt16LE(64, 0x3a)
  buffer.writeUInt16LE(2, 0x3c)
  buffer.writeUInt32LE(1, 64)
  buffer.writeBigUInt64LE(0n, 64 + 8)
  buffer.writeBigUInt64LE(BigInt(sectionOffset), 64 + 32)
  return buffer
}

/** Mach-O de 64 bits com um LC_SEGMENT_64 cobrindo o arquivo inteiro. */
function buildMachO({ arch = 'arm64', size = 0x1000 } = {}) {
  const buffer = Buffer.alloc(size)
  buffer.writeUInt32LE(0xfeedfacf, 0)
  buffer.writeUInt32LE(MACHO_CPU[arch], 4)
  buffer.writeUInt32LE(2, 12)
  buffer.writeUInt32LE(1, 16)
  buffer.writeUInt32LE(72, 20)
  buffer.writeUInt32LE(0x19, 32)
  buffer.writeUInt32LE(72, 36)
  buffer.write('__TEXT', 40, 'latin1')
  buffer.writeBigUInt64LE(0n, 32 + 40)
  buffer.writeBigUInt64LE(BigInt(size), 32 + 48)
  return buffer
}

/** Universal (x64 + arm64), como o Node e o Codex publicam para o macOS. */
function buildFatMachO() {
  const slices = [
    { arch: 'x64', offset: 0x1000 },
    { arch: 'arm64', offset: 0x2000 },
  ]
  const buffer = Buffer.alloc(0x3000)
  buffer.writeUInt32BE(0xcafebabe, 0)
  buffer.writeUInt32BE(slices.length, 4)
  slices.forEach(({ arch, offset }, index) => {
    const base = 8 + index * 20
    buffer.writeUInt32BE(MACHO_CPU[arch], base)
    buffer.writeUInt32BE(offset, base + 8)
    buffer.writeUInt32BE(0x1000, base + 12)
    buildMachO({ arch }).copy(buffer, offset)
  })
  return buffer
}

/** Executável válido para a plataforma/arquitetura pedida. */
function buildExecutableFor(platformName, arch) {
  if (platformName === 'win32') return buildPe({ arch })
  if (platformName === 'darwin') return buildMachO({ arch })
  return buildElf({ arch })
}

module.exports = {
  NPM_PLACEHOLDER_STUB,
  buildElf,
  buildExecutableFor,
  buildFatMachO,
  buildMachO,
  buildPe,
}
