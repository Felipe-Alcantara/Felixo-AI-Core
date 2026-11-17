'use strict'

/**
 * @module devtools-main-eval
 * `felixo devtools main "<expr>"`: avalia JavaScript no processo principal,
 * só na instância de automação (porta de depuração válida, perfil isolado).
 * O app normal nunca registra o canal `devtools:main-eval`.
 *
 * O `vm` do Node não é fronteira de segurança: qualquer objeto do host dentro
 * do contexto entrega o `Function` do host por `x.constructor.constructor`.
 * Por isso cada objeto do host entra por uma membrana: um Proxy que nega
 * `constructor`, `__proto__` e `prototype`, devolve `null` como protótipo e
 * embrulha, na ida e na volta, tudo o que atravessa (retornos, erros,
 * argumentos de callbacks). O contexto continua sem `require`/`process` como
 * globais. O uso legítimo (`app`, `mainWindow`, `ipcProbe.snapshot()`,
 * registrar handlers IPC com callbacks) segue funcionando.
 *
 * Limite honesto: a membrana fecha o caminho pelos construtores, mas a
 * expressão ainda comanda `app` e `mainWindow` (fechar janelas, executar
 * JS no renderer, trocar handlers IPC). Quem chega aqui já controla a
 * instância de devtools; não trate isto como sandbox para código não confiável.
 *
 * shortcut: a membrana cobre os caminhos conhecidos (testados), não prova
 * ausência de escape; troque por lista fechada de comandos se o eval sair da automação.
 */

const BLOCKED_KEYS = new Set(['constructor', '__proto__', 'prototype'])

function isObjectLike(value) {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}

function createMembrane() {
  const targetByProxy = new WeakMap()
  const proxyByTarget = new WeakMap()

  const unwrap = (value) => (isObjectLike(value) && targetByProxy.has(value) ? targetByProxy.get(value) : value)

  // Função do contexto (ou do host) passada ao host: o host a chama com valores crus.
  const wrapCallback = (fn) =>
    typeof fn === 'function' && !targetByProxy.has(fn)
      ? function callback(...args) {
          return fn.apply(wrap(this), args.map(wrap))
        }
      : unwrap(fn)

  const unwrapArg = (value) => (typeof value === 'function' ? wrapCallback(value) : unwrap(value))

  function wrap(value) {
    if (!isObjectLike(value)) return value
    if (targetByProxy.has(value)) return value
    const cached = proxyByTarget.get(value)
    if (cached) return cached
    // Proxy sobre uma casca vazia: as invariantes do Proxy valem para a casca,
    // então objetos congelados do host também podem ser embrulhados.
    const shadow = typeof value === 'function' ? () => {} : Array.isArray(value) ? [] : {}
    const handler = {
      get(_shadow, key) {
        if (BLOCKED_KEYS.has(key)) return undefined
        try {
          return wrap(Reflect.get(value, key, value))
        } catch (error) {
          throw wrap(error)
        }
      },
      set(_shadow, key, next) {
        if (BLOCKED_KEYS.has(key)) return false
        return Reflect.set(value, key, unwrapArg(next), value)
      },
      has: (_shadow, key) => !BLOCKED_KEYS.has(key) && Reflect.has(value, key),
      getPrototypeOf: () => null,
      setPrototypeOf: () => false,
      defineProperty: () => false,
      deleteProperty: (_shadow, key) => !BLOCKED_KEYS.has(key) && Reflect.deleteProperty(value, key),
      ownKeys: () => Reflect.ownKeys(value).filter((key) => !BLOCKED_KEYS.has(key)),
      getOwnPropertyDescriptor(_shadow, key) {
        if (BLOCKED_KEYS.has(key)) return undefined
        const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
        if (!descriptor) return undefined
        // `length` do array é a única propriedade não configurável da casca.
        const keepsLength = key === 'length' && Array.isArray(shadow)
        return {
          value: wrap(Reflect.get(value, key, value)),
          writable: true,
          enumerable: descriptor.enumerable,
          configurable: !keepsLength,
        }
      },
      apply(_shadow, thisArg, args) {
        try {
          return wrap(Reflect.apply(value, unwrap(thisArg), args.map(unwrapArg)))
        } catch (error) {
          throw wrap(error)
        }
      },
    }
    const proxy = new Proxy(shadow, handler)
    targetByProxy.set(proxy, value)
    proxyByTarget.set(value, proxy)
    return proxy
  }

  return { wrap, unwrap }
}

/**
 * @param {{ vm: typeof import('node:vm'), getScope: () => Record<string, unknown>, timeout?: number }} options
 * @returns {(expression: unknown) => unknown}
 */
function createMainEvaluator({ vm, getScope, timeout = 1_000 }) {
  const membrane = createMembrane()
  return (expression) => {
    if (typeof expression !== 'string' || expression.length > 20_000) {
      throw new Error('Expressão DevTools inválida.')
    }
    const context = {}
    for (const [name, value] of Object.entries(getScope())) context[name] = membrane.wrap(value)
    const result = membrane.unwrap(vm.runInNewContext(expression, context, { timeout }))
    // O resultado volta por IPC (clone estruturado): nada de Proxy no retorno.
    return result && typeof result.then === 'function'
      ? Promise.resolve(result).then(membrane.unwrap)
      : result
  }
}

/**
 * Registra `devtools:main-eval` só na instância de automação.
 * @returns {boolean} se o canal foi registrado
 */
function registerDevtoolsMainEval({ ipcMain, devtoolsPort, vm, getScope }) {
  if (!Number.isInteger(devtoolsPort) || devtoolsPort <= 0) return false
  const evaluate = createMainEvaluator({ vm, getScope })
  ipcMain.handle('devtools:main-eval', (_event, expression) => evaluate(expression))
  return true
}

module.exports = { createMainEvaluator, registerDevtoolsMainEval }
