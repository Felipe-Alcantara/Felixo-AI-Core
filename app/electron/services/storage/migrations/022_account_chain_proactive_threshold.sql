-- Troca antecipada por limiar de uso (docs/projeto/POLITICA-CONTAS.md, 16/11/2026):
-- com a medição atual de uma conta acima do limiar, a cadeia propõe a troca
-- antes da falha, sempre com confirmação. Desligada por padrão; ao ligar, o
-- limiar começa em 90%. As colunas têm padrão, então a linha gravada antes
-- continua válida e uma versão anterior do app as ignora.

ALTER TABLE account_chain_settings ADD COLUMN proactive_enabled INTEGER NOT NULL DEFAULT 0
  CHECK (proactive_enabled IN (0, 1));
ALTER TABLE account_chain_settings ADD COLUMN proactive_threshold_percent INTEGER NOT NULL DEFAULT 90
  CHECK (proactive_threshold_percent BETWEEN 50 AND 99);
