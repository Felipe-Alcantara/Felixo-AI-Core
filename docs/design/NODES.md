# Nodes

Todo node usa `NodeHeader` para manter a mesma proporção, área de arraste,
ações e foco. O cabeçalho prioriza identidade e nome; contexto, índice,
repositório e modelo ficam numa linha técnica compacta quando existem.

Nodes de terminal exibem o símbolo do provider em um slot óptico comum. Ações
secundárias ficam silenciosas até hover, seleção ou foco, mas continuam no DOM
e acessíveis por teclado.

Handles usam área de interação transparente maior e marca visual mínima. O
posicionamento continua sob controle do React Flow. Resize segue a mesma
linguagem de micro-ponto e aparece com clareza durante interação.
