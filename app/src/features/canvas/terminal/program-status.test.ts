import { describe, expect, it } from 'vitest'
import { parseProgramStatus, subjectFromTitle, titleSaysWorking } from './program-status'

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64')

describe('parseProgramStatus', () => {
  it('reconhece a sondagem', () => {
    expect(parseProgramStatus('?')).toEqual({ type: 'probe' })
  })

  it('lê estado, kind, progresso, app e texto', () => {
    expect(
      parseProgramStatus(`state=blocked:kind=permission:progress=40:app=claude-code:title=${b64('Título')}:msg=${b64('Posso?')}`),
    ).toEqual({ type: 'report', state: 'blocked', kind: 'permission', progress: 40, app: 'claude-code', title: 'Título', msg: 'Posso?' })
  })

  it('o que o Codex manda: state=idle:app=codex', () => {
    expect(parseProgramStatus('state=idle:app=codex')).toEqual({ type: 'report', state: 'idle', app: 'codex' })
  })

  it('ignora kind fora de blocked e progresso fora de working/blocked', () => {
    expect(parseProgramStatus('state=working:kind=permission:progress=5')).toEqual({ type: 'report', state: 'working', progress: 5 })
    expect(parseProgramStatus('state=done:progress=5')).toEqual({ type: 'report', state: 'done' })
  })

  it('clear, com e sem id', () => {
    expect(parseProgramStatus('state=clear')).toEqual({ type: 'clear' })
    expect(parseProgramStatus('state=clear:id=a/b')).toEqual({ type: 'clear', id: 'a/b' })
  })

  it('descarta estado desconhecido, ausente ou id inválido', () => {
    expect(parseProgramStatus('state=dancing')).toBeNull()
    expect(parseProgramStatus('app=x')).toBeNull()
    expect(parseProgramStatus('state=idle:id=a//b')).toBeNull()
    expect(parseProgramStatus('state=idle:id=a/b/c/d/e/f/g/h/i')).toBeNull()
  })

  it('pula par malformado e segue; a última chave repetida vence', () => {
    expect(parseProgramStatus('lixo:state=working:state=done')).toEqual({ type: 'report', state: 'done' })
  })

  it('descarta o relato com base64 inválido, controle no texto ou texto grande demais', () => {
    expect(parseProgramStatus('state=idle:msg=/w==')).toBeNull()
    expect(parseProgramStatus(`state=idle:msg=${b64('a\x1bb')}`)).toBeNull()
    expect(parseProgramStatus(`state=idle:title=${b64('x'.repeat(193))}`)).toBeNull()
    expect(parseProgramStatus(`state=idle:title=${b64('x'.repeat(192))}`)).not.toBeNull()
    expect(parseProgramStatus(`state=idle:msg=${'A'.repeat(4100)}`)).toBeNull()
  })

  it('tira caracteres bidi e invisíveis do texto', () => {
    const report = parseProgramStatus(`state=idle:msg=${b64('a‮b​c')}`)
    expect(report).toMatchObject({ msg: 'abc' })
  })
})

describe('subjectFromTitle', () => {
  it('tira o glifo e o nome da CLI', () => {
    expect(subjectFromTitle('✳ Resumo com blocos Markdown')).toBe('Resumo com blocos Markdown')
    expect(subjectFromTitle('Formatar resposta | codex')).toBe('Formatar resposta')
    expect(subjectFromTitle('⠦ codex')).toBeUndefined()
    expect(subjectFromTitle('✳ Claude Code')).toBeUndefined()
  })

  it('remove controle e invisível', () => {
    expect(subjectFromTitle('✳ a\u0007b‮c')).toBe('a bc')
  })
})

describe('titleSaysWorking', () => {
  it('spinner do Claude e braille do Codex, não a estrela de repouso', () => {
    expect(titleSaysWorking('◐ Fazendo')).toBe(true)
    expect(titleSaysWorking('⠹ codex')).toBe(true)
    expect(titleSaysWorking('✳ Claude Code')).toBe(false)
    expect(titleSaysWorking('codex')).toBe(false)
  })
})

describe('títulos reais das gravações (Claude Code e Codex)', () => {
  it('o assunto sai limpo e o estado de trabalho bate com o glifo', () => {
    const real: Array<[string, string | undefined, boolean]> = [
      ['✳ Claude Code', undefined, false],
      ['◐ Claude Code', undefined, true],
      ['◑ Resumo com blocos Markdown', 'Resumo com blocos Markdown', true],
      ['✳ Resumo com blocos Markdown', 'Resumo com blocos Markdown', false],
      ['codex', undefined, false],
      ['⠹ codex', undefined, true],
    ]
    for (const [title, subject, working] of real) {
      expect(subjectFromTitle(title)).toBe(subject)
      expect(titleSaysWorking(title)).toBe(working)
    }
  })
})
