import { useEffect, useState } from 'react'

/**
 * Versão do app que está rodando agora.
 *
 * Vem do processo principal via IPC porque o número real só existe no
 * empacotamento do CI (o `package.json` versionado fica em 0.1.0);
 * `app.getVersion()` é a única fonte de verdade em runtime. Sem
 * `window.felixo` (navegador, testes) fica `null` e quem exibe decide o que
 * fazer com isso.
 */
export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.felixo?.getVersion?.().then((result) => {
      if (!cancelled && result) {
        setVersion(result)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return version
}
