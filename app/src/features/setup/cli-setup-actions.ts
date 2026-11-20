import { resultadoDeIpc, type IpcOutcome } from '../shared/ipc/ipc-result'

const SEM_RETRY = 'Não foi possível iniciar uma nova tentativa de instalar as CLIs.'

type PonteDoSetup = { retry?: () => Promise<{ ok?: boolean; message?: string } | undefined> }

/**
 * Pede ao processo principal uma nova tentativa. `{ ok: false }` e rejeição voltam como falha com a mensagem, para o aviso
 * dizer que a tentativa NÃO começou (antes o retorno era descartado e a pessoa ficava esperando).
 */
export function tentarInstalarDeNovo(ponte: PonteDoSetup | undefined): Promise<IpcOutcome<unknown>> {
  return resultadoDeIpc(() => ponte?.retry?.(), SEM_RETRY)
}

/**
 * Dispensar o andamento não pode esconder o da próxima rodada: a chave de "instalando" é sempre a mesma. Quando a rodada
 * acaba (resultado) ou começa outra (nova tentativa), a dispensa do andamento deixa de valer.
 */
export function dispensaDoAndamentoCaiu(dismissedKey: string | null, proximoEstado: string): boolean {
  return dismissedKey === 'em-andamento' && proximoEstado !== 'installing' && proximoEstado !== 'checking'
}
