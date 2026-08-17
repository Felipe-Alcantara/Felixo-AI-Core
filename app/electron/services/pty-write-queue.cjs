'use strict'

/**
 * Entrega de texto grande a uma PTY, sem perder pedaço no caminho.
 *
 * Uma escrita unica e grande em `ptyProcess.write()` nao e segura: no Windows a
 * PTY e o ConPTY, cujo buffer de entrada e bem menos tolerante que o pty de
 * Linux/macOS. O comeco do texto entra, o resto e descartado **em silencio** —
 * `write()` nao devolve quanto foi aceito, entao nada no caminho percebe. Foi
 * exatamente o sintoma relatado: o prompt inicial de contexto chegando cortado
 * no Claude Code, so no Windows, depois que esse prompt cresceu.
 *
 * Aqui o texto grande e fatiado e entregue com intervalo entre os pedacos. Duas
 * garantias importam tanto quanto o fatiamento:
 *
 * - **Ordem por sessao.** Uma fila FIFO por sessao. O prompt inicial e escrito
 *   e, logo depois, o Enter — se o Enter ultrapassasse a fila do texto, ele
 *   submeteria um prompt pela metade, que e um jeito pior de falhar do que nao
 *   entregar nada.
 * - **Nao quebrar caractere.** O corte respeita pontos de codigo: cortar no meio
 *   de um par surrogate (emoji) ou de um acento corromperia o texto justamente
 *   nos prompts, que sao cheios dos dois.
 *
 * Digitacao normal nao passa por fatiamento: so o que excede o limite e tratado
 * como carga grande, entao a latencia de tecla continua a mesma.
 */

/**
 * Tamanho de cada pedaco, em pontos de codigo.
 *
 * Bem abaixo do buffer de pipe do ConPTY (na ordem de alguns KB) para deixar
 * folga ao consumo do outro lado, e grande o bastante para um prompt de ~10 mil
 * caracteres sair em poucas dezenas de pedacos.
 */
const TAMANHO_DO_BLOCO = 512

/** Pausa entre pedacos, dando ao processo do outro lado tempo de drenar. */
const PAUSA_ENTRE_BLOCOS_MS = 12

/**
 * A partir de quantos caracteres a escrita e tratada como carga grande.
 *
 * Tecla solta, sequencia de setas e colagem curta passam direto, sem fila nem
 * atraso. O valor e folgado de proposito: o problema so aparece em texto de
 * milhares de caracteres, e adiar o que funciona seria custo sem ganho.
 */
const LIMITE_DE_ESCRITA_DIRETA = 1024

/**
 * Divide o texto em pedacos sem partir um caractere ao meio.
 *
 * Usa iteracao por ponto de codigo: `String.prototype.slice` corta por unidade
 * UTF-16 e parte pares surrogate, o que transformaria um emoji em dois
 * caracteres invalidos — e o prompt inicial do canvas tem emoji e acento.
 *
 * @param {string} texto
 * @param {number} [tamanho] - Pontos de codigo por pedaco.
 * @returns {string[]} Pedacos na ordem, ou lista vazia para texto vazio.
 */
function dividirEmBlocos(texto, tamanho = TAMANHO_DO_BLOCO) {
  const conteudo = String(texto ?? '')
  if (!conteudo) {
    return []
  }
  const limite = Math.max(1, Number(tamanho) || TAMANHO_DO_BLOCO)

  const blocos = []
  let atual = ''
  let contador = 0
  for (const caractere of conteudo) {
    atual += caractere
    contador += 1
    if (contador >= limite) {
      blocos.push(atual)
      atual = ''
      contador = 0
    }
  }
  if (atual) {
    blocos.push(atual)
  }
  return blocos
}

/** Se a carga e grande o bastante para justificar fila e fatiamento. */
function precisaFatiar(texto, limite = LIMITE_DE_ESCRITA_DIRETA) {
  return String(texto ?? '').length > limite
}

/**
 * Cria a fila de escrita de uma sessao.
 *
 * @param {object} opcoes
 * @param {(dados: string) => void} opcoes.escrever - Escreve na PTY de fato.
 * @param {() => boolean} [opcoes.ativa] - Se a sessao ainda aceita escrita.
 * @param {(ms: number) => Promise<void>} [opcoes.esperar] - Injetavel em teste.
 * @param {number} [opcoes.tamanhoDoBloco]
 * @param {number} [opcoes.pausaMs]
 * @param {number} [opcoes.limiteDeEscritaDireta]
 */
function criarFilaDeEscrita(opcoes) {
  const {
    escrever,
    ativa = () => true,
    esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    tamanhoDoBloco = TAMANHO_DO_BLOCO,
    pausaMs = PAUSA_ENTRE_BLOCOS_MS,
    limiteDeEscritaDireta = LIMITE_DE_ESCRITA_DIRETA,
  } = opcoes

  /** @type {string[]} */
  const pendentes = []
  let drenando = false
  let descartada = false
  /** @type {Array<() => void>} */
  let aguardando = []

  function avisarQueDrenou() {
    const inscritos = aguardando
    aguardando = []
    for (const resolver of inscritos) {
      resolver()
    }
  }

  async function drenar() {
    if (drenando) {
      return
    }
    drenando = true
    try {
      while (pendentes.length > 0) {
        if (descartada || !ativa()) {
          // Sessao morreu no meio: descarta o que sobrou em vez de escrever
          // num processo que nao existe mais.
          pendentes.length = 0
          return
        }
        const carga = pendentes.shift()
        const blocos = dividirEmBlocos(carga, tamanhoDoBloco)
        for (let indice = 0; indice < blocos.length; indice += 1) {
          if (descartada || !ativa()) {
            pendentes.length = 0
            return
          }
          escrever(blocos[indice])
          if (indice < blocos.length - 1) {
            await esperar(pausaMs)
          }
        }
      }
    } finally {
      drenando = false
      avisarQueDrenou()
    }
  }

  return {
    /**
     * Enfileira (ou escreve direto) uma carga.
     *
     * Carga pequena com a fila vazia vai direto, sem custo — o caminho da
     * digitacao. Com algo na fila, ate a tecla e enfileirada: passar na frente
     * de um texto que ainda esta saindo bagunçaria a ordem do que a CLI le.
     *
     * @param {string} dados
     * @returns {boolean} Se a carga foi aceita.
     */
    enfileirar(dados) {
      const carga = String(dados ?? '')
      if (!carga || descartada) {
        return false
      }
      const ocupada = drenando || pendentes.length > 0
      if (!ocupada && !precisaFatiar(carga, limiteDeEscritaDireta)) {
        escrever(carga)
        return true
      }
      pendentes.push(carga)
      void drenar()
      return true
    },

    /**
     * Resolve quando tudo que foi enfileirado ja saiu.
     *
     * Existe porque quem escreve precisa saber **quando a entrega terminou**, e
     * nao apenas que foi aceita. Sem isso, o verificador do lado do renderer
     * conta 2 segundos, ve a linha de entrada ainda vazia porque a carga esta
     * no meio do caminho, e **reescreve o texto inteiro** — um handoff de 160
     * mil caracteres leva alguns segundos para drenar e seria duplicado.
     */
    aguardar() {
      if (!drenando && pendentes.length === 0) {
        return Promise.resolve()
      }
      return new Promise((resolve) => aguardando.push(resolve))
    },

    /** Descarta o que ainda nao foi escrito (sessao encerrada). */
    descartar() {
      descartada = true
      pendentes.length = 0
      avisarQueDrenou()
    },

    /** Quantas cargas ainda esperam — usado em teste e diagnostico. */
    get pendentes() {
      return pendentes.length
    },
  }
}

module.exports = {
  LIMITE_DE_ESCRITA_DIRETA,
  PAUSA_ENTRE_BLOCOS_MS,
  TAMANHO_DO_BLOCO,
  criarFilaDeEscrita,
  dividirEmBlocos,
  precisaFatiar,
}
