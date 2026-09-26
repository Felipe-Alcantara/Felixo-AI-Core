type SystemDesignBridge = NonNullable<NonNullable<Window['felixo']>['systemDesign']>

/** Só o que a leitura de um guia precisa da ponte do Electron. */
export type SystemDesignDocumentReader = Pick<SystemDesignBridge, 'getDocument'>

/**
 * O que a prévia de um guia mostra. `loading` é o estado de quem acabou de
 * abrir o item; os outros três são o resultado de uma leitura já terminada.
 */
export type SystemDesignDocumentReadState =
  | { status: 'loading' }
  | { status: 'ready'; content: string }
  | { status: 'empty' }
  | { status: 'error'; message: string }

export const LOADING_DOCUMENT: SystemDesignDocumentReadState = { status: 'loading' }

export const DOCUMENT_READER_UNAVAILABLE_MESSAGE =
  'A leitura dos guias só está disponível no app desktop.'

const DOCUMENT_NOT_FOUND_MESSAGE =
  'Documento não encontrado no cache local. Sincronize e tente de novo.'

/**
 * Lê um guia do cache local (o índice só traz o resumo, sem o conteúdo).
 *
 * Nunca rejeita: a prévia precisa de um estado para mostrar em qualquer caso —
 * inclusive sem a ponte (preview web) e quando o documento sumiu do cache
 * porque outra tela sincronizou uma fonte sem ele.
 */
export async function readSystemDesignDocument(
  reader: SystemDesignDocumentReader | undefined,
  documentPath: string,
): Promise<SystemDesignDocumentReadState> {
  if (!reader?.getDocument) {
    return { status: 'error', message: DOCUMENT_READER_UNAVAILABLE_MESSAGE }
  }

  try {
    const result = await reader.getDocument(documentPath)
    if (!result.ok || !result.document) {
      return { status: 'error', message: result.message ?? DOCUMENT_NOT_FOUND_MESSAGE }
    }

    const content = typeof result.document.content === 'string' ? result.document.content : ''
    return content.trim() ? { status: 'ready', content } : { status: 'empty' }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Falha desconhecida ao ler o documento.',
    }
  }
}
