# Modelos de IA Baratos para Integração

Status: concluido.

Pesquisa realizada em: 2026-05-01.

## Objetivo

Levantar modelos e provedores baratos que podem ser testados futuramente no Felixo AI Core para classificação, resumo, revisão, código, agentes simples e execução local.

## Fontes consultadas

- OpenAI API Pricing: https://openai.com/api/pricing/
- Anthropic Claude Pricing: https://platform.claude.com/docs/en/docs/about-claude/pricing
- Google Gemini API Pricing: https://ai.google.dev/pricing
- DeepSeek API Pricing: https://api-docs.deepseek.com/quick_start/pricing/
- Groq Pricing: https://groq.com/pricing/
- Mistral Codestral: https://docs.mistral.ai/models/model-cards/codestral-25-08
- Mistral Ministral 3 14B: https://docs.mistral.ai/models/model-cards/ministral-3-14b-25-12
- Mistral Known Limitations: https://docs.mistral.ai/resources/known-limitations

## Comparativo inicial

| Provedor | Modelo | Entrada | Saída | Contexto citado | Melhor uso inicial |
|----------|--------|---------|-------|-----------------|--------------------|
| Google | Gemini 2.5 Flash-Lite | US$ 0.10 / 1M | US$ 0.40 / 1M | não fixado aqui | classificação, resumo, tarefas pequenas |
| Google | Gemini 2.5 Flash | US$ 0.30 / 1M | US$ 2.50 / 1M | 1M tokens | contexto longo barato, automações |
| DeepSeek | deepseek-v4-flash | US$ 0.14 / 1M cache miss | US$ 0.28 / 1M | 1M tokens | resumo, chat, código barato |
| DeepSeek | deepseek-v4-pro | US$ 1.74 / 1M cache miss | US$ 3.48 / 1M | 1M tokens | raciocínio/código com custo baixo relativo |
| Groq | Llama 3.1 8B Instant | US$ 0.05 / 1M | US$ 0.08 / 1M | 128k | respostas rápidas, classificação |
| Groq | GPT OSS 20B | US$ 0.075 / 1M | US$ 0.30 / 1M | 128k | agentes simples, resumo rápido |
| Mistral | Ministral 3 14B | US$ 0.20 / 1M | US$ 0.20 / 1M | 256k | local/API barata, resumo e extração |
| Mistral | Codestral 25.08 | US$ 0.30 / 1M | US$ 0.90 / 1M | 128k | tarefas de código e FIM |
| OpenAI | GPT-5.4 mini | US$ 0.75 / 1M | US$ 4.50 / 1M | abaixo de 270k no preço padrão | subagentes de código quando qualidade importa |
| Anthropic | Claude Sonnet 4.6 | US$ 3.00 / 1M | US$ 15.00 / 1M | não fixado aqui | revisão/código de maior valor |

## Recomendações para testar primeiro

1. Gemini 2.5 Flash-Lite para classificação, resumo e tarefas pequenas.
2. Groq Llama 3.1 8B Instant para respostas muito rápidas e baratas.
3. DeepSeek V4 Flash para contexto longo barato e código leve.
4. Mistral Ministral 3 14B para alternativa barata com opção local/open-weight.
5. GPT-5.4 mini quando a tarefa exigir melhor confiabilidade em código e agentes.

## Cuidados

- Preços mudam com frequência; confirmar nas páginas oficiais antes de integrar cobrança.
- Qualidade para código precisa ser testada no fluxo real do Felixo.
- Modelos locais exigem hardware adequado e medição de latência.
- Integração por endpoint estilo OpenAI deve ser priorizada quando reduzir custo de manutenção.
