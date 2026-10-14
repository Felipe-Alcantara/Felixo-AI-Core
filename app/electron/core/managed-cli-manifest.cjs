/**
 * @module managed-cli-manifest
 * Fallback versionado para a instalação automática das CLIs.
 *
 * A instalação manual documentada (`official-cli-catalog.cjs`) continua livre
 * para instalar `latest` — é o comando que a pessoa copia do próprio
 * terminal, e travar isso destoaria da documentação oficial de cada CLI.
 * A rotina consulta `latest` no registry em cada abertura e confere o hash da
 * versão exata retornada antes de instalar. Este manifesto continua sendo o
 * alvo seguro quando o registry está indisponível, para que uma instalação
 * limpa ainda use a versão mais recente conhecida pelo release.
 *
 * Atualizar uma entrada aqui mantém o fallback fresco: subir a versão,
 * conferir o hash publicado pelo próprio registry (`npm view
 * <pacote>@<versão> dist.integrity`) e commitar os dois juntos.
 */

const MANAGED_CLI_MANIFEST = Object.freeze({
  codex: Object.freeze({
    npmPackage: '@openai/codex',
    version: '0.162.1',
    // O pacote principal delega o executável nativo a uma dependência
    // opcional diferente por plataforma/arquitetura. No Windows, npm pode
    // terminar com código 0 sem materializar essa dependência.
    platformPackages: Object.freeze({
      win32: Object.freeze({
        x64: '@openai/codex-win32-x64',
        arm64: '@openai/codex-win32-arm64',
      }),
    }),
    // Capturado em 13/10/2026 via `npm view @openai/codex@0.162.1 dist.integrity`.
    integrity:
      'sha512-NWZdi/kxyjv/8EUGFupziGU38YyleugZRM4JXgY5XFH7FUmaFA33NZS2Bmq0HPazf7S3jJQQWsZ/jAK9jsrV3Q==',
  }),
  claude: Object.freeze({
    npmPackage: '@anthropic-ai/claude-code',
    version: '2.1.296',
    // Capturado em 13/10/2026 via `npm view @anthropic-ai/claude-code@2.1.296 dist.integrity`.
    integrity:
      'sha512-OX/k/rpcthMqnFKOWcpNcbiLsMKtAjLOpQNJHlYiDCFUznWCIwdRTyl/p9SdHVrsrzZuPMCNqZjnpakIni6upw==',
  }),
  gemini: Object.freeze({
    npmPackage: '@google/gemini-cli',
    version: '0.64.0',
    // Capturado em 13/10/2026 via `npm view @google/gemini-cli@0.64.0 dist.integrity`.
    integrity:
      'sha512-FHrZ1NPf9QszyVMaa/BP3SsPy40ogBLnbZNWkv/PMi1Uz2zoDNMLGiBzBGmx4Bl7iLRq01K9PY/5kmloXFTpsA==',
  }),
})

/**
 * @param {string} providerId
 * @returns {{ npmPackage: string, version: string, integrity: string, platformPackages?: Record<string, Record<string, string>> } | null}
 */
function getManagedCliManifestEntry(providerId) {
  return MANAGED_CLI_MANIFEST[providerId] ?? null
}

/**
 * Pacote nativo que precisa existir para uma instalação gerenciada funcionar
 * na plataforma/arquitetura atual.
 *
 * @param {string} providerId
 * @param {object} [options]
 * @param {string} [options.platformName]
 * @param {string} [options.arch]
 * @returns {string | null}
 */
function getManagedCliPlatformPackage(
  providerId,
  { platformName = process.platform, arch = process.arch } = {},
) {
  const entry = getManagedCliManifestEntry(providerId)
  return entry?.platformPackages?.[platformName]?.[arch] ?? null
}

/**
 * `pacote@versao-exata`, o alvo que o npm deve instalar — nunca o pacote
 * solto, que resolveria para `latest`.
 *
 * @param {string} providerId
 * @returns {string | null}
 */
function getPinnedInstallTarget(providerId) {
  const entry = getManagedCliManifestEntry(providerId)
  return entry ? `${entry.npmPackage}@${entry.version}` : null
}

module.exports = {
  MANAGED_CLI_MANIFEST,
  getManagedCliManifestEntry,
  getManagedCliPlatformPackage,
  getPinnedInstallTarget,
}
