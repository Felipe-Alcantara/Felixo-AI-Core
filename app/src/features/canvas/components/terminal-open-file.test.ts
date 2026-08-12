import { describe, expect, it } from 'vitest'
import {
  findLastEditedFile,
  findLaunchedEditorFile,
  resolveOpenEditorFile,
} from './terminal-open-file'

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

describe('findLaunchedEditorFile', () => {
  it('lê o arquivo da opção de lançamento do bloco', () => {
    // Como ProjectsPanel monta: [...editor.args, entry.name].
    expect(
      findLaunchedEditorFile('nano', ['ola-mundo.md'], '/home/felipe/blog'),
    ).toEqual({ path: '/home/felipe/blog/ola-mundo.md', name: 'ola-mundo.md' })
  })

  it('aceita editor resolvido por caminho completo', () => {
    expect(findLaunchedEditorFile('/usr/bin/vim', ['notas.md'], '/x')?.name).toBe(
      'notas.md',
    )
  })

  it('ignora comando que não é editor de texto', () => {
    expect(findLaunchedEditorFile('python3', ['script.py'], '/x')).toBeUndefined()
    expect(findLaunchedEditorFile(undefined, ['a.md'], '/x')).toBeUndefined()
  })

  it('não trata flag final como arquivo', () => {
    expect(findLaunchedEditorFile('nano', ['-v'], '/x')).toBeUndefined()
    expect(findLaunchedEditorFile('nano', [], '/x')).toBeUndefined()
  })
})

describe('resolveOpenEditorFile', () => {
  it('usa a opção de lançamento quando o app abriu o editor', () => {
    // Regressão do caso real, com o dado exatamente como o canvas persistiu
    // o bloco: o app monta `bash -i -c "nano arquivo; exec bash -i"`, que NÃO
    // ecoa o comando na tela — o histórico do shell fica vazio e só a opção
    // de lançamento sabe o arquivo.
    expect(
      resolveOpenEditorFile({
        command: 'nano',
        args: ['ola-mundo.md'],
        cwd: '/home/user/projeto/src/content/posts',
        shellHistory: '',
      }),
    ).toEqual({
      path: '/home/user/projeto/src/content/posts/ola-mundo.md',
      name: 'ola-mundo.md',
    })
  })

  it('cai para o histórico do shell quando o bloco não lançou editor nenhum', () => {
    expect(
      resolveOpenEditorFile({
        command: 'bash',
        args: [],
        cwd: '/home/felipe/blog',
        shellHistory: '$ nano digitado-a-mao.md',
      }),
    ).toEqual({
      path: '/home/felipe/blog/digitado-a-mao.md',
      name: 'digitado-a-mao.md',
    })
  })

  it('não inventa arquivo quando nenhuma das duas fontes tem um', () => {
    expect(
      resolveOpenEditorFile({
        command: 'bash',
        args: [],
        cwd: '/x',
        shellHistory: '$ ls\n$ npm run build',
      }),
    ).toBeUndefined()
  })
})
