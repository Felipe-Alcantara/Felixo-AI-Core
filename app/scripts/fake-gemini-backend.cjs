'use strict'

/**
 * Servidor falso da API do Gemini, para gravar a tela do Gemini CLI sem conta
 * (`record-terminal-fixture.cjs --synthetic`). O Google recusa a conta pessoal
 * no Gemini CLI, então a gravação real não existe: a CLI de verdade roda com
 * uma chave falsa apontada para este servidor, e quem desenha a tela é ela. O
 * que muda em relação a uma conta real é só o texto da resposta do modelo, por
 * isso toda fixture gravada assim sai marcada como sintética.
 *
 * Resposta de acordo com o pedido (o texto que a CLI manda ao modelo):
 * - modelo `modelo-que-nao-existe` na URL: 404 "model not found" da API;
 * - pedido de "curiosidades": lista numerada longa, devagar, para dar tempo de cancelar;
 * - qualquer outro: a resposta com todos os blocos de Markdown que a Leitura reconhece.
 */

const http = require('node:http')

/** A resposta com um exemplar de cada bloco que a Leitura precisa reconhecer. */
const MARKDOWN_ANSWER = [
  '## Resumo',
  '',
  'Este texto tem uma palavra em **negrito** e outra em *itálico*, só para a gravação.',
  '',
  '- primeiro item',
  '- segundo item',
  '- terceiro item',
  '',
  '1. passo um',
  '2. passo dois',
  '',
  '```python',
  'def soma(a, b):',
  '    return a + b',
  '```',
  '',
  '| Nome | Valor |',
  '| --- | --- |',
  '| alfa | 1 |',
  '| beta | 2 |',
  '',
  '> Uma citação curta.',
  '',
  'Veja a [documentação](https://example.com/docs).',
  '',
].join('\n')

const LONG_ANSWER = `${Array.from({ length: 40 }, (_, index) => `${index + 1}. Curiosidade número ${index + 1} sobre terminais de computador.`).join('\n')}\n`

const MISSING_MODEL = 'modelo-que-nao-existe'

/** Um pedaço da resposta no formato do `streamGenerateContent?alt=sse`. */
function sseChunk(text, last) {
  return `data: ${JSON.stringify({
    candidates: [{ content: { role: 'model', parts: [{ text }] }, ...(last ? { finishReason: 'STOP' } : {}), index: 0 }],
    ...(last ? { usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 40, totalTokenCount: 52 } } : {}),
  })}\r\n\r\n`
}

/** O texto em pedaços de uma linha, que é como o modelo "digita" na tela. */
function linesOf(text) {
  return text.split(/(?<=\n)/)
}

function startFakeGemini() {
  const requests = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (data) => { body += data })
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url })
      if (req.method !== 'POST') {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end('{}')
        return
      }
      if (req.url.includes(`/${MISSING_MODEL}:`) || req.url.includes(`/models/${MISSING_MODEL}`)) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          error: {
            code: 404,
            status: 'NOT_FOUND',
            message: `models/${MISSING_MODEL} is not found for API version v1beta, or is not supported for generateContent. Call ListModels to see the list of available models and their supported methods.`,
          },
        }))
        return
      }
      if (/:streamGenerateContent/.test(req.url)) {
        const long = /curiosidades/i.test(body)
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        const parts = linesOf(long ? LONG_ANSWER : MARKDOWN_ANSWER)
        let index = 0
        const timer = setInterval(() => {
          if (res.destroyed || res.writableEnded) {
            clearInterval(timer)
            return
          }
          const last = index === parts.length - 1
          res.write(sseChunk(parts[index], last))
          index += 1
          if (last) {
            clearInterval(timer)
            res.end()
          }
        }, long ? 600 : 120)
        res.on('close', () => clearInterval(timer))
        return
      }
      if (/:generateContent/.test(req.url)) {
        // As chamadas de apoio da CLI (título da conversa, próximo a falar): uma resposta curta basta.
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          candidates: [{ content: { role: 'model', parts: [{ text: '{"next_speaker":"user","reasoning":"gravação"}' }] }, finishReason: 'STOP', index: 0 }],
          usageMetadata: { totalTokenCount: 3 },
        }))
        return
      }
      if (/:countTokens/.test(req.url)) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ totalTokens: 5 }))
        return
      }
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end('{}')
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      // Uma gravação que falha não deixa o processo preso por causa do servidor.
      server.unref()
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        requests,
        close: () => new Promise((done) => { server.closeAllConnections?.(); server.close(() => done()) }),
      })
    })
  })
}

module.exports = { LONG_ANSWER, MARKDOWN_ANSWER, MISSING_MODEL, startFakeGemini }
