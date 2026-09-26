const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { getAdapter } = require('./index.cjs')

// O PTY usa estes três métodos dos adaptadores reais para montar o shell de
// cada sessão (ver pty-process-manager.cjs). Os testes do PTY trocam o
// adaptador por dublês, então as regras de cada SO ficam cobertas aqui.
describe('adaptadores de plataforma: shell do PTY', () => {
  describe('getDefaultShell()', () => {
    it('no Linux usa $SHELL e cai para /bin/bash sem ele', () => {
      const linux = getAdapter('linux')
      assert.equal(linux.getDefaultShell({ SHELL: '/bin/zsh' }), '/bin/zsh')
      assert.equal(linux.getDefaultShell({}), '/bin/bash')
    })

    it('no macOS usa $SHELL e cai para /bin/zsh sem ele', () => {
      const darwin = getAdapter('darwin')
      assert.equal(darwin.getDefaultShell({ SHELL: '/bin/bash' }), '/bin/bash')
      assert.equal(darwin.getDefaultShell({}), '/bin/zsh')
    })

    it('no Windows cai para cmd.exe quando não há PowerShell', () => {
      assert.equal(getAdapter('win32').getDefaultShell({}, () => false), 'cmd.exe')
    })

    it('SO desconhecido usa as regras POSIX do adaptador base', () => {
      const fallback = getAdapter('freebsd')
      assert.equal(fallback.name, 'linux')
      assert.equal(fallback.getDefaultShell({}), '/bin/bash')
    })
  })

  describe('getShellArgs()', () => {
    it('no POSIX roda o comando com -c', () => {
      assert.deepEqual(getAdapter('linux').getShellArgs('/bin/bash'), ['-c'])
      assert.deepEqual(getAdapter('darwin').getShellArgs('/bin/zsh'), ['-c'])
    })

    it('no Windows mantém o shell interativo e sem perfil/AutoRun', () => {
      const win32 = getAdapter('win32')
      assert.deepEqual(win32.getShellArgs('C:\\Program Files\\PowerShell\\7\\pwsh.exe'), [
        '-NoLogo',
        '-NoProfile',
      ])
      assert.deepEqual(win32.getShellArgs('cmd.exe'), ['/d'])
    })
  })

  describe('escapeArg()', () => {
    it('no POSIX devolve aspas vazias para argumento vazio', () => {
      assert.equal(getAdapter('linux').escapeArg(''), '""')
    })

    it('no POSIX não mexe em argumento sem caractere especial, com acento inclusive', () => {
      const linux = getAdapter('linux')
      assert.equal(linux.escapeArg('hello'), 'hello')
      assert.equal(linux.escapeArg('/home/usuário/código'), '/home/usuário/código')
    })

    it('no POSIX envolve em aspas simples e escapa a aspa simples interna', () => {
      const linux = getAdapter('linux')
      assert.equal(linux.escapeArg('hello world'), "'hello world'")
      assert.equal(linux.escapeArg("it's"), "'it'\\''s'")
      assert.equal(linux.escapeArg('$(rm -rf ~)'), "'$(rm -rf ~)'")
    })

    it('no macOS herda o escape POSIX do adaptador base', () => {
      assert.equal(getAdapter('darwin').escapeArg('hello world'), "'hello world'")
    })

    it('no Windows envolve em aspas duplas e escapa a aspa dupla interna', () => {
      const win32 = getAdapter('win32')
      assert.equal(win32.escapeArg(''), '""')
      assert.equal(win32.escapeArg('hello'), 'hello')
      assert.equal(win32.escapeArg('hello world'), '"hello world"')
      assert.equal(win32.escapeArg('say "oi" & sai'), '"say \\"oi\\" & sai"')
    })
  })
})
