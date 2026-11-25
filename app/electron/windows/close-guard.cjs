/**
 * @module close-guard
 * Pergunta antes de fechar a janela quando há agente rodando.
 *
 * Tirar o ⌘+W do menu resolve o acidente mais comum, mas não o único: o botão
 * de fechar da janela, o ⌘+Q e um atalho do sistema continuam existindo. Esta
 * guarda é a segunda camada — e é a que protege o que realmente se perde.
 *
 * O que se perde não é "uma aba": os terminais com agente morrem junto com a
 * janela. No app empacotado, o macOS mantém o processo no Dock por convenção;
 * no modo de desenvolvimento, o ciclo de execução encerra Electron e Vite
 * junto para não deixar a porta órfã.
 *
 * O incômodo relatado nunca foi "o app fecha". Foi "o app fecha SEM PERGUNTAR".
 * Por isso aqui não se impede o fechamento — se confirma.
 */

/**
 * O fechamento pode seguir direto?
 *
 * Função pura, separada do efeito de propósito: a decisão é o que precisa ser
 * verificável sem Electron, diálogo ou janela de verdade.
 *
 * @param {object} params
 * @param {number} params.sessoesVivas
 * @param {boolean} [params.jaConfirmado] - A pessoa já disse que quer fechar.
 * @returns {'fechar' | 'perguntar'}
 */
function decidirFechamento({ sessoesVivas, jaConfirmado = false }) {
  if (jaConfirmado) {
    return 'fechar'
  }

  return Number(sessoesVivas) > 0 ? 'perguntar' : 'fechar'
}

/**
 * Texto da pergunta.
 *
 * Diz QUANTOS agentes serão encerrados. "Tem certeza?" sem número é a pergunta
 * que a pessoa clica no automático; com número ela para e lê.
 *
 * @param {number} sessoesVivas
 * @returns {{ titulo: string, mensagem: string, detalhe: string, botoes: string[] }}
 */
function montarPergunta(sessoesVivas, { comBandeja = false } = {}) {
  const plural = sessoesVivas === 1 ? '1 terminal ativo' : `${sessoesVivas} terminais ativos`

  return {
    ...(comBandeja
      ? {
          titulo: 'Sair do Felixo AI Core?',
          mensagem: `Você tem ${plural}.`,
          detalhe:
            'Sair encerra os agentes em execução e o trabalho em andamento neles se perde. Para mantê-los rodando, feche só a janela: o app fica na bandeja.',
          botoes: ['Cancelar', 'Sair e encerrar os agentes'],
        }
      : {
          titulo: 'Fechar o Felixo AI Core?',
          mensagem: `Você tem ${plural}.`,
          detalhe:
            'Fechar a janela encerra os agentes em execução e o trabalho em andamento neles se perde.',
          botoes: ['Cancelar', 'Fechar mesmo assim'],
        }),
  }
}

const INDICE_CANCELAR = 0
const INDICE_FECHAR = 1

/**
 * Liga a guarda numa janela.
 *
 * @param {import('electron').BrowserWindow} browserWindow
 * @param {object} deps
 * @param {() => number} deps.contarSessoesVivas
 * @param {(pergunta: object) => Promise<number>} deps.perguntar - Devolve o índice do botão.
 * @param {(evento: { preventDefault: () => void }) => boolean} [deps.interceptar] - Roda antes de tudo; se
 *   devolver true, o fechamento já foi tratado (a bandeja escondeu a janela) e a guarda não pergunta.
 * @param {() => void} [deps.aoCancelar] - A pessoa escolheu Cancelar.
 * @param {boolean} [deps.comBandeja] - A bandeja está ligada: o texto fala em Sair, não em fechar a janela.
 * @returns {() => void} Desliga a guarda.
 */
function registrarGuardaDeFechamento(browserWindow, { contarSessoesVivas, perguntar, interceptar, aoCancelar, comBandeja = false }) {
  // Uma vez confirmado, o segundo `close()` precisa passar reto — senão a
  // guarda pergunta de novo sobre a resposta que a pessoa acabou de dar.
  let confirmado = false
  let perguntando = false

  const aoFechar = (evento) => {
    // A bandeja trata o X antes: esconde a janela e os agentes seguem, sem perguntar.
    if (interceptar?.(evento)) {
      return
    }

    const sessoesVivas = Number(contarSessoesVivas?.() ?? 0)

    if (decidirFechamento({ sessoesVivas, jaConfirmado: confirmado }) === 'fechar') {
      return
    }

    evento.preventDefault()

    // Fechar repetido enquanto o diálogo está aberto não deve empilhar diálogos.
    if (perguntando) {
      return
    }

    perguntando = true

    Promise.resolve(perguntar(montarPergunta(sessoesVivas, { comBandeja })))
      .then((escolha) => {
        if (escolha === INDICE_FECHAR) {
          confirmado = true
          browserWindow.close()
        } else {
          aoCancelar?.()
        }
      })
      .catch(() => {
        // Diálogo falhou: não fechar. Perder trabalho por causa de um erro de
        // interface seria o pior desfecho possível aqui.
      })
      .finally(() => {
        perguntando = false
      })
  }

  browserWindow.on('close', aoFechar)

  return () => browserWindow.removeListener('close', aoFechar)
}

module.exports = {
  INDICE_CANCELAR,
  INDICE_FECHAR,
  decidirFechamento,
  montarPergunta,
  registrarGuardaDeFechamento,
}
