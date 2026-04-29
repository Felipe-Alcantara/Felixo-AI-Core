# 📅 GUIA-HEATMAP-DE-ATIVIDADE-REUTILIZAVEL-DO-READING-TRACKER.md

> **O que é**: Um guia reutilizável para construir um **calendário de atividade com heatmap**, no estilo de consistência visual popularizado pelo GitHub.
>
> **De onde vem**: Este padrão foi extraído do componente `HeatmapView` do projeto **Reading Tracker**.
>
> **Qual é o propósito dentro de `Utils/`**: Preservar esse padrão como referência pronta para reaproveitamento no `Felixo System Design`, sem depender do contexto completo do produto original.
>
> **Quando usar**: Hábitos, leitura, exercícios, commits, uso de plataforma, vendas ou qualquer métrica diária que faça sentido como intensidade visual ao longo do tempo.

Este documento isola a lógica de agregação diária, cálculo de intensidade e renderização do calendário. A ideia não é documentar o `Reading Tracker` inteiro, e sim capturar o padrão técnico que pode ser levado para outros produtos.

---

## Visão geral

O heatmap é composto por **3 camadas**:

| Camada | Onde | Responsabilidade |
|---|---|---|
| **Agregação de dados** | `utils.js` | Transforma sessões em dados por dia (count, duration, sessions) |
| **Cálculo de intensidade** | `HeatmapView.jsx` | Converte valores em níveis de cor (0-5) |
| **Renderização visual** | `HeatmapView.jsx` | Grade de dias com cores, tooltips e navegação |

---

## 1. Estrutura de dados

### Entrada: Sessões brutas

```js
const sessions = [
  {
    id: "uuid-1",
    date: "2025-01-15",
    book: "Dom Casmurro",
    pages: 25,
    duration_min: 45,
    notes: "Capítulo interessante"
  },
  {
    id: "uuid-2",
    date: "2025-01-15",
    book: "1984",
    pages: 15,
    duration_min: 30,
    notes: ""
  },
  // Múltiplas sessões no mesmo dia são agregadas
];
```

### Saída: Dados agregados por dia

```js
const aggregatedData = [
  {
    date: "2025-01-15",
    count: 40,           // Total de páginas lidas
    totalDuration: 75,   // Total de minutos
    sessions: 2          // Número de sessões
  },
  {
    date: "2025-01-16",
    count: 0,
    totalDuration: 0,
    sessions: 0
  }
];
```

---

## 2. Funções auxiliares (utils.js)

### aggregateSessionsByDay

Agrupa sessões por data e soma páginas/tempo:

```js
import { format, parseISO } from 'date-fns';

export const aggregateSessionsByDay = (sessions) => {
  const map = new Map();

  sessions.forEach(session => {
    // Extrai a data (pode vir de session.date ou session.start)
    const rawDate = session?.date || 
                    (session?.start ? format(parseISO(session.start), 'yyyy-MM-dd') : null);
    if (!rawDate) return;

    // Normaliza para YYYY-MM-DD
    const dateKey = format(parseISO(rawDate), 'yyyy-MM-dd');
    
    if (!map.has(dateKey)) {
      map.set(dateKey, { 
        date: dateKey, 
        count: 0,           // Páginas
        totalDuration: 0,   // Minutos
        sessions: 0         // Quantidade de sessões
      });
    }
    
    const entry = map.get(dateKey);
    entry.count += session.pages || 0;
    entry.totalDuration += session.duration_min || 0;
    entry.sessions += 1;
  });

  return Array.from(map.values());
};
```

**Por que usar Map?**
- Lookup O(1) para verificar se a data já existe
- Garante que cada data aparece apenas uma vez
- Fácil conversão para array com `Array.from(map.values())`

### formatDuration

Formata minutos em formato legível:

```js
export const formatDuration = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};
```

**Exemplos:**
- `45` → `"45m"`
- `90` → `"1h 30m"`
- `125` → `"2h 5m"`

### calculatePagesPerMin

Calcula velocidade de leitura:

```js
export const calculatePagesPerMin = (pages, durationMin) => {
  if (!durationMin || durationMin <= 0) return 0;
  return parseFloat((pages / durationMin).toFixed(2));
};
```

---

## 3. Componente HeatmapView

### Anatomia visual

```
┌────────────────────────────────────────────────┐
│ Consistência de Leitura                        │
│                                                │
│  [◀]    Janeiro de 2025    [▶]                │  ← Navegação
├────────────────────────────────────────────────┤
│  Seg  Ter  Qua  Qui  Sex  Sáb  Dom            │  ← Cabeçalho
├────────────────────────────────────────────────┤
│   1    2    3    4    5    6    7             │
│  [█]  [█]  [░]  [█]  [█]  [░]  [░]            │  ← Grade de dias
│   8    9   10   11   12   13   14             │     (cor = intensidade)
│  [█]  [█]  [█]  [░]  [█]  [█]  [█]            │
│  ...                                           │
├────────────────────────────────────────────────┤
│  Menos [░][▒][▒][▓][▓][█] Mais                │  ← Legenda
└────────────────────────────────────────────────┘
```

### Estado e hooks

```jsx
import React, { useMemo, useState } from 'react';
import { startOfMonth, addMonths, subMonths } from 'date-fns';

export default function HeatmapView({ sessions }) {
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(today));

  // Converte array de sessões em Map<date, data> para lookup O(1)
  const byDate = useMemo(() => {
    const agg = aggregateSessionsByDay(sessions);
    const map = new Map();
    agg.forEach((d) => {
      map.set(d.date, d);
    });
    return map;
  }, [sessions]);

  const goToPreviousMonth = () => setSelectedMonth(prev => subMonths(prev, 1));
  const goToNextMonth = () => setSelectedMonth(prev => addMonths(prev, 1));
  const goToToday = () => setSelectedMonth(startOfMonth(today));
  
  // ...
}
```

**Por que `useMemo` no `byDate`?**
- `aggregateSessionsByDay` percorre todas as sessões (operação cara)
- Só recalcula quando `sessions` muda
- Evita re-agregação a cada render

### Cálculo de intensidade (níveis de cor)

```js
const getLevel = (dayData) => {
  const pages = dayData?.count || 0;
  const minutes = dayData?.totalDuration || 0;

  // Prioriza páginas; se não houver, usa minutos
  const amount = pages > 0 ? pages : minutes;
  if (amount <= 0) return 0;

  // Níveis baseados em páginas
  if (pages > 0) {
    if (amount < 10) return 1;   // 1-9 páginas
    if (amount < 25) return 2;   // 10-24 páginas
    if (amount < 50) return 3;   // 25-49 páginas
    if (amount < 100) return 4;  // 50-99 páginas
    return 5;                     // 100+ páginas
  }

  // Níveis baseados em minutos (quando não há páginas)
  if (amount < 15) return 1;     // 1-14 min
  if (amount < 30) return 2;     // 15-29 min
  if (amount < 60) return 3;     // 30-59 min
  if (amount < 120) return 4;    // 1-2 horas
  return 5;                       // 2+ horas
};
```

**Customização:**
- Ajuste os limiares conforme seu domínio
- Exemplo para commits: `< 5`, `< 10`, `< 20`, `< 50`, `50+`
- Exemplo para exercícios: `< 10min`, `< 20min`, `< 30min`, `< 60min`, `60+`

### Mapeamento de cores

```js
const levelClass = (level) => {
  switch (level) {
    case 0: return 'bg-gray-100 dark:bg-gray-700';           // Sem atividade
    case 1: return 'bg-brand-100 dark:bg-brand-900/30';      // Muito leve
    case 2: return 'bg-brand-200 dark:bg-brand-900/45';      // Leve
    case 3: return 'bg-brand-300 dark:bg-brand-900/60';      // Moderado
    case 4: return 'bg-brand-500 dark:bg-brand-700';         // Intenso
    case 5: return 'bg-brand-700 dark:bg-brand-600';         // Muito intenso
    default: return 'bg-gray-100 dark:bg-gray-700';
  }
};
```

**Cores brand no Tailwind:**
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
          900: '#581c87',
        }
      }
    }
  }
}
```

### Geração da grade de dias

```jsx
import { 
  addDays, 
  endOfMonth, 
  endOfWeek, 
  format, 
  isSameMonth, 
  isToday, 
  startOfWeek 
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Dentro do componente:
const monthEnd = endOfMonth(selectedMonth);
const gridStart = startOfWeek(selectedMonth, { weekStartsOn: 1 }); // 1 = Segunda
const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

const days = [];
for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
  days.push(d);
}

return (
  <>
    {/* Cabeçalho dos dias da semana */}
    <div className="grid grid-cols-7 gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">
      {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
        <div key={d} className="text-center">{d}</div>
      ))}
    </div>

    {/* Grade de dias */}
    <div className="grid grid-cols-7 gap-3 flex-1">
      {days.map((day) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const dayData = byDate.get(dateKey);
        const level = getLevel(dayData);

        const pages = dayData?.count || 0;
        const minutes = dayData?.totalDuration || 0;
        const sessionsCount = dayData?.sessions || 0;

        const isThisMonth = isSameMonth(day, selectedMonth);
        const isDayToday = isToday(day);

        // Conteúdo do tooltip
        const tooltipParts = [];
        tooltipParts.push(format(day, "dd/MM/yyyy", { locale: ptBR }));
        if (sessionsCount > 0) {
          tooltipParts.push(`${sessionsCount} sessão(ões)`);
          if (pages > 0) tooltipParts.push(`${pages} pág.`);
          if (minutes > 0) tooltipParts.push(formatDuration(minutes));
        } else {
          tooltipParts.push('Sem leitura');
        }

        return (
          <div key={dateKey} className="flex flex-col items-center gap-1.5">
            <div
              className={[
                'w-full aspect-square rounded-xl border flex flex-col items-center justify-center select-none cursor-pointer transition-all hover:scale-105',
                isThisMonth ? 'border-gray-200 dark:border-gray-700' : 'border-transparent opacity-30',
                levelClass(level),
                isDayToday ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-800' : '',
              ].join(' ')}
              data-tooltip-id="heatmap-tooltip"
              data-tooltip-content={tooltipParts.join(' • ')}
            >
              {/* Número do dia */}
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                {format(day, 'd')}
              </span>
              
              {/* Mini indicador */}
              {(pages > 0 || minutes > 0) && (
                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300 leading-none mt-0.5">
                  {pages > 0 ? `${pages}p` : formatDuration(minutes)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </>
);
```

**Pontos-chave:**

- **`startOfWeek(..., { weekStartsOn: 1 })`**: Semana começa na segunda (0 = domingo)
- **`isSameMonth(day, selectedMonth)`**: Dias de outros meses ficam opacos
- **`isToday(day)`**: Dia atual recebe ring colorido
- **`aspect-square`**: Garante que células sejam quadradas
- **`hover:scale-105`**: Feedback visual ao passar o mouse
- **Mini indicador**: Mostra valor diretamente na célula (ex: "25p" ou "1h 30m")

### Tooltips com React Tooltip

```jsx
import { Tooltip } from 'react-tooltip';

// No final do componente:
<Tooltip id="heatmap-tooltip" />
```

**Uso:**
```jsx
<div
  data-tooltip-id="heatmap-tooltip"
  data-tooltip-content="15/01/2025 • 2 sessões • 40 pág. • 1h 15m"
>
```

### Navegação entre meses

```jsx
import { ChevronLeft, ChevronRight } from 'lucide-react';

<div className="flex items-center justify-between gap-2 w-64">
  <button
    onClick={goToPreviousMonth}
    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
    aria-label="Mês anterior"
  >
    <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
  </button>
  
  <button
    onClick={goToToday}
    className="px-3 py-1.5 text-sm font-semibold text-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-1 text-center"
  >
    {format(selectedMonth, "MMMM 'de' yyyy", { locale: ptBR })}
  </button>
  
  <button
    onClick={goToNextMonth}
    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
    aria-label="Próximo mês"
  >
    <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
  </button>
</div>
```

### Legenda de intensidade

```jsx
<div className="flex items-center justify-end gap-2 mt-auto pt-4 text-xs text-gray-500">
  <span>Menos</span>
  <div className="flex gap-1">
    <div className="w-3 h-3 rounded-sm bg-gray-100 dark:bg-gray-700"></div>
    <div className="w-3 h-3 rounded-sm bg-brand-100 dark:bg-brand-900/30"></div>
    <div className="w-3 h-3 rounded-sm bg-brand-200 dark:bg-brand-900/45"></div>
    <div className="w-3 h-3 rounded-sm bg-brand-300 dark:bg-brand-900/60"></div>
    <div className="w-3 h-3 rounded-sm bg-brand-500 dark:bg-brand-700"></div>
    <div className="w-3 h-3 rounded-sm bg-brand-700 dark:bg-brand-600"></div>
  </div>
  <span>Mais</span>
</div>
```

---

## 4. Variações de implementação

### Variação 1: Heatmap anual (estilo GitHub)

```jsx
// Mostra 12 meses em uma linha horizontal
const HeatmapYearView = ({ sessions }) => {
  const months = [];
  for (let i = 0; i < 12; i++) {
    months.push(subMonths(new Date(), i));
  }

  return (
    <div className="flex gap-2 overflow-x-auto">
      {months.map(month => (
        <div key={format(month, 'yyyy-MM')} className="flex-shrink-0">
          <p className="text-xs text-gray-500 mb-2">
            {format(month, 'MMM', { locale: ptBR })}
          </p>
          <MiniMonthGrid month={month} sessions={sessions} />
        </div>
      ))}
    </div>
  );
};
```

### Variação 2: Heatmap semanal (7 dias)

```jsx
const HeatmapWeekView = ({ sessions }) => {
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    days.push(subDays(today, i));
  }

  return (
    <div className="flex gap-2">
      {days.map(day => (
        <DayCell key={format(day, 'yyyy-MM-dd')} day={day} sessions={sessions} />
      ))}
    </div>
  );
};
```

### Variação 3: Heatmap com múltiplas métricas

```jsx
// Mostra duas cores: uma para páginas, outra para tempo
const getLevel = (dayData, metric) => {
  const value = metric === 'pages' ? dayData?.count : dayData?.totalDuration;
  // ... lógica de níveis
};

// Renderiza duas grades lado a lado
<div className="grid grid-cols-2 gap-6">
  <HeatmapGrid metric="pages" label="Páginas" />
  <HeatmapGrid metric="time" label="Tempo" />
</div>
```

### Variação 4: Heatmap com clique para detalhes

```jsx
const [selectedDay, setSelectedDay] = useState(null);

<div
  onClick={() => setSelectedDay(dayData)}
  className="cursor-pointer"
>
  {/* célula do dia */}
</div>

{selectedDay && (
  <Modal>
    <h3>{format(selectedDay.date, 'dd/MM/yyyy')}</h3>
    <ul>
      {selectedDay.sessions.map(session => (
        <li key={session.id}>{session.book} - {session.pages}p</li>
      ))}
    </ul>
  </Modal>
)}
```

---

## 5. Como reutilizar em outro projeto

### Passo 1: Adaptar a estrutura de dados

Identifique os campos do seu domínio:

| Domínio | Campo de data | Campo de valor | Campo de contagem |
|---|---|---|---|
| **Leitura** | `session.date` | `session.pages` | `session.duration_min` |
| **Commits** | `commit.date` | `commit.additions` | `commit.files_changed` |
| **Exercícios** | `workout.date` | `workout.calories` | `workout.duration_min` |
| **Vendas** | `sale.date` | `sale.amount` | `sale.quantity` |
| **Hábitos** | `habit.date` | `habit.completed` (boolean) | - |

### Passo 2: Ajustar aggregateSessionsByDay

```js
// Para commits:
export const aggregateCommitsByDay = (commits) => {
  const map = new Map();
  commits.forEach(commit => {
    const dateKey = format(parseISO(commit.date), 'yyyy-MM-dd');
    if (!map.has(dateKey)) {
      map.set(dateKey, { date: dateKey, additions: 0, commits: 0 });
    }
    const entry = map.get(dateKey);
    entry.additions += commit.additions || 0;
    entry.commits += 1;
  });
  return Array.from(map.values());
};
```

### Passo 3: Ajustar getLevel

```js
// Para commits:
const getLevel = (dayData) => {
  const commits = dayData?.commits || 0;
  if (commits === 0) return 0;
  if (commits < 3) return 1;
  if (commits < 6) return 2;
  if (commits < 10) return 3;
  if (commits < 20) return 4;
  return 5;
};
```

### Passo 4: Customizar cores

```js
// Tema verde (estilo GitHub):
const levelClass = (level) => {
  switch (level) {
    case 0: return 'bg-gray-100 dark:bg-gray-800';
    case 1: return 'bg-green-100 dark:bg-green-900/30';
    case 2: return 'bg-green-300 dark:bg-green-700/50';
    case 3: return 'bg-green-500 dark:bg-green-600';
    case 4: return 'bg-green-700 dark:bg-green-500';
    case 5: return 'bg-green-900 dark:bg-green-400';
    default: return 'bg-gray-100 dark:bg-gray-800';
  }
};
```

### Passo 5: Instalar dependências

```bash
npm install date-fns react-tooltip lucide-react
```

### Passo 6: Uso no componente pai

```jsx
import HeatmapView from './components/HeatmapView';

function App() {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    // Carrega dados do LocalStorage, API, etc
    const data = JSON.parse(localStorage.getItem('sessions')) || [];
    setSessions(data);
  }, []);

  return (
    <div className="p-6">
      <HeatmapView sessions={sessions} />
    </div>
  );
}
```

---

## 6. Otimizações de performance

### useMemo para agregação

```js
const byDate = useMemo(() => {
  const agg = aggregateSessionsByDay(sessions);
  const map = new Map();
  agg.forEach(d => map.set(d.date, d));
  return map;
}, [sessions]);
```

**Por quê?**
- `aggregateSessionsByDay` é O(n) onde n = número de sessões
- Sem `useMemo`, roda a cada render (ex: ao mudar tema, abrir modal)
- Com `useMemo`, só recalcula quando `sessions` muda

### Map ao invés de Array.find

```js
// ❌ Lento (O(n) para cada dia):
const dayData = aggregatedData.find(d => d.date === dateKey);

// ✅ Rápido (O(1) para cada dia):
const dayData = byDate.get(dateKey);
```

### Virtualização para muitos meses

Se renderizar 12+ meses simultaneamente:

```bash
npm install react-window
```

```jsx
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={months.length}
  itemSize={200}
>
  {({ index, style }) => (
    <div style={style}>
      <MonthGrid month={months[index]} />
    </div>
  )}
</FixedSizeList>
```

---

## 7. Acessibilidade

### ARIA labels

```jsx
<button
  onClick={goToPreviousMonth}
  aria-label="Mês anterior"
>
  <ChevronLeft />
</button>
```

### Navegação por teclado

```jsx
<div
  tabIndex={0}
  role="button"
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleDayClick(day);
    }
  }}
>
```

### Contraste de cores

Garanta que o texto sobre as células tenha contraste mínimo de 4.5:1:

```js
// Use ferramentas como https://webaim.org/resources/contrastchecker/
```

---

## 8. Referência de arquivos (neste projeto)

| Arquivo | O que faz |
|---|---|
| `src/components/HeatmapView.jsx` | Componente completo do heatmap |
| `src/utils.js` | Funções `aggregateSessionsByDay`, `formatDuration`, `calculatePagesPerMin` |
| `tailwind.config.js` | Cores `brand-*` customizadas |
| `src/index.css` | Estilos globais + Tailwind imports |

---

## Resumo da receita

1. **Agregação**: Transforme dados brutos em `Map<date, { count, duration, sessions }>`
2. **Níveis**: Defina limiares para converter valores em níveis de cor (0-5)
3. **Cores**: Mapeie níveis para classes Tailwind com suporte a dark mode
4. **Grade**: Use `date-fns` para gerar array de dias do mês (incluindo dias de outros meses)
5. **Tooltips**: Use `react-tooltip` com `data-tooltip-*` attributes
6. **Navegação**: Botões para mês anterior/próximo + clique no título para voltar ao mês atual
7. **Indicadores**: Mostre valor diretamente na célula (ex: "25p", "1h 30m")
8. **Legenda**: Mostre escala de cores no rodapé
9. **Performance**: Use `useMemo` para agregação e `Map` para lookup O(1)
10. **Responsividade**: `grid-cols-7` + `gap-3` + `aspect-square` para layout consistente

---

> **Assinatura de Origem**  
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versão: 2026-03-23  
> Sugestões e pull requests são bem-vindos.
