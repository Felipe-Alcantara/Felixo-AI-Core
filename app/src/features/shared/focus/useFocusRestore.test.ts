import { describe, expect, it } from 'vitest'
import { instalarRestauracaoDeFoco, type AmbienteDeFoco } from './useFocusRestore'
import type { Focusable } from './focus-restore'

/**
 * Bancada com um DOM de mentira: o que importa aqui é a fiação dos eventos —
 * quem é ouvido, em que ordem o foco é lido, e se a limpeza solta tudo.
 */
function criarBancada(
  visibilityState: DocumentVisibilityState = 'visible',
  comFocoNativo = false,
) {
  const ouvintes = new Map<string, Set<(event: unknown) => void>>()
  const ouvintesDeFocoNativo = new Set<(focado: boolean) => void>()
  const eventosDeJanela: string[] = []
  const quadros: Array<() => void> = []
  const body = { nodeName: 'BODY' } as unknown as HTMLElement

  const registrar = (alvo: string) => (tipo: string, ouvinte: unknown) => {
    const chave = `${alvo}:${tipo}`
    const atual = ouvintes.get(chave) ?? new Set()
    atual.add(ouvinte as (event: unknown) => void)
    ouvintes.set(chave, atual)
  }

  const remover = (alvo: string) => (tipo: string, ouvinte: unknown) => {
    ouvintes.get(`${alvo}:${tipo}`)?.delete(ouvinte as (event: unknown) => void)
  }

  const documento = {
    addEventListener: registrar('doc'),
    removeEventListener: remover('doc'),
    body,
    activeElement: null as Element | null,
    visibilityState,
  }

  const ambiente: AmbienteDeFoco = {
    documento: documento as unknown as AmbienteDeFoco['documento'],
    janela: {
      addEventListener: registrar('win'),
      removeEventListener: remover('win'),
    } as unknown as AmbienteDeFoco['janela'],
    agendarQuadro: (callback) => quadros.push(callback),
    emitirEventoDeJanela: (tipo) => eventosDeJanela.push(tipo),
  }
  if (comFocoNativo) {
    ambiente.ouvirFocoNativo = (callback) => {
      ouvintesDeFocoNativo.add(callback)
      return () => ouvintesDeFocoNativo.delete(callback)
    }
  }

  const lembradoRef: { current: Focusable | null } = { current: null }
  const parar = instalarRestauracaoDeFoco(ambiente, lembradoRef)

  return {
    documento,
    lembradoRef,
    parar,
    body,
    disparar: (chave: string, event: unknown = {}) => {
      for (const ouvinte of ouvintes.get(chave) ?? []) {
        ouvinte(event)
      }
    },
    dispararFocoNativo: (focado: boolean) => {
      for (const ouvinte of ouvintesDeFocoNativo) {
        ouvinte(focado)
      }
    },
    /** Roda os quadros pendentes, como o navegador faria. */
    rodarQuadros: () => {
      const pendentes = quadros.splice(0, quadros.length)
      for (const quadro of pendentes) quadro()
    },
    contarOuvintes: () =>
      Array.from(ouvintes.values()).reduce((total, grupo) => total + grupo.size, 0),
    contarOuvintesDeFocoNativo: () => ouvintesDeFocoNativo.size,
    eventosDeJanela,
  }
}

function alvoFocavel() {
  let focado = 0
  const alvo = {
    isConnected: true,
    focus: () => {
      focado += 1
    },
    blur: () => {},
  }
  return { alvo, vezesFocado: () => focado }
}

describe('instalarRestauracaoDeFoco', () => {
  it('devolve o foco ao terminal depois que a janela volta', () => {
    const bancada = criarBancada()
    const { alvo, vezesFocado } = alvoFocavel()

    // A pessoa estava digitando no terminal e o app perdeu o foco.
    bancada.disparar('doc:focusout', { target: alvo })
    bancada.documento.activeElement = null

    bancada.disparar('win:focus')
    bancada.rodarQuadros()

    expect(vezesFocado()).toBe(1)
  })

  it('faz um ciclo completo de blur+focus, não só focus', () => {
    // O `focus()` sozinho num elemento que o DOM já considera focado costuma
    // ser ignorado — é o ciclo completo que reproduz o que o minimizar do
    // Windows fazia de graça e destrava o roteamento nativo de teclado.
    const bancada = criarBancada()
    const ordem: string[] = []
    const alvo = {
      isConnected: true,
      blur: () => ordem.push('blur'),
      focus: () => ordem.push('focus'),
    }

    bancada.disparar('doc:focusout', { target: alvo })
    bancada.documento.activeElement = null

    bancada.disparar('win:focus')
    bancada.rodarQuadros()

    expect(ordem).toEqual(['blur', 'focus'])
  })

  it('restaura mesmo quando o navegador não limpou o activeElement (fora do ciclo de minimizar do Windows)', () => {
    const bancada = criarBancada()
    const { alvo, vezesFocado } = alvoFocavel()

    bancada.disparar('doc:focusout', { target: alvo })
    // O Chromium não zerou o activeElement desta vez — continua sendo o
    // próprio elemento lembrado, mas o teclado de verdade já parou de chegar.
    bancada.documento.activeElement = alvo as unknown as Element

    bancada.disparar('win:focus')
    bancada.rodarQuadros()

    expect(vezesFocado()).toBe(1)
  })

  it('lembra o activeElement quando o blur nativo não emite focusout', () => {
    const bancada = criarBancada('visible', true)
    const { alvo } = alvoFocavel()
    bancada.documento.activeElement = alvo as unknown as Element

    bancada.dispararFocoNativo(false)

    expect(bancada.lembradoRef.current).toBe(alvo)
  })

  it('restaura um campo depois do retorno pelo foco nativo da janela', () => {
    const bancada = criarBancada('visible', true)
    const { alvo, vezesFocado } = alvoFocavel()
    bancada.documento.activeElement = alvo as unknown as Element

    bancada.dispararFocoNativo(false)
    bancada.documento.activeElement = null
    bancada.dispararFocoNativo(true)
    bancada.rodarQuadros()

    expect(vezesFocado()).toBe(1)
  })

  it('reenvia o blur nativo para limpar estados de teclado dos consumidores', () => {
    const bancada = criarBancada('visible', true)
    const { alvo } = alvoFocavel()
    bancada.documento.activeElement = alvo as unknown as Element

    bancada.dispararFocoNativo(false)

    expect(bancada.eventosDeJanela).toEqual(['blur'])
  })

  it('não agenda duas restaurações quando DOM e BrowserWindow avisam o retorno', () => {
    const bancada = criarBancada('visible', true)
    const { alvo, vezesFocado } = alvoFocavel()
    bancada.disparar('doc:focusout', { target: alvo })
    bancada.documento.activeElement = null

    bancada.disparar('win:focus')
    bancada.dispararFocoNativo(true)
    bancada.rodarQuadros()

    expect(vezesFocado()).toBe(1)
  })

  it('cobre o retorno do minimizado pelo visibilitychange', () => {
    const bancada = criarBancada()
    const { alvo, vezesFocado } = alvoFocavel()

    bancada.disparar('doc:focusout', { target: alvo })
    bancada.documento.activeElement = bancada.body

    bancada.disparar('doc:visibilitychange')
    bancada.rodarQuadros()

    expect(vezesFocado()).toBe(1)
  })

  it('não rouba o foco de um modal que abriu enquanto isso', () => {
    const bancada = criarBancada()
    const { alvo, vezesFocado } = alvoFocavel()

    bancada.disparar('doc:focusout', { target: alvo })
    // Um campo de modal se autofocou antes do quadro rodar.
    bancada.documento.activeElement = { nodeName: 'INPUT' } as unknown as Element

    bancada.disparar('win:focus')
    bancada.rodarQuadros()

    expect(vezesFocado()).toBe(0)
  })

  it('ignora o body como elemento lembrado', () => {
    const bancada = criarBancada()

    bancada.disparar('doc:focusout', { target: bancada.body })

    expect(bancada.lembradoRef.current).toBeNull()
  })

  it('não devolve o foco a um elemento que saiu do documento', () => {
    const bancada = criarBancada()
    const alvo = { isConnected: false, focus: () => expect.unreachable() }

    bancada.disparar('doc:focusout', { target: alvo })
    bancada.documento.activeElement = null

    bancada.disparar('win:focus')
    expect(() => bancada.rodarQuadros()).not.toThrow()
  })

  it('não restaura enquanto a janela está escondida', () => {
    const bancada = criarBancada('hidden')
    const { alvo, vezesFocado } = alvoFocavel()

    bancada.disparar('doc:focusout', { target: alvo })
    bancada.disparar('doc:visibilitychange')
    bancada.rodarQuadros()

    expect(vezesFocado()).toBe(0)
  })

  it('solta todos os ouvintes na limpeza', () => {
    const bancada = criarBancada()
    expect(bancada.contarOuvintes()).toBe(3)

    bancada.parar()

    expect(bancada.contarOuvintes()).toBe(0)
  })

  it('solta também o ouvinte de foco nativo na limpeza', () => {
    const bancada = criarBancada('visible', true)
    expect(bancada.contarOuvintesDeFocoNativo()).toBe(1)

    bancada.parar()

    expect(bancada.contarOuvintesDeFocoNativo()).toBe(0)
  })
})
