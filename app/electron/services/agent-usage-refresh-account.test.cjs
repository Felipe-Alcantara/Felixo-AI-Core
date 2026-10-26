'use strict'

/**
 * "Atualizar" de uma conta só e o isolamento de erro entre contas do painel de
 * Limites. Cada conta devolve um número que só ela tem (11, 22, 33, 44): se uma
 * leitura vazar para outra conta, o valor errado aparece. Comandos e consultas
 * são falsos; o que se prova é a decisão do serviço — quantas consultas abre, em
 * quem grava e o que descarta —, não a CLI de verdade.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const {
  COM_SQLITE,
  contaDoPainel,
  criarServico,
  loginCodexOk,
  pasta,
  perfilCodex,
  usoOk,
} = require('./agent-usage-test-fixtures.cjs')

const VALOR = { 'codex-a': 11, 'codex-b': 22, 'codex-c': 33, sistema: 44 }
const LOGIN_MAQUINA = { ok: true, stdout: 'Logged in using ChatGPT\nAccount: maquina@example.com', stderr: '' }

/** Quem a consulta é: a pasta de um perfil, ou o login do sistema (sem pasta de perfil). */
const quem = (env) => (pasta(env).startsWith('/perfis/') ? path.basename(pasta(env)) : 'sistema')

const usoDa = (id) => {
  const leitura = usoOk('rate_limits.seven_day')
  return { ...leitura, metrics: leitura.metrics.map((metrica) => ({ ...metrica, used: VALOR[id], remaining: 100 - VALOR[id] })) }
}
const valorDe = (conta) => conta.latestSample.metrics[0]?.used
const idsDeAmostra = (painel, ids) => Object.fromEntries(ids.map((id) => [id, contaDoPainel(painel, id).latestSample.id]))

function portao() {
  let liberar
  const aberto = new Promise((resolve) => {
    liberar = resolve
  })
  return { aberto, liberar }
}

async function aguardar(condicao, mensagem) {
  for (let tentativa = 0; tentativa < 400; tentativa += 1) {
    if (condicao()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.fail(mensagem)
}

/**
 * Serviço com contas de login próprio (e, se pedido, a "Conta desta máquina").
 * `falhas[id]` é a resposta de falha da consulta ao vivo daquela conta,
 * `deslogadas` são as pastas sem sessão e `espera(id)` segura a consulta.
 */
function criarMundo({ ids = ['codex-a', 'codex-b', 'codex-c'], comMaquina = false, espera = null, ...opcoes } = {}) {
  const chamadas = { login: [], consulta: [] }
  const falhas = {}
  const deslogadas = new Set()
  const mundo = criarServico({
    perfis: ids.map(perfilCodex),
    ...opcoes,
    runCommand: async ({ env }) => {
      const id = quem(env)
      chamadas.login.push(id)
      if (deslogadas.has(id)) return { ok: false, stdout: 'Not logged in', stderr: '' }
      return id === 'sistema' ? LOGIN_MAQUINA : loginCodexOk(env)
    },
    queryLiveUsage: {
      'codex-rate-limits': async ({ env }) => {
        const id = quem(env)
        chamadas.consulta.push(id)
        await espera?.(id)
        return falhas[id] ?? usoDa(id)
      },
    },
  })
  if (comMaquina) {
    mundo.repository.createAccount({ id: 'maquina', providerId: 'codex', label: 'Conta desta máquina' })
  }
  return {
    ...mundo,
    chamadas,
    falhas,
    deslogadas,
    zerar: () => {
      chamadas.login.length = 0
      chamadas.consulta.length = 0
    },
  }
}

test(
  'atualizar uma conta com login próprio abre só a consulta dela: uma em vez de uma por conta, e as outras ficam como estavam',
  COM_SQLITE,
  async () => {
    const { service, agora, chamadas, zerar, limpar } = criarMundo()

    try {
      const cheio = await service.refresh()
      // Três perfis mais a consulta do login do sistema, que a rodada completa abre por provider.
      assert.deepEqual([...chamadas.consulta].sort(), ['codex-a', 'codex-b', 'codex-c', 'sistema'])
      const antes = idsDeAmostra(cheio, ['codex-a', 'codex-b', 'codex-c'])

      zerar()
      agora.valor += 60_000
      const painel = await service.refreshAccount('codex-b')

      assert.deepEqual(chamadas.consulta, ['codex-b'], 'uma consulta ao vivo, a da conta pedida')
      assert.deepEqual([...new Set(chamadas.login)], ['codex-b'], 'e o login só da pasta dela')
      const depois = idsDeAmostra(painel, ['codex-a', 'codex-b', 'codex-c'])
      assert.notEqual(depois['codex-b'], antes['codex-b'], 'a conta pedida ganhou uma leitura nova')
      assert.equal(depois['codex-a'], antes['codex-a'], 'as outras não ganharam amostra nenhuma')
      assert.equal(depois['codex-c'], antes['codex-c'])
      assert.equal(valorDe(contaDoPainel(painel, 'codex-b')), VALOR['codex-b'])
      assert.equal(painel.refreshedAt, cheio.refreshedAt, '`refreshedAt` é a hora da última rodada completa; esta não é uma')
    } finally {
      limpar()
    }
  },
)

test(
  'na mesma rodada, a conta que falha não contamina a que responde: cada uma mostra o número que é dela e guarda o seu último valor conhecido',
  COM_SQLITE,
  async () => {
    const { service, agora, falhas, deslogadas, limpar } = criarMundo()

    try {
      const base = await service.refresh()
      const antes = idsDeAmostra(base, ['codex-a', 'codex-b', 'codex-c'])

      falhas['codex-a'] = { ok: false, message: 'Codex: getaddrinfo ENOTFOUND chatgpt.com' }
      deslogadas.add('codex-c')
      agora.valor += 60_000
      const painel = await service.refresh()
      const [a, b, c] = ['codex-a', 'codex-b', 'codex-c'].map((id) => contaDoPainel(painel, id))

      assert.equal(a.latestSample.status, 'error')
      assert.equal(a.availability.state, 'network-disabled')
      assert.equal(a.lastKnownSample.id, antes['codex-a'])
      assert.equal(valorDe({ latestSample: a.lastKnownSample }), VALOR['codex-a'], 'o último valor conhecido da A é da A')

      assert.equal(b.latestSample.status, 'current', 'a conta que respondeu não herda o erro das vizinhas')
      assert.equal(valorDe(b), VALOR['codex-b'])
      assert.notEqual(b.latestSample.id, antes['codex-b'])

      assert.equal(c.latestSample.status, 'unavailable')
      assert.equal(c.availability.state, 'auth-required')
      assert.deepEqual(c.latestSample.metrics, [], 'a deslogada não ganha número de ninguém')
      assert.equal(valorDe({ latestSample: c.lastKnownSample }), VALOR['codex-c'])
      assert.equal(painel.accounts.length, 3, 'o erro de uma não tira as outras do painel')
    } finally {
      limpar()
    }
  },
)

test(
  'atualizar só a conta que estava com erro corrige a dela e não mexe nas vizinhas, nem nas que continuam com erro',
  COM_SQLITE,
  async () => {
    const { service, agora, falhas, deslogadas, limpar } = criarMundo()

    try {
      await service.refresh()
      falhas['codex-a'] = { ok: false, message: 'Codex: getaddrinfo ENOTFOUND chatgpt.com' }
      deslogadas.add('codex-c')
      agora.valor += 60_000
      const comErros = await service.refresh()
      const antes = idsDeAmostra(comErros, ['codex-a', 'codex-b', 'codex-c'])

      delete falhas['codex-a']
      agora.valor += 60_000
      const painel = await service.refreshAccount('codex-a')
      const [a, b, c] = ['codex-a', 'codex-b', 'codex-c'].map((id) => contaDoPainel(painel, id))

      assert.equal(a.latestSample.status, 'current')
      assert.equal(valorDe(a), VALOR['codex-a'])
      assert.equal(a.availability.state, 'available')
      assert.equal(b.latestSample.id, antes['codex-b'], 'a vizinha boa continua com a leitura que tinha')
      assert.equal(c.latestSample.id, antes['codex-c'], 'a deslogada continua deslogada: ninguém tentou entrar por ela')
      assert.equal(c.availability.state, 'auth-required')
    } finally {
      limpar()
    }
  },
)

test(
  'a conta desta máquina atualiza pela consulta do login do sistema, que é uma só, e os perfis ficam como estavam',
  COM_SQLITE,
  async () => {
    const { service, agora, chamadas, zerar, limpar } = criarMundo({ comMaquina: true })

    try {
      const cheio = await service.refresh()
      const antes = idsDeAmostra(cheio, ['codex-a', 'codex-b', 'codex-c', 'maquina'])

      zerar()
      agora.valor += 60_000
      const painel = await service.refreshAccount('maquina')

      assert.deepEqual(chamadas.consulta, ['sistema'], 'nenhum perfil é consultado')
      const depois = idsDeAmostra(painel, ['codex-a', 'codex-b', 'codex-c', 'maquina'])
      assert.notEqual(depois.maquina, antes.maquina)
      assert.equal(valorDe(contaDoPainel(painel, 'maquina')), VALOR.sistema)
      for (const id of ['codex-a', 'codex-b', 'codex-c']) {
        assert.equal(depois[id], antes[id], id)
      }
    } finally {
      limpar()
    }
  },
)

test(
  'conta cadastrada à mão: o clique lê a sessão da máquina, e se ela é de outra conta a cadastrada diz isso em vez de ganhar número',
  COM_SQLITE,
  async () => {
    const { service, agora, chamadas, zerar, limpar } = criarMundo({ ids: [], comMaquina: true })

    try {
      const { account: manual } = await service.addAccount({ providerId: 'codex', label: 'Manual', identityHint: 'outra@example.com' })
      await service.refresh()

      zerar()
      agora.valor += 60_000
      const painel = await service.refreshAccount(manual.id)

      assert.deepEqual(chamadas.consulta, ['sistema'])
      const cadastrada = contaDoPainel(painel, manual.id)
      assert.equal(cadastrada.latestSample.status, 'error')
      assert.deepEqual(cadastrada.latestSample.metrics, [], 'a sessão é de outra conta: nenhum número é copiado')
      assert.match(cadastrada.latestSample.errorMessage, /outra conta/)
      assert.equal(valorDe(contaDoPainel(painel, 'maquina')), VALOR.sistema, 'o número vai para a conta a que a sessão pertence')
    } finally {
      limpar()
    }
  },
)

test(
  'dois cliques na mesma conta são uma consulta só',
  COM_SQLITE,
  async () => {
    const segura = portao()
    const { service, chamadas, limpar } = criarMundo({ espera: () => segura.aberto })

    try {
      await service.list()
      const cliques = [service.refreshAccount('codex-a'), service.refreshAccount('codex-a')]
      await aguardar(() => chamadas.consulta.length >= 1, 'a consulta da conta nunca começou')

      segura.liberar()
      await Promise.all(cliques)

      assert.deepEqual(chamadas.consulta, ['codex-a'], 'o segundo clique não abriu outra consulta')

      await service.refreshAccount('codex-a')
      assert.deepEqual(chamadas.consulta, ['codex-a', 'codex-a'], 'depois que a consulta termina, um novo clique abre outra')
    } finally {
      limpar()
    }
  },
)

test(
  'duas contas do login do sistema dividem a consulta do provider: clicar nas duas é uma consulta só',
  COM_SQLITE,
  async () => {
    const segura = portao()
    const { service, chamadas, limpar } = criarMundo({ ids: [], comMaquina: true, espera: () => segura.aberto })

    try {
      await service.list()
      const { account: outra } = await service.addAccount({ providerId: 'codex', label: 'Outra', identityHint: 'x@example.com' })
      const cliques = [service.refreshAccount('maquina'), service.refreshAccount(outra.id)]
      await aguardar(() => chamadas.consulta.length >= 1, 'a consulta do sistema nunca começou')

      segura.liberar()
      await Promise.all(cliques)

      assert.deepEqual(chamadas.consulta, ['sistema'])
    } finally {
      limpar()
    }
  },
)

test(
  'com a rodada completa em andamento, o clique numa conta espera por ela em vez de abrir outra consulta',
  COM_SQLITE,
  async () => {
    const segura = portao()
    const { service, chamadas, limpar } = criarMundo({ espera: () => segura.aberto })

    try {
      await service.list()
      const cheia = service.refresh()
      const individual = service.refreshAccount('codex-a')
      await aguardar(() => chamadas.consulta.length >= 4, 'a rodada completa nunca abriu as consultas (3 perfis e o login do sistema)')

      segura.liberar()
      await Promise.all([cheia, individual])

      assert.equal(chamadas.consulta.length, 4, 'a rodada completa já lia a conta: nenhuma consulta a mais')
    } finally {
      limpar()
    }
  },
)

test(
  'o Reconectar descarta a atualização de uma conta só que estava travada, e ela não grava por cima da rodada nova',
  COM_SQLITE,
  async () => {
    let primeira = true
    const { service, repository, chamadas, limpar } = criarMundo({
      refreshDeadlineMs: 3000,
      espera: async (id) => {
        if (id === 'codex-a' && primeira) {
          primeira = false
          await new Promise(() => {})
        }
      },
    })

    try {
      await service.list()
      const travada = service.refreshAccount('codex-a')
      await aguardar(() => chamadas.consulta.length >= 1, 'a consulta da conta nunca começou')

      const inicio = Date.now()
      const painel = await service.reconnect()
      await travada
      const esperou = Date.now() - inicio

      assert.ok(esperou < 1500, `a atualização travada saiu junto com o Reconectar (${esperou} ms), não no teto de 3000 ms`)
      const conta = contaDoPainel(painel, 'codex-a')
      assert.equal(conta.latestSample.status, 'current')
      assert.equal(valorDe(conta), VALOR['codex-a'])
      assert.equal(repository.listSamples('codex-a').length, 1, 'só a rodada do Reconectar gravou: a travada foi descartada')
      assert.equal(contaDoPainel(await service.list(), 'codex-a').latestSample.status, 'current', 'e a leitura boa continua sendo a última')
    } finally {
      limpar()
    }
  },
)

test(
  'a atualização de uma conta que nunca responde respeita o teto de tempo: só ela vira "timeout", as outras ficam como estavam',
  COM_SQLITE,
  async () => {
    const travar = { codexB: false }
    const { service, limpar } = criarMundo({
      refreshDeadlineMs: 150,
      espera: (id) => (travar.codexB && id === 'codex-b' ? new Promise(() => {}) : undefined),
    })

    try {
      const base = await service.refresh()
      const antes = idsDeAmostra(base, ['codex-a', 'codex-b', 'codex-c'])

      travar.codexB = true
      const inicio = Date.now()
      const painel = await service.refreshAccount('codex-b')

      assert.ok(Date.now() - inicio < 2000, 'o botão é solto no teto, não fica preso')
      const b = contaDoPainel(painel, 'codex-b')
      assert.equal(b.latestSample.status, 'error')
      assert.equal(b.availability.state, 'timeout')
      assert.equal(contaDoPainel(painel, 'codex-a').latestSample.id, antes['codex-a'])
      assert.equal(contaDoPainel(painel, 'codex-c').latestSample.id, antes['codex-c'])
    } finally {
      limpar()
    }
  },
)

test(
  'atualizar uma conta deslogada mostra a sessão ausente dela, sem erro, e sem abrir a consulta ao vivo',
  COM_SQLITE,
  async () => {
    const { service, deslogadas, chamadas, zerar, limpar } = criarMundo({ ids: ['codex-a', 'codex-c'] })

    try {
      await service.refresh()
      deslogadas.add('codex-c')
      zerar()

      const c = contaDoPainel(await service.refreshAccount('codex-c'), 'codex-c')

      assert.equal(c.latestSample.status, 'unavailable')
      assert.equal(c.availability.state, 'auth-required')
      assert.deepEqual(chamadas.consulta, [], 'sem sessão a consulta ao vivo nem abre')
    } finally {
      limpar()
    }
  },
)

test(
  'identificador inválido ou de conta que não existe (ou já foi removida) é recusado, sem consultar nada',
  COM_SQLITE,
  async () => {
    const { service, chamadas, limpar } = criarMundo()

    try {
      await service.list()
      await assert.rejects(service.refreshAccount(''), /ID da conta de agente inválido/)
      await assert.rejects(service.refreshAccount(42), /ID da conta de agente inválido/)
      await assert.rejects(service.refreshAccount('nao-existe'), /Conta de agente não encontrada/)

      // Conta cadastrada à mão: remover uma de perfil derruba o list() (ver a task do UNIQUE no registro).
      const { account } = await service.addAccount({ providerId: 'codex', label: 'Temporária' })
      await service.removeAccount(account.id)
      await assert.rejects(service.refreshAccount(account.id), /Conta de agente não encontrada/)
      assert.deepEqual(chamadas.consulta, [])
    } finally {
      limpar()
    }
  },
)
