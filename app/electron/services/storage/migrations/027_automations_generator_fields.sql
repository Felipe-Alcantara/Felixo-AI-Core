-- Campos de origem do gerador de prompts (JSON: objetivo, contexto, formato...).
-- Ausente = prompt escrito à mão; presente = dá para reabrir no gerador e ajustar.
ALTER TABLE automations ADD COLUMN generator_fields TEXT;
