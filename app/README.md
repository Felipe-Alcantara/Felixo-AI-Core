# Felixo AI Core App

Aplicação desktop inicial do Felixo AI Core.

## Stack

- Electron
- React
- TypeScript
- Vite
- Tailwind CSS
- lucide-react

## Requisitos

- Node `25.9.0` recomendado via `.nvmrc`
- npm

## Como Rodar

Pela raiz do repositório:

```bash
python3 start_app.py
```

Ou manualmente:

```bash
nvm use
npm install
npm run dev
```

## Scripts

```bash
npm run dev      # abre Vite + Electron
npm run dev:web  # abre somente o frontend no navegador
npm run lint     # valida ESLint
npm run build    # valida TypeScript e gera build web
npm run start    # abre Electron usando o build em dist/
```

## Estado Atual

A interface já funciona como um chatbot local para ideação. A resposta ainda não chama uma IA externa; ela gera um rascunho determinístico para validar a experiência inicial.

O próximo passo é conectar os scripts locais de `../ai-clis/` ao processo principal do Electron.
