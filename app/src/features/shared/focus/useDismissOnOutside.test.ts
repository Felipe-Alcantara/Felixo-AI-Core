import { describe, expect, it } from 'vitest'
import { instalarFechamentoAoClicarFora, type AmbienteDeFechamento } from './useDismissOnOutside'

/**
 * Bancada com um DOM de mentira: o que importa é a fiação — em que fase o
 * clique é ouvido, quem conta como "dentro" e se a limpeza solta tudo.
 */
function criarBancada() {
  type Registro = { ouvinte: (event: unknown) => void; captura: boolean }
  const ouvintes = new Map<string, Set<Registro>>()

  const registrar = (alvo: string) => (tipo: string, ouvinte: unknown, opcoes?: unknown) => {
    const chave = `${alvo}:${tipo}`
    const atual = ouvintes.get(chave) ?? new Set()
    const captura = opcoes === true || (typeof opcoes === 'object' && opcoes !== null && (opcoes as { capture?: boolean }).capture === true)
    atual.add({ ouvinte: ouvinte as (event: unknown) => void, captura })
    ouvintes.set(chave, atual)
  }
  const remover = (alvo: string) => (tipo: string, ouvinte: unknown) => {
    const atual = ouvintes.get(`${alvo}:${tipo}`)
    atual?.forEach((registro) => {
      if (registro.ouvinte === ouvinte) atual.delete(registro)
    })
  }

  const ambiente: AmbienteDeFechamento = {
    documento: { addEventListener: registrar('doc'), removeEventListener: remover('doc') } as unknown as AmbienteDeFechamento['documento'],
    janela: { addEventListener: registrar('win'), removeEventListener: remover('win') } as unknown as AmbienteDeFechamento['janela'],
  }

  const disparar = (chave: string, event: unknown) => {
    ouvintes.get(chave)?.forEach((registro) => registro.ouvinte(event))
  }
  const total = () => [...ouvintes.values()].reduce((soma, atual) => soma + atual.size, 0)

  return { ambiente, ouvintes, disparar, total }
}

const DENTRO = { nome: 'dentro' } as unknown as EventTarget
const FORA = { nome: 'fora' } as unknown as EventTarget

function instalar(bancada: ReturnType<typeof criarBancada>) {
  let fechamentos = 0
  const limpar = instalarFechamentoAoClicarFora(bancada.ambiente, {
    estaDentro: (alvo) => alvo === DENTRO,
    fechar: () => {
      fechamentos += 1
    },
  })
  return { limpar, fechamentos: () => fechamentos }
}

describe('instalarFechamentoAoClicarFora', () => {
  it('fecha ao apertar o ponteiro fora e ignora o clique dentro', () => {
    const bancada = criarBancada()
    const { fechamentos } = instalar(bancada)

    bancada.disparar('doc:pointerdown', { target: DENTRO })
    expect(fechamentos()).toBe(0)

    bancada.disparar('doc:pointerdown', { target: FORA })
    expect(fechamentos()).toBe(1)
  })

  it('ouve ponteiro e teclado na fase de captura, antes que um bloco ou outro menu engula o evento', () => {
    const bancada = criarBancada()
    instalar(bancada)

    for (const chave of ['doc:pointerdown', 'doc:keydown']) {
      const registros = [...(bancada.ouvintes.get(chave) ?? [])]
      expect(registros).toHaveLength(1)
      expect(registros[0].captura).toBe(true)
    }
  })

  it('fecha com Escape e ignora as outras teclas', () => {
    const bancada = criarBancada()
    const { fechamentos } = instalar(bancada)

    bancada.disparar('doc:keydown', { key: 'Enter' })
    expect(fechamentos()).toBe(0)

    bancada.disparar('doc:keydown', { key: 'Escape' })
    expect(fechamentos()).toBe(1)
  })

  it('fecha quando a janela perde o foco (clique numa página web ou troca de app)', () => {
    const bancada = criarBancada()
    const { fechamentos } = instalar(bancada)

    bancada.disparar('win:blur', {})
    expect(fechamentos()).toBe(1)
  })

  it('painel com formulário pode ignorar a troca de janela e continua fechando com clique fora', () => {
    const bancada = criarBancada()
    let fechamentos = 0
    const limpar = instalarFechamentoAoClicarFora(bancada.ambiente, {
      estaDentro: (alvo) => alvo === DENTRO,
      fechar: () => {
        fechamentos += 1
      },
      fecharAoSairDaJanela: false,
    })

    bancada.disparar('win:blur', {})
    expect(fechamentos).toBe(0)
    bancada.disparar('doc:pointerdown', { target: FORA })
    expect(fechamentos).toBe(1)

    limpar()
    expect(bancada.total()).toBe(0)
  })

  it('a limpeza solta todos os ouvintes', () => {
    const bancada = criarBancada()
    const { limpar, fechamentos } = instalar(bancada)
    expect(bancada.total()).toBe(3)

    limpar()
    expect(bancada.total()).toBe(0)
    bancada.disparar('doc:pointerdown', { target: FORA })
    expect(fechamentos()).toBe(0)
  })
})
