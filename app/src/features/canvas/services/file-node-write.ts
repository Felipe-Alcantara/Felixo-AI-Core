import { describeFailure } from './canvas-persistence-status'

export type FileWriteOutcome = { ok: true } | { ok: false; message: string }

type FileBridges = Pick<NonNullable<Window['felixo']>, 'textFiles' | 'canvasFiles'>

/**
 * Grava o conteúdo de um bloco de arquivo e confere o resultado.
 *
 * O IPC responde `{ ok: false }` (e não lança) quando o disco recusa; sem olhar
 * isso a tela mostrava o texto digitado e nada dizia que ele não foi gravado.
 */
export async function writeFileNodeContent(
  bridges: FileBridges | undefined,
  target: { filePath?: string; fileName?: string },
  content: string,
): Promise<FileWriteOutcome> {
  const request = target.filePath
    ? bridges?.textFiles?.write({ path: target.filePath, content })
    : target.fileName
      ? bridges?.canvasFiles?.write({ name: target.fileName, content })
      : undefined
  // Sem ponte (pré-visualização web) não há disco a que se referir.
  if (!request) return { ok: true }

  try {
    const result = await request
    return result?.ok
      ? { ok: true }
      : { ok: false, message: describeFailure(result, 'o disco não aceitou a gravação.') }
  } catch (error) {
    return { ok: false, message: describeFailure(error, 'a gravação falhou.') }
  }
}
