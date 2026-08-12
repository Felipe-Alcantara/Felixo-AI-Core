import { describe, expect, it } from 'vitest'
import { findLastEditedFile } from './terminal-open-file'

describe('findLastEditedFile', () => {
  it('acha o arquivo do último comando nano na tela', () => {
    const transcript = [
      '$ ls',
      'ola-mundo.md',
      '$ nano ola-mundo.md',
      '--- conteúdo do arquivo aqui ---',
    ].join('\n')

    expect(findLastEditedFile(transcript, '/home/felipe/blog')).toEqual({
      path: '/home/felipe/blog/ola-mundo.md',
      name: 'ola-mundo.md',
    })
  })

  it('resolve caminho absoluto sem depender do cwd', () => {
    const transcript = '$ vim /etc/hosts'
    expect(findLastEditedFile(transcript, '/qualquer/coisa')).toEqual({
      path: '/etc/hosts',
      name: 'hosts',
    })
  })

  it('usa o comando mais recente quando o editor abriu mais de um arquivo', () => {
    const transcript = ['$ nano a.md', '$ nano b.md'].join('\n')
    expect(findLastEditedFile(transcript, '/x')?.name).toBe('b.md')
  })

  it('respeita aspas em caminho com espaço', () => {
    const transcript = `$ nano 'meu post.md'`
    expect(findLastEditedFile(transcript, '/x')).toEqual({
      path: '/x/meu post.md',
      name: 'meu post.md',
    })
  })

  it('ignora flags como se fossem o caminho', () => {
    const transcript = '$ vim -R ola-mundo.md'
    expect(findLastEditedFile(transcript, '/x')).toBeUndefined()
  })

  it('retorna undefined quando não houve editor nenhum', () => {
    const transcript = ['$ ls', '$ npm run build'].join('\n')
    expect(findLastEditedFile(transcript, '/x')).toBeUndefined()
  })

  it('não confunde o banner "GNU nano X.Y" com um comando nano', () => {
    // Regressão: "GNU nano 7.2" tem "nano" no meio da linha, seguido de um
    // número — sem ancorar no início do comando, "7.2" virava arquivo.
    const transcript = [
      '$ nano ola-mundo.md',
      '  GNU nano 7.2                    ola-mundo.md',
      '--- conteúdo do arquivo ---',
    ].join('\n')

    expect(findLastEditedFile(transcript, '/home/felipe/blog')).toEqual({
      path: '/home/felipe/blog/ola-mundo.md',
      name: 'ola-mundo.md',
    })
  })

  it('acha o editor mesmo encadeado com outro comando na mesma linha', () => {
    // A função não interpreta o `cd` do encadeamento — o caminho relativo
    // continua resolvido pelo cwd real da sessão, como em qualquer comando.
    const transcript = '$ cd /home/felipe/blog && nano ola-mundo.md'
    expect(findLastEditedFile(transcript, '/x')).toEqual({
      path: '/x/ola-mundo.md',
      name: 'ola-mundo.md',
    })
  })
})
