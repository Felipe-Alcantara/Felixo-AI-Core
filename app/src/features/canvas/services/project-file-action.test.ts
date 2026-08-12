import { describe, expect, it } from 'vitest'
import {
  canRunProjectFile,
  isBinaryFileName,
  resolveProjectFileClick,
} from './project-file-action'

describe('resolveProjectFileClick', () => {
  it('abre no editor o arquivo de texto que antes só dava "comando não encontrado"', () => {
    expect(resolveProjectFileClick('README.md')).toBe('edit')
    expect(resolveProjectFileClick('config.json')).toBe('edit')
    expect(resolveProjectFileClick('notas.txt')).toBe('edit')
  })

  it('abre no editor também o que roda — ler e editar é o caso comum', () => {
    // Rodar continua possível, mas por um botão próprio: clicar num script
    // para lê-lo não deve executá-lo sem aviso.
    expect(resolveProjectFileClick('script.py')).toBe('edit')
    expect(resolveProjectFileClick('build.sh')).toBe('edit')
  })

  it('não manda binário para o editor, onde só apareceria lixo', () => {
    expect(resolveProjectFileClick('foto.png')).toBe('run')
    expect(resolveProjectFileClick('manual.pdf')).toBe('run')
    expect(resolveProjectFileClick('app.AppImage')).toBe('run')
  })

  it('trata arquivo sem extensão como texto, que é o comum num projeto', () => {
    expect(resolveProjectFileClick('Makefile')).toBe('edit')
    expect(resolveProjectFileClick('LICENSE')).toBe('edit')
    expect(resolveProjectFileClick('Dockerfile')).toBe('edit')
  })

  it('trata arquivo oculto como texto, e não pela extensão aparente', () => {
    // Um ponto inicial não é separador de extensão: `.gitignore` é texto.
    expect(resolveProjectFileClick('.gitignore')).toBe('edit')
    expect(resolveProjectFileClick('.env')).toBe('edit')
  })
})

describe('canRunProjectFile', () => {
  it('oferece rodar só onde rodar significa alguma coisa', () => {
    expect(canRunProjectFile('script.py')).toBe(true)
    expect(canRunProjectFile('index.js')).toBe(true)
    expect(canRunProjectFile('build.sh')).toBe(true)
    expect(canRunProjectFile('deploy.ps1')).toBe(true)
    expect(canRunProjectFile('app.exe')).toBe(true)
  })

  it('não oferece rodar num arquivo que só produziria "comando não encontrado"', () => {
    expect(canRunProjectFile('README.md')).toBe(false)
    expect(canRunProjectFile('config.json')).toBe(false)
    expect(canRunProjectFile('estilo.css')).toBe(false)
    expect(canRunProjectFile('Makefile')).toBe(false)
  })

  it('ignora a caixa da extensão', () => {
    expect(canRunProjectFile('SCRIPT.PY')).toBe(true)
    expect(canRunProjectFile('LEIAME.MD')).toBe(false)
  })
})

describe('isBinaryFileName', () => {
  it('reconhece imagem, mídia, pacote e documento fechado', () => {
    expect(isBinaryFileName('captura.png')).toBe(true)
    expect(isBinaryFileName('musica.mp3')).toBe(true)
    expect(isBinaryFileName('pacote.tar.gz')).toBe(true)
    expect(isBinaryFileName('relatorio.docx')).toBe(true)
    expect(isBinaryFileName('lib.so')).toBe(true)
  })

  it('não confunde texto com binário', () => {
    expect(isBinaryFileName('README.md')).toBe(false)
    expect(isBinaryFileName('main.c')).toBe(false)
    expect(isBinaryFileName('dados.csv')).toBe(false)
  })

  it('olha só o último segmento do caminho', () => {
    expect(isBinaryFileName('/home/user/fotos.png/notas.md')).toBe(false)
    expect(isBinaryFileName('/home/user/docs/captura.png')).toBe(true)
  })
})
