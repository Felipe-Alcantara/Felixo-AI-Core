# Motion

Microinterações usam 160–240ms com `cubic-bezier(0.2, 0.8, 0.2, 1)`. A rota
usa no máximo 900ms porque explica uma entrega, não porque decora a tela.

O empty state entra e sai em 200ms, sem deslocamento dramático. Uma única
curva ambiental pode se mover 2–5px ao longo de 32s; o restante do ambiente é
estático. Em telas com conteúdo, a atmosfera reduz sua intensidade para manter
o movimento funcional como sinal principal.

Hover revela controles; seleção mantém os controles prontos; foco visível
preserva a navegação por teclado. `prefers-reduced-motion: reduce` remove
deslocamentos e o traço animado da rota, mantendo contraste e estado.
