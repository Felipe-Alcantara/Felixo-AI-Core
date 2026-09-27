# Motion

Microinterações usam 160–240ms com `cubic-bezier(0.2, 0.8, 0.2, 1)`. A rota
usa no máximo 900ms porque explica uma entrega, não porque decora a tela.

O canvas vazio não tem um empty state animado: a orientação do primeiro uso vem
do tutorial do canvas, que não anima. Uma única curva ambiental pode se mover
2–5px ao longo de 32s; o restante do ambiente é estático. Em telas com conteúdo,
a atmosfera reduz sua intensidade para manter o movimento funcional como sinal
principal.

O tutorial do canvas (card, anel e aviso de novidade) não tem animação nem
transição, com ou sem `prefers-reduced-motion` e com ou sem o Modo Performance:
ele aparece e troca de passo no lugar, sem pulso, sem escurecer a tela, sem
`backdrop-filter` e sem pan ou zoom programático do canvas. A rolagem que revela
um alvo na sidebar é instantânea. Um teste de CSS (`onboarding-css.test.ts`)
reprova qualquer regra `.felixo-onboarding-*` que declare `animation` ou
`transition` diferente de `none`.

Hover revela controles; seleção mantém os controles prontos; foco visível
preserva a navegação por teclado. `prefers-reduced-motion: reduce` remove
deslocamentos e o traço animado da rota, mantendo contraste e estado.
