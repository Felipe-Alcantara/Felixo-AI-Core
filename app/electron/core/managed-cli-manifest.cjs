/**
 * @module managed-cli-manifest
 * Versão e hash exatos que a instalação automática das CLIs aceita.
 *
 * A instalação manual documentada (`official-cli-catalog.cjs`) continua livre
 * para instalar `latest` — é o comando que a pessoa copia do próprio
 * terminal, e travar isso destoaria da documentação oficial de cada CLI.
 * Este manifesto vale só para a instalação automática e gerenciada pelo app
 * (`cli-auto-install.cjs` → `managed-cli-installer.cjs`), onde ninguém está
 * olhando o que foi baixado: sem um pin explícito, o app instalaria uma
 * versão nova e não revisada a cada execução, e sem hash não há como saber
 * se o registry entregou o pacote esperado.
 *
 * Atualizar uma entrada aqui é decisão deliberada: subir a versão, conferir
 * o hash publicado pelo próprio registry (`npm view <pacote>@<versao>
 * dist.integrity`) e commitar os dois juntos. `managed-cli-manifest.test.cjs`
 * falha se o hash não tiver o formato esperado — não se ele estiver
 * desatualizado, isso o teste não sabe medir.
 */

const MANAGED_CLI_MANIFEST = Object.freeze({
  codex: Object.freeze({
    npmPackage: '@openai/codex',
    version: '0.153.4',
    // O pacote principal delega o executável nativo a uma dependência
    // opcional diferente por plataforma/arquitetura. No Windows, npm pode
    // terminar com código 0 sem materializar essa dependência.
    platformPackages: Object.freeze({
      win32: Object.freeze({
        x64: '@openai/codex-win32-x64',
        arm64: '@openai/codex-win32-arm64',
      }),
    }),
    // Capturado em 06/09/2026 via `npm view @openai/codex@0.153.4 dist.integrity`.
    integrity:
      'sha512-wbHDmit7S/YvBGVX1DQmk13xtWblZ2cApeJ/pB7xDZ10Cna+DZc5ij7f0F4OxdsXN4FW1oLT48OpogUI1+8Y2w==',
  }),
  claude: Object.freeze({
    npmPackage: '@anthropic-ai/claude-code',
    version: '2.1.263',
    // Capturado em 06/09/2026 via `npm view @anthropic-ai/claude-code@2.1.263 dist.integrity`.
    integrity:
      'sha512-kvvBK6/69iTRYnq0TKVyxVZs1CxYCJGojshQSP+2qaDb66A2xtI4zbCuqkZUWLkFGmHSRqhFf/ATpzH2UNKcwg==',
  }),
  gemini: Object.freeze({
    npmPackage: '@google/gemini-cli',
    version: '0.58.0',
    // Capturado em 06/09/2026 via `npm view @google/gemini-cli@0.58.0 dist.integrity`.
    integrity:
      'sha512-++LtUYMcLE8dVxMcuwv6kIp8+h6z+std/7iVE+vSunkrwNDaWMFkWw/psv2RSySWjr2A1SsEEIGCK0xULWY2sA==',
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
