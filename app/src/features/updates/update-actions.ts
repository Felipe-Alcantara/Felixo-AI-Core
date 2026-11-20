import { resultadoDeIpc, type IpcOutcome } from '../shared/ipc/ipc-result'

type PonteDeAtualizacao = {
  install?: () => Promise<{ ok?: boolean; message?: string } | undefined>
  check?: () => Promise<{ ok?: boolean; message?: string } | undefined>
}

/** "Versão X pronta": se o processo principal recusa ou a IPC falha, devolve a mensagem em vez de não acontecer nada. */
export function instalarAtualizacao(ponte: PonteDeAtualizacao | undefined): Promise<IpcOutcome<unknown>> {
  return resultadoDeIpc(() => ponte?.install?.(), 'Não foi possível instalar a atualização agora.')
}

export function verificarAtualizacao(ponte: PonteDeAtualizacao | undefined): Promise<IpcOutcome<unknown>> {
  return resultadoDeIpc(() => ponte?.check?.(), 'Não foi possível verificar atualizações agora.')
}
