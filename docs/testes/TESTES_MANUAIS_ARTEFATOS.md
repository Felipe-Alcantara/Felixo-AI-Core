# Testes Manuais de Artefatos Gerados

Este documento define o checklist mínimo para validar se o aplicativo empacotado (gerado na release) está funcionando corretamente antes de ser considerado estável para os usuários finais. A validação manual é uma etapa crítica que complementa os testes automatizados da CI.

## Checklist Mínimo de Validação

Para cada sistema operacional suportado (Linux, Windows, macOS), execute as seguintes etapas ao testar um novo artefato de release:

### 1. Download e Instalação
- [ ] Baixar o artefato diretamente da página de releases do repositório (ex: `.exe`, `.AppImage`, `.dmg`).
- [ ] Instalar o aplicativo (se aplicável) ou executá-lo diretamente (no caso de binários portáteis).
- [ ] Confirmar que o nome do aplicativo e o ícone estão corretos no sistema operacional.

### 2. Inicialização
- [ ] Abrir o aplicativo.
- [ ] Confirmar que a tela inicial (Dashboard/Interface principal) carrega completamente sem erros visíveis.
- [ ] Confirmar que não ocorrem travamentos ou fechamentos inesperados durante a inicialização (crash on startup).

### 3. Configurações e Persistência
- [ ] Acessar a tela de configurações básicas.
- [ ] Alterar uma configuração simples (ex: tema, idioma ou preferência de visualização).
- [ ] Fechar completamente o aplicativo (garantir que o processo principal seja encerrado).
- [ ] Reabrir o aplicativo e confirmar que a configuração alterada foi preservada.

### 4. Integração com o Sistema
- [ ] Confirmar que os diretórios de dados do usuário (cache, configurações) foram criados corretamente no local esperado pelo sistema operacional (ex: `~/.config/felixo`, `%APPDATA%\felixo`).
- [ ] Confirmar que os arquivos de log estão sendo gerados e gravados corretamente.

### 5. Funcionalidades Core
- [ ] Abrir o terminal integrado e executar um comando simples (ex: `echo "teste"`, `dir` ou `ls`).
- [ ] Confirmar que o sistema detecta a instalação do `git` (se estiver instalado no ambiente do teste).
- [ ] Confirmar que os providers de CLI suportados (ex: Node, Python, Ollama, etc) são detectados corretamente, se estiverem instalados e no PATH do sistema de teste.

### 6. Encerramento
- [ ] Fechar o aplicativo através da interface gráfica (ex: botão de fechar janela).
- [ ] Verificar no gerenciador de tarefas do sistema se o processo foi totalmente encerrado e se não há processos zumbis ou pendurados em segundo plano.

---

> **Nota para os testadores:** Qualquer falha encontrada durante este checklist deve ser registrada como uma "Issue" ou "Bug" no repositório, especificando o sistema operacional, versão do artefato testado e os logs gerados durante o erro.
