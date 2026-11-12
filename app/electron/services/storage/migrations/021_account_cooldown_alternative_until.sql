-- Fim alternativo da espera de uma conta (docs/projeto/POLITICA-CONTAS.md):
-- quando a medição do painel e o texto da CLI divergem, vale o mais tarde
-- (`until_at`), e a interface mostra também o outro horário com a fonte dele.
-- Antes ele só existia no momento da detecção e sumia da tela no reload.
-- Só acrescenta colunas que aceitam NULL: as esperas gravadas antes ficam sem
-- alternativo, e uma versão anterior do app ignora as duas colunas.

ALTER TABLE account_cooldowns ADD COLUMN alternative_until_at TEXT;
ALTER TABLE account_cooldowns ADD COLUMN alternative_until_source TEXT
  CHECK (alternative_until_source IS NULL OR alternative_until_source IN ('medicao', 'texto', 'texto_fuso_local'));
