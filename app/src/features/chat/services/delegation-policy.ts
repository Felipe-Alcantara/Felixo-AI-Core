// Mirror of electron/services/orchestrator/delegation-policy.cjs.
// Keep in sync. Used to gate when the orchestration protocol must be injected
// into the prompt sent to the orchestrator CLI — any prompt that requires
// real work must trigger the delegation rules, not only prompts that mention
// agents/CLIs by name.

const ACTION_VERBS_REGEX =
  /\b(cri[ae]|criar|faz|faca|fazer|mont[ae]|montar|implement[ae]|implementar|escrev[ae]|escrever|redij|redig[ae]|redigir|edit[ae]|editar|alter[ae]|alterar|modific[ae]|modificar|corrij|corrig[ae]|corrigir|debug|consert[ae]|consertar|refator[ae]|refatore|refatorar|analis[ae]|analise|analisar|investig[ae]|investigar|pesquis[ae]|pesquisar|busc[ae]|buscar|encontr[ae]|encontrar|verifi[qc][au]e?|verificar|valid[ae]|validar|test[ae]|testar|rod[ae]|rodar|execut[ae]|executar|ger[ae]|gerar|produz|produzir|resum[ae]|resumir|sumariz[ae]|sumarizar|traduz|traduzir|explic[ae]|explicar|descrev[ae]|descrever|compar[ae]|comparar|avali[ae]|avaliar|revis[ae]|revisar|planej[ae]|planejar|organiz[ae]|organizar|estrutur[ae]|estruturar|projet[ae]|projetar|calcul[ae]|calcular|estim[ae]|estimar|cont[ae]|contar|list[ae]|listar|enumer[ae]|enumerar|colet[ae]|coletar|extrai|extrair|copi[ae]|copiar|mov[ae]|mover|mud[ae]|mudar|configur[ae]|configurar|instal[ae]|instalar|setup|deploy|publi[qc][au]e?|publicar|envi[ae]|enviar|mand[ae]|mandar|consult[ae]|consultar|leia|ler|abr[ae]|abrir|fech[ae]|fechar|ajud[ae]|ajudar|orient[ae]|orientar|suger[ae]|sugerir|recomend[ae]|recomendar|apresent[ae]|apresentar|mostr[ae]|mostrar|exib[ae]|exibir|format[ae]|formatar|prepar[ae]|preparar|complet[ae]|completar|finaliz[ae]|finalizar|automatiz[ae]|automatizar|sincroniz[ae]|sincronizar)/

const TRIVIAL_PROMPT_REGEX =
  /^(oi|ola|opa|eai|fala|hello|hi|hey|bom dia|boa tarde|boa noite|tudo bem|valeu|obrigad|obg|thanks|thank you|ok|okay|beleza|certo|entendi|legal|massa|sim|nao|talvez|nao sei|pode|pode sim|claro)\b/

const LONG_PROMPT_THRESHOLD = 120

function normalize(prompt: string): string {
  return String(prompt ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function requiresDelegation(prompt: string): boolean {
  const normalized = normalize(prompt)
  if (!normalized) {
    return false
  }
  if (normalized.length > LONG_PROMPT_THRESHOLD) {
    return true
  }
  if (TRIVIAL_PROMPT_REGEX.test(normalized) && !ACTION_VERBS_REGEX.test(normalized)) {
    return false
  }
  if (ACTION_VERBS_REGEX.test(normalized)) {
    return true
  }
  return normalized.length > 30
}
