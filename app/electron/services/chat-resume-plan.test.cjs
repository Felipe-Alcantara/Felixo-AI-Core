require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)
const test = require('node:test')
const assert = require('node:assert/strict')
const { checkChatThreadResume } = require('./chat-resume-plan.cjs')

const started = (origin) => ({ providerSessionId: 'sessao-1234', hasStarted: true, origin })

test('primeiro pedido da thread só registra pasta e conta', () => {
  const session = { providerSessionId: null, hasStarted: false }
  assert.equal(checkChatThreadResume(session, { cwd: 'C:/a', accountId: null }), null)
  assert.deepEqual(session.origin, { cwd: 'C:/a', accountId: null })
})

test('mesma pasta e mesma conta: a conversa segue', () => {
  const session = started({ cwd: 'C:/a', accountId: 'conta-1' })
  assert.equal(checkChatThreadResume(session, { cwd: 'C:/a', accountId: 'conta-1' }), null)
  assert.equal(session.providerSessionId, 'sessao-1234')
  assert.equal(session.hasStarted, true)
})

test('outra conta: zera a sessão e explica, sem o ID', () => {
  const session = started({ cwd: 'C:/a', accountId: null })
  const resume = checkChatThreadResume(session, { cwd: 'C:/a', accountId: 'conta-2' })
  assert.deepEqual(resume, { reasons: ['account-mismatch'], previousCwd: 'C:/a' })
  assert.equal(session.providerSessionId, null)
  assert.equal(session.hasStarted, false)
  assert.deepEqual(session.origin, { cwd: 'C:/a', accountId: 'conta-2' })
  assert.equal(JSON.stringify(resume).includes('sessao-1234'), false)
})

test('outra pasta e outra conta: os dois motivos, pasta primeiro', () => {
  const session = started({ cwd: 'C:/a', accountId: 'conta-1' })
  const resume = checkChatThreadResume(session, { cwd: 'C:/b', accountId: null })
  assert.deepEqual(resume.reasons, ['cwd-mismatch', 'account-mismatch'])
  // O pedido seguinte, já na pasta e conta novas, volta a retomar.
  session.providerSessionId = 'sessao-nova-5678'
  session.hasStarted = true
  assert.equal(checkChatThreadResume(session, { cwd: 'C:/b', accountId: null }), null)
  assert.equal(session.providerSessionId, 'sessao-nova-5678')
})

test('thread que nunca iniciou muda de pasta ou conta sem aviso', () => {
  const session = { providerSessionId: null, hasStarted: false, origin: { cwd: 'C:/a', accountId: null } }
  assert.equal(checkChatThreadResume(session, { cwd: 'C:/b', accountId: 'x' }), null)
  assert.deepEqual(session.origin, { cwd: 'C:/b', accountId: 'x' })
})
