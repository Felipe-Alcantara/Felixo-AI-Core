# Novidades

Resumo do que muda no Felixo AI Core, escrito para quem usa o app. Cada bloco cobre um período. As notas técnicas de cada versão estão nas [Releases](https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases), e o histórico completo está no `git log`.

## 18 a 25 de novembro de 2026

### Novidades

- **Navegador:** o agente controla o bloco Página Web com rolagem, teclas e logs de console, navegação e rede. Qualquer modelo pode usar isso.
- **Scripts de página:** o bloco Página Web aceita scripts de usuário, no estilo do Tampermonkey.
- **Orquestrador:** um coordenador pede um agente por task, e o app abre os terminais depois que você aceita o plano, dentro dos limites. O painel também aceita um lote de tasks, com um grupo de terminais e o progresso de cada task no canvas.
- **Agentes:** o resultado do produtor só é liberado depois que o checador aprova, e as recusas ficam registradas.
- **Retomada:** um workflow multiagente interrompido guarda um ponto de salvamento por agente e ganha o botão Retomar workflow.
- **Prompts:** o app pode oferecer o WORKFLOW 3.0 no contexto inicial. A opção liga e desliga nas Configurações.
- **Terminais:** a leitura dos terminais reconhece o Gemini CLI. Um aviso no bloco do Gemini explica a recusa da conta pessoal e indica a Antigravity.
- **Esforço:** o rótulo do terminal mostra o esforço escolhido, depois do modelo.
- **Painel Notion:** a database de detalhes recarrega sozinha a cada 10 minutos, e o cartão mostra se o repositório tem pasta local.
- **Openia:** o app avisa quando o Openia instalado é anterior à versão 0.2.0.
- **Canvas:** a gaveta encolhe até 320 px em janela estreita, e uma dica ensina a fixar Prompts e Skills.
- **Performance:** quando o processo de GPU cai, o app recomenda o modo compatível.

### Correções

- Ações do canvas que falhavam sem aviso agora mostram a falha, em vez de sumir ou parecer bem-sucedidas.
- Uma falha ao carregar um bloco fica contida e não derruba o resto do canvas.
- O selo de plano do Codex mostra o plano da conta, não o nível do limite.
- O Codex sobe mesmo com uma pasta de perfil de caminho longo.
- Foco, teclado e nomes acessíveis em menus e painéis do canvas.

Ficaram de fora os ajustes internos de testes, de integração contínua e de release. Estão no `git log`.
