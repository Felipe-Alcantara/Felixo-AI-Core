-- Pessoa que responde pelo agente (campo do bloco no canvas, escolhido por quem cria).
-- Nome livre e curto; ausente = sem responsável. Alimenta o resumo diário por pessoa.
ALTER TABLE agent_sessions ADD COLUMN responsible TEXT;
