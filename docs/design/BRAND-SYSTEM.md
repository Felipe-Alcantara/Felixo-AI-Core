# Felixo AI Core - Brand System

Revisão: 2026-09-12. Fonte: `Felixo-AI-Core-Brand-Kit-v1.0`.

## Fonte de verdade

Os assets oficiais ficam centralizados em `app/public/brand/`:

- `logos/svg/`: masters vetoriais para a interface;
- `logos/png/`: exports para app icon, splash e contextos raster;
- `favicons/`: ICO e PNGs de 16 a 512 px;
- `tokens/`: exports CSS e JSON do kit;
- `providers/`: marcas locais das integrações reais.

O componente React em `app/src/features/shared/brand/FelixoMark.tsx` só escolhe
o master, aplica escala e define o contexto semântico. Ele não reconstrói a
geometria da marca.

> Os arquivos SVG oficiais em `/brand` são a fonte da verdade da marca Felixo
> AI Core. Nenhum agente pode regenerar, reinterpretar, simplificar ou alterar
> sua geometria sem uma task explícita de redesign da marca.

## Princípios

O produto combina **Black Space**, **White Light** e **Distributed Routes**.
Superfícies próximas criam profundidade; branco indica foco, atividade e
junctions relevantes; rotas comunicam conexões reais e orquestração.

O estado ocioso é quieto. Motion e glow só aparecem quando comunicam seleção,
processamento, carregamento ou conclusão. O canvas continua sendo a superfície
principal; a marca acompanha o produto sem competir com o conteúdo.

## Tokens oficiais

| Token | Valor | Uso |
| --- | --- | --- |
| Deep Black | `#090909` | fundo principal |
| Surface | `#0F0F10` | painéis e composer |
| Surface 2 | `#161617` | superfícies elevadas |
| Border | `#2A2A2E` | hairlines e controles |
| Pure White | `#FFFFFF` | logo, texto primário e atividade |
| Muted Text | `#A1A1A1` | texto secundário |
| Subtle Text | `#6F6F74` | metadata e texto terciário |

O frontend importa os tokens em
`app/src/features/shared/brand/felixo-brand-tokens.css`. Os aliases históricos
em `app/src/index.css` existem apenas para compatibilidade com os componentes
atuais e devem derivar desses valores.

## Uso da marca

- Prefira o símbolo sozinho quando “Felixo AI Core” já estiver escrito.
- Use o lockup horizontal em headers e momentos onde o nome precisa aparecer.
- Preserve ao menos `0.5x` da largura do símbolo como área de respiro.
- Use 32 px como tamanho normal, 24 px como mínimo de interface e o favicon
  dedicado em 16 px.
- Use o SVG branco sobre superfícies escuras e o SVG preto em superfícies claras.
- Glow é efeito de estado, nunca parte da geometria nem tratamento permanente.
- Provider branding fica restrito a ícones pequenos e locais dentro do produto.

## Motion e rotas

Rotas persistidas permanecem discretas quando inativas. Durante uma entrega
real, uma rota pode iluminar do ponto de origem ao destino; ao concluir, a
junction pode responder brevemente e voltar ao neutro. Não usar partículas
constantes, pulsos permanentes, gradientes neon ou rede decorativa em excesso.

## App icon e favicon

O empacotamento Electron usa `logos/png/felixo-app-icon-dark-512.png`. O HTML
usa `favicons/favicon.ico`, com o export PNG de 32 px e o apple touch icon de
180 px como complementos. Em escalas pequenas, usar os exports dedicados em
vez de reduzir o PNG de 1024 px.

## Proibições

Não esticar, girar, inclinar, redesenhar, colorir com gradientes aleatórios,
remover/adicionar nós, aplicar sombra pesada ou incorporar glow dentro do SVG.
Não transformar a marca em cérebro, molécula, circuito, cyberpunk ou ícone
genérico de IA.
