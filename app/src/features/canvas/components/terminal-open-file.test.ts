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
})
