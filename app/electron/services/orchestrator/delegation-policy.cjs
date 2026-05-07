'use strict'

// Decides whether a user prompt requires the orchestrator to spawn a sub-agent
// instead of answering directly. Used by the runner to enforce that the
// orchestrator stays a coordinator, never an executor.

// Action verbs cover the most common imperative forms. The regex is a prefix
// match (no trailing \b) so it catches conjugations like "analise/analisar/analiso"
// after NFD normalization strips accents.
const ACTION_VERBS_REGEX =
  /\b(cri[ae]|criar|faz|faca|fazer|mont[ae]|montar|implement[ae]|implementar|escrev[ae]|escrever|redij|redig[ae]|redigir|edit[ae]|editar|alter[ae]|alterar|modific[ae]|modificar|corrij|corrig[ae]|corrigir|debug|consert[ae]|consertar|refator[ae]|refatore|refatorar|analis[ae]|analise|analisar|investig[ae]|investigar|pesquis[ae]|pesquisar|busc[ae]|buscar|encontr[ae]|encontrar|verifi[qc][au]e?|verificar|valid[ae]|validar|test[ae]|testar|rod[ae]|rodar|execut[ae]|executar|ger[ae]|gerar|produz|produzir|resum[ae]|resumir|sumariz[ae]|sumarizar|traduz|traduzir|explic[ae]|explicar|descrev[ae]|descrever|compar[ae]|comparar|avali[ae]|avaliar|revis[ae]|revisar|planej[ae]|planejar|organiz[ae]|organizar|estrutur[ae]|estruturar|projet[ae]|projetar|calcul[ae]|calcular|estim[ae]|estimar|cont[ae]|contar|list[ae]|listar|enumer[ae]|enumerar|colet[ae]|coletar|extrai|extrair|copi[ae]|copiar|mov[ae]|mover|mud[ae]|mudar|configur[ae]|configurar|instal[ae]|instalar|setup|deploy|publi[qc][au]e?|publicar|envi[ae]|enviar|mand[ae]|mandar|consult[ae]|consultar|leia|ler|abr[ae]|abrir|fech[ae]|fechar|ajud[ae]|ajudar|orient[ae]|orientar|suger[ae]|sugerir|recomend[ae]|recomendar|apresent[ae]|apresentar|mostr[ae]|mostrar|exib[ae]|exibir|format[ae]|formatar|prepar[ae]|preparar|complet[ae]|completar|finaliz[ae]|finalizar|automatiz[ae]|automatizar|sincroniz[ae]|sincronizar)/

// Trivial-prompt patterns: greetings, thanks, simple acknowledgements, scope
// clarifications. These do NOT require delegation.
const TRIVIAL_PROMPT_REGEX =
  /^(oi|ola|opa|eai|fala|hello|hi|hey|bom dia|boa tarde|boa noite|tudo bem|valeu|obrigad|obg|thanks|thank you|ok|okay|beleza|certo|entendi|legal|massa|sim|nao|talvez|nao sei|pode|pode sim|claro)\b/

const LONG_PROMPT_THRESHOLD = 120

function normalize(prompt) {
  return String(prompt ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function requiresDelegation(prompt) {
  const normalized = normalize(prompt)

  if (!normalized) {
    return false
  }

  // Long prompts almost always describe real work.
  if (normalized.length > LONG_PROMPT_THRESHOLD) {
    return true
  }

  // Short prompts that look like greetings/acks pass without delegation,
  // unless they also carry an action verb ("oi, cria um arquivo X").
  if (TRIVIAL_PROMPT_REGEX.test(normalized) && !ACTION_VERBS_REGEX.test(normalized)) {
    return false
  }

  // Action verb anywhere → real work.
  if (ACTION_VERBS_REGEX.test(normalized)) {
    return true
  }

  // Ambiguous short prompt without action verb (e.g. "como funciona X?", "o que é Y?").
  // These are questions that can be substantial or trivial. Default to requiring
  // delegation for prompts longer than ~30 chars to err on the safe side; very
  // short questions ("o que é X?") fall through as trivial.
  return normalized.length > 30
}

module.exports = {
  requiresDelegation,
  ACTION_VERBS_REGEX,
  TRIVIAL_PROMPT_REGEX,
  LONG_PROMPT_THRESHOLD,
}
