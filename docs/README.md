# Documentação — Felixo AI Core

Última revisão: 2026-09-01.

Esta pasta reúne a documentação vigente do produto baseado no **canvas estilo
n8n** (blocos visuais — terminais reais, notas, arquivos `.md` compartilhados,
grupos e páginas web). O canvas é a superfície principal; o modo de chat foi
depreciado e só aparece nos guias quando a referência é necessária para
compatibilidade com histórico legado.

## Documentação ativa

| Documento | O que é |
|-----------|---------|
| [projeto/IA.md](projeto/IA.md) | **Contexto operacional versionado** — objetivo, stack, decisões, testes e histórico de evolução para retomada por IA (segue o template de contexto do padrão de qualidade). |
| [projeto/ARQUITETURA.md](projeto/ARQUITETURA.md) | Arquitetura vigente do canvas, terminais, providers, persistência e fronteiras do modo legado. |
| [projeto/ROADMAP.md](projeto/ROADMAP.md) | Direção e próximos passos. |
| [projeto/POLITICA-VERSIONAMENTO.md](projeto/POLITICA-VERSIONAMENTO.md) | Política de branches e commits do projeto. |
| [projeto/RODAR-VIA-CODIGO-FONTE.md](projeto/RODAR-VIA-CODIGO-FONTE.md) | Como rodar o app a partir do código-fonte. |
| [guias/GUIA-DESENVOLVEDOR.md](guias/GUIA-DESENVOLVEDOR.md) | Guia para desenvolvedores. |
| [guias/GUIA-USUARIO.md](guias/GUIA-USUARIO.md) | Guia de instalação e uso para o usuário final. |
| [AUDITORIA-2026-08-08.md](AUDITORIA-2026-08-08.md) | Auditoria histórica de código e segurança; os achados refletem a fotografia daquela data. |

## Qual arquivo consultar

- [`../README.md`](../README.md) é a entrada pública: instalação, uso básico e
  capacidades atuais.
- [`projeto/IA.md`](projeto/IA.md) mantém o contexto operacional versionado e
  seu histórico; acrescente entradas datadas, sem reescrever o passado.
- [`../IA.md`](../IA.md) é o ledger operacional mais recente da raiz, usado para
  registrar sessões e correções recentes.
- Os guias explicam procedimentos observáveis; o roadmap descreve direção e
  ideias de contribuição, não funcionalidades prometidas.

## Histórico arquivado

A pasta [`_legado/`](_legado/) preserva a documentação da fase anterior do projeto (chat mascarado / orquestração multi-agente, de abril–maio de 2026), antes do pivô para o canvas. É mantida como **trilha histórica** — não descreve o produto atual, mas registra decisões, planos e relatórios daquela etapa. O modo de chat que ainda existe no app não deve ser confundido com essa documentação histórica: ele é apenas uma superfície de compatibilidade.

## Padrões de qualidade

Os padrões de design, prompts-base e o template de contexto **não** vivem aqui — são do repositório [Felixo System Design](https://github.com/Felipe-Alcantara/Felixo-System-Design), referenciado pela pasta `Padrão de qualidade - Felixo System Design/` (quando presente) ou diretamente pela fonte.
