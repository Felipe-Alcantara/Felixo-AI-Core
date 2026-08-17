---
name: atualizar-dependencias
description: Atualizar dependências com triagem de risco em vez de subir tudo de uma vez — separar segurança de conveniência, ler changelog de breaking change e validar em passos reversíveis. Use ao tratar alerta de vulnerabilidade, lockfile velho ou pedido de "atualizar as libs".
---

# Atualizar dependências sem virar a noite

"Atualizar tudo" é a forma mais rápida de transformar uma tarde em três dias.
Atualização é gestão de risco, não faxina.

## Etapa 1 — Fotografe o estado atual

- Gate verde **antes** de qualquer mudança (lint, testes, build). Sem isso você
  não distingue quebra nova de quebra velha.
- Lockfile commitado? Se não estiver, esse é o primeiro problema — sem ele a
  build não é reproduzível e "funciona na minha máquina" é inevitável.
- Rode a auditoria de vulnerabilidade e **leia** os achados, não só a contagem.

## Etapa 2 — Classifique cada atualização

| Classe | O que é | Urgência |
| --- | --- | --- |
| **Segurança explorável** | CVE em caminho que seu código realmente executa | Agora |
| **Segurança teórica** | CVE em função que você não usa, ou em dependência de dev | Planejada |
| **Correção que te afeta** | Bug que você já sentiu | Alta |
| **Feature nova** | Você não precisa hoje | Baixa |
| **Major com breaking change** | Exige trabalho de migração | Projeto próprio |

Uma vulnerabilidade em dependência **de desenvolvimento** não é a mesma coisa
que uma em produção — diga qual é.

## Etapa 3 — Suba em lotes separados e commitáveis

1. **Patch** de tudo — geralmente seguro, um commit só, gate verde.
2. **Minor**, por pacote ou por grupo coeso, lendo o changelog.
3. **Major**, um de cada vez, **sempre** com o changelog aberto e um commit
   dedicado. Major sozinho é reversível; major em lote não.

Nunca misture atualização com mudança de código sua no mesmo commit.

## Etapa 4 — Leia o que importa no changelog

Procure especificamente: *breaking changes*, *removed*, *deprecated*, mudança
de comportamento padrão, mudança de versão mínima da runtime. O resto pode
esperar.

Onde o risco costuma se esconder: parsing de data, encoding, ordenação padrão,
timeout padrão, política de retry, formato de erro, comportamento com valor
nulo.

## Etapa 5 — Valide de verdade

- Gate completo.
- **Rode a aplicação**, não só os testes. Muita quebra de dependência só
  aparece em runtime.
- Cheque o que os testes não cobrem: build de produção, empacotamento, tamanho
  do bundle, tempo de inicialização.
- Em app empacotado ou com dependência nativa, teste **em cada SO** que você
  entrega. Dependência nativa é onde "passou no CI" mais engana.

## Etapa 6 — Registre

- Commit por lote, com a lista do que subiu e de onde para onde.
- Se uma atualização foi **adiada**, registre o motivo e o risco aceito — senão
  o próximo a olhar refaz a mesma análise.
- Vulnerabilidade sem correção disponível: registre a mitigação em uso.

## Se quebrar

Reverta o lote inteiro primeiro, restabeleça o verde, e só então investigue com
o repositório estável. Depurar com a árvore quebrada multiplica as variáveis.
