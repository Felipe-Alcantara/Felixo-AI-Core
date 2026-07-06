# GUIA MINIMO DE QUALIDADE DE SOFTWARE

> **O que e**: Um contrato curto de qualidade para qualquer projeto que use o `Felixo System Design`.
>
> **Quando usar**: Sempre. Este arquivo deve ser lido antes dos design systems completos quando a sessao precisa de um resumo rapido dos padroes obrigatorios.
>
> **Objetivo**: Preservar qualidade de software sem depender de documentos longos, memoria da conversa ou interpretacao livre do modelo.

---

## 1. Regra central

Nenhuma entrega deve ser tratada como pronta se ela melhora uma parte do sistema enquanto piora arquitetura, seguranca, manutencao, documentacao ou previsibilidade.

Quando houver duvida, siga os documentos completos:

- Backend: [`DESIGN_SYSTEM_BACKEND.md`](DESIGN_SYSTEM_BACKEND.md)
- Frontend: [`DESIGN_SYSTEM_FRONTEND.md`](DESIGN_SYSTEM_FRONTEND.md)
- README: [`DESIGN_SYSTEM_README.md`](DESIGN_SYSTEM_README.md)
- Contexto operacional: [`TEMPLATE-CONTEXTO-IA.md`](TEMPLATE-CONTEXTO-IA.md)
- Menu de entrada (start app): [`GUIA-START-APP-SCRIPT.md`](GUIA-START-APP-SCRIPT.md)

---

## 2. Padroes obrigatorios

1. **Entender antes de alterar**
   - Leia a estrutura existente, identifique o padrao local e preserve a intencao do projeto.
   - Nao invente stack, arquitetura ou convencao se o repositorio ja define uma.

2. **Manter responsabilidades separadas**
   - Regra de negocio nao fica misturada com view/controller, acesso a banco, UI ou integracao externa.
   - Arquivos "faz-tudo" devem ser tratados como sinal de refatoracao.

3. **Preferir simplicidade verificavel**
   - Use a solucao mais simples que resolva o problema real.
   - Nao adicione camada, dependencia, fila, microservico ou abstracao sem justificativa concreta.

4. **Preservar contratos**
   - APIs, DTOs, modelos, props, eventos e formatos de resposta devem ser estaveis.
   - Mudanca quebradora precisa ser explicita, documentada e justificada.

5. **Validar entradas e erros**
   - Toda entrada externa deve ser validada.
   - Erros precisam ser previsiveis, compreensiveis e seguros para quem consome o sistema.

6. **Proteger dados e segredos**
   - Nunca registre tokens, senhas, cookies, dados pessoais ou HTML sensivel em repositorio publico.
   - Logs devem ajudar debug sem vazar segredo.

7. **Testar comportamento importante**
   - Regras criticas, bugs corrigidos, contratos de API, parser, autenticacao e fluxo destrutivo precisam de teste quando aplicavel.
   - Se nao houver teste automatico viavel, registre verificacao manual objetiva.

8. **Documentar estado relevante**
   - README explica uso, setup e decisao importante.
   - `IA.md` registra contexto operacional, decisoes, bugs relevantes, testes e proximos passos.
   - Como a maioria dos projetos e open source, escreva documentacao e logs com linguagem geral e acessivel, sem valores hardcoded e sem depender de contexto privado.
   - Enquadre trabalho futuro como convite a contribuicao: prefira "ideias para quem quiser contribuir" ou "melhorias que o projeto poderia expandir" em vez de "features futuras para implementar". Detalhes em [`DESIGN_SYSTEM_README.md`](DESIGN_SYSTEM_README.md), secao 3.5.

9. **Fazer mudanca pequena e rastreavel**
   - Prefira entregas coesas, com escopo claro.
   - Nao misture refatoracao ampla com feature sem necessidade.
   - **Versionamento (git):** commite direto no `main` por padrao; so crie branch para feature grande, refatoracao significativa ou alto risco. Commits pequenos no formato `tipo: descricao` (`feat`/`fix`/`docs`/`refactor`/`chore`), explicando o que e por que. Politica completa em [`../docs/GIT-POLITICA-DE-VERSIONAMENTO.md`](../docs/GIT-POLITICA-DE-VERSIONAMENTO.md).

10. **Entregar um menu de entrada (`start_app.py`) em todo programa**
    - Todo programa (web, CLI, automacao, script, desktop) deve ter um `start_app.py` na raiz que abre um **menu interativo, colorido e descritivo** — a porta de entrada unica por onde a pessoa instala, configura, inicia e deixa o programa pronto (`python start_app.py`).
    - Sempre menu interativo, nunca flags decoradas; nada de prompt cru "digite a letra". Menu minimo: Iniciar/Rodar, Instalar/Setup, Configurar, Status/Sair.
    - Cross-platform, com mensagens de erro claras, para facilitar quem nao tem facilidade com terminal.
    - Detalhes em [`GUIA-START-APP-SCRIPT.md`](GUIA-START-APP-SCRIPT.md).

11. **Finalizar com criterio de pronto**
    - Codigo/guia revisado.
    - Links internos validos.
    - Testes ou verificacoes executados.
    - Riscos, limites e pendencias registrados.

---

## 3. Checklist rapido antes de encerrar

- [ ] A solucao segue o padrao existente do repositorio.
- [ ] As responsabilidades continuam separadas.
- [ ] Nao ha segredo, dado sensivel ou URL privada exposta.
- [ ] Contratos afetados foram preservados ou documentados.
- [ ] Testes/verificacoes relevantes foram executados ou justificados.
- [ ] Documentacao e logs usam linguagem geral/open source, sem valores hardcoded, e enquadram trabalho futuro como convite a contribuicao.
- [ ] Todo programa tem `start_app.py` com menu interativo (Iniciar/Rodar, Instalar/Setup, Configurar, Status/Sair) funcionando.
- [ ] README, `IA.md` ou guia afetado foram atualizados quando necessario.
- [ ] O versionamento segue [`../docs/GIT-POLITICA-DE-VERSIONAMENTO.md`](../docs/GIT-POLITICA-DE-VERSIONAMENTO.md): mudanca no `main` (ou branch justificada), commit pequeno no formato `tipo: descricao`, doc atualizada no mesmo passo.
- [ ] O proximo mantenedor consegue entender a decisao sem reler toda a conversa.

---

## 4. Frase de controle

Se a entrega nao puder responder claramente **o que mudou**, **por que mudou**, **como foi validado** e **qual risco sobrou**, ela ainda nao esta pronta.
