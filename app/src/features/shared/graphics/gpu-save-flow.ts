/**
 * A ordem do "Salvar placa de vídeo", fora do componente para ser testada sem
 * DOM (o vitest daqui roda em `node`).
 *
 * Duas coisas dependiam da ordem e falhavam para quem usa o teclado:
 * - `saveGpuPreference` publica a escolha nova no store ANTES de devolver o
 *   resultado. Sem duas placas e salvando Automático, `shouldShowGpuChoice`
 *   passava a `false` nesse instante e o campo era desmontado, com o foco indo
 *   para o BODY; só depois `justSaved` o fazia voltar. Por isso o campo é
 *   segurado ANTES de salvar.
 * - O seletor e o botão ficam desligados enquanto salva, e um controle que
 *   desliga com o foco nele o perde. O foco volta ao seletor DEPOIS de
 *   `saving` virar `false`, quando ele já está ligado de novo.
 */

export type GpuSaveStep = {
  /** Segura o campo na tela (`justSaved`) enquanto o estado novo chega ao store. */
  holdField: (hold: boolean) => void
  setSaving: (saving: boolean) => void
  setMessage: (message: string) => void
  /** Descarta o rascunho: o que está no seletor passou a ser o salvo. */
  clearDraft: () => void
  /** Pede o foco do seletor para depois de ele estar ligado de novo. */
  requestFocusRestore: () => void
  save: () => Promise<{ ok: boolean; message: string }>
}

/**
 * @param heldBefore - Se o campo já estava segurado antes deste salvamento
 *   (volta a esse valor se o salvamento falhar).
 */
export async function runGpuSave(steps: GpuSaveStep, heldBefore: boolean): Promise<void> {
  steps.setSaving(true)
  steps.holdField(true)
  let result: { ok: boolean; message: string }
  try {
    result = await steps.save()
  } catch {
    result = { ok: false, message: 'Não foi possível salvar a placa de vídeo.' }
  }
  steps.setMessage(result.message)
  if (result.ok) steps.clearDraft()
  else steps.holdField(heldBefore)
  steps.setSaving(false)
  steps.requestFocusRestore()
}
