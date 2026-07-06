# 📅 GUIA-CALENDARIO-ACADEMICO-COM-UTILITARIOS-DE-DATA-REUTILIZAVEL-DO-FELIPE-SALA-BOARD.md

> **O que é**: Um guia reutilizável para construir um **calendário mensal interativo** com grade de dias, agrupamento de eventos por data, status do usuário por evento e uma biblioteca de utilitários de data sem dependências externas.
>
> **De onde vem**: Este padrão foi extraído do componente `Calendar` na página `GestaoPage` do projeto **Felipe Sala Board**.
>
> **Qual é o propósito dentro de `guias/`**: Registrar essa solução como um bloco reaproveitável do `Felixo System Design`, separando o padrão técnico do restante do produto original.
>
> **Quando usar**: Dashboards acadêmicos, calendários de entregas, agendas de projeto, painéis de gestão de eventos e qualquer interface que precise exibir eventos organizados por mês com interação do usuário.

Este documento não tenta explicar o `Felipe Sala Board` inteiro. O foco aqui é isolar a estratégia de geração de grade mensal, agrupamento de eventos, status por evento e utilitários de data que resolveram esse caso de uso e podem ser transportados para outros projetos.

---

## Visão geral

O calendário é composto por **3 camadas**:

| Camada | Onde | Responsabilidade |
|---|---|---|
| **Utilitários de data** | `utils/dateHelpers.ts` | Funções puras para aritmética, formatação e geração de grid de datas |
| **Calendário visual** | `Calendar.tsx` | Grade mensal 7×N com navegação, indicadores de evento e tooltip |
| **Card de evento** | `CalendarEventCard.tsx` | Exibição detalhada do evento com status do usuário (vou enviar / enviei) |

---

## 1. Utilitários de Data — Biblioteca zero-dependência

Estas 11 funções substituem a necessidade de `date-fns` ou `dayjs` para casos simples. Todas são puras (sem side effects) e não dependem de nenhuma biblioteca externa.

### Chave de data (formato ISO simplificado)

```typescript
function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
```

**Por que**: Padroniza `Date` → `"YYYY-MM-DD"` para uso como chave de `Map` ou agrupamento. Sem `toISOString()` que inclui timezone.

### Comparações

```typescript
function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isSameMonth(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}
```

### Limites de mês e semana

```typescript
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfWeek(date: Date, weekStartsOn = 1): Date {
  const start = new Date(date);
  const day = start.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfWeek(date: Date, weekStartsOn = 1): Date {
  const start = startOfWeek(date, weekStartsOn);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
}
```

**`weekStartsOn = 1`** → Segunda-feira como início de semana (padrão brasileiro). Mude para `0` se quiser domingo.

### Aritmética

```typescript
function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}
```

### Geração da grade mensal

```typescript
function getMonthGridDays(monthDate: Date): Date[] {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const gridStart = startOfWeek(monthStart, 1);
  const gridEnd = endOfWeek(monthEnd, 1);
  const days: Date[] = [];

  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
    days.push(new Date(day));
  }

  return days;
}
```

**O que faz**: Gera todos os dias visíveis na grade de um mês, incluindo dias do mês anterior/próximo que completam as semanas. Sempre retorna múltiplo de 7 dias.

### Formatadores

```typescript
function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('pt-BR');
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
```

---

## 2. Agrupamento de eventos por data

O calendário usa um `Map<string, CalendarEvent[]>` para agrupar eventos pela data-chave:

```typescript
const eventsByDate = useMemo(() => {
  const map = new Map<string, CalendarEvent[]>();
  events.forEach((event) => {
    const anchorDate = getEventAnchorDate(event);
    const key = toDateKey(anchorDate);
    const bucket = map.get(key) ?? [];
    bucket.push(event);
    map.set(key, bucket);
  });
  // Ordena cada bucket pela data âncora
  map.forEach((bucket) =>
    bucket.sort((a, b) => getEventAnchorDate(a).getTime() - getEventAnchorDate(b).getTime())
  );
  return map;
}, [events]);
```

**Data âncora**: Cada evento tem `openDate` e `dueDate`. A data âncora é a de vencimento (ou abertura se não houver vencimento):

```typescript
function getEventAnchorDate(event: CalendarEvent): Date {
  return new Date(event.dueDate ?? event.openDate);
}
```

---

## 3. Interface do tipo CalendarEvent

```typescript
interface CalendarEvent {
  id: string;
  subject: string;
  courseCode?: string;
  courseTrack?: string;
  classLabel?: string;
  title: string;
  shortTitle: string;
  description?: string;
  openDate: string;           // ISO date string
  dueDate: string;            // ISO date string
  submissionStatus?: string;
  gradeStatus?: string;
  submittedEarly?: string;
  lastModified?: string;
  objective?: string;
  requirements?: string[];
  tips?: string[];
  notes?: string;
  attachments?: { name: string; url?: string }[];
}
```

**Pontos-chave:**
- `shortTitle` → Usado no tooltip do calendário para preview rápido
- `openDate` / `dueDate` → Definem a janela de entrega
- `requirements`, `tips` → Arrays opcionais para detalhes expandidos
- `attachments` → Metadados de arquivos anexados

---

## 4. Grade visual do calendário

### Layout

```
┌──────────────────────────────────────────────────────┐
│ maio de 2026                    [◀] [Hoje] [▶]       │
│ 3 atividade(s)              ● Dias com atividade     │
├──────────────────────────────────────────────────────┤
│ Seg   Ter   Qua   Qui   Sex   Sáb   Dom             │
│ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐          │
│ │ 1 │ │ 2 │ │ 3●│ │ 4 │ │ 5 │ │ 6 │ │ 7 │          │
│ └───┘ └───┘ └───┘ └───┘ └───┘ └───┘ └───┘          │
│ ...                                                  │
└──────────────────────────────────────────────────────┘
```

### Renderização da célula do dia

```tsx
{gridDays.map((day) => {
  const key = toDateKey(day);
  const dayEvents = eventsByDate.get(key) ?? [];
  const isToday = isSameDay(day, currentDate);
  const isCurrentMonth = isSameMonth(day, selectedMonth);
  const hasEvents = dayEvents.length > 0;

  return (
    <div
      key={key}
      title={hasEvents
        ? `${formatShortDate(day)} • ${dayEvents.map((e) => e.shortTitle).join(' • ')}`
        : formatShortDate(day)}
      className={`aspect-square rounded-xl border p-2 transition ${
        isCurrentMonth ? 'border-white/10 bg-white/5' : 'border-transparent text-zinc-600/60'
      } ${isToday ? 'ring-2 ring-felixo-purple/50' : ''} ${
        hasEvents
          ? 'border-felixo-purple/30 bg-felixo-purple/10 hover:border-felixo-purple/60'
          : 'hover:border-white/20'
      }`}
    >
      <div className="flex items-center justify-between text-[10px]">
        <span className={isCurrentMonth ? 'text-zinc-300' : 'text-zinc-600'}>
          {day.getDate()}
        </span>
        {hasEvents && <span className="text-felixo-purple font-semibold">{dayEvents.length}</span>}
      </div>
      {hasEvents && (
        <div className="mt-2 flex flex-wrap gap-1">
          {dayEvents.slice(0, 3).map((event) => (
            <span key={event.id} className="h-1.5 w-1.5 rounded-full bg-felixo-purple/80" />
          ))}
          {dayEvents.length > 3 && (
            <span className="text-[10px] text-zinc-400">+{dayEvents.length - 3}</span>
          )}
        </div>
      )}
    </div>
  );
})}
```

**Pontos-chave:**
- `aspect-square` → Mantém célula quadrada em qualquer resolução
- `ring-2 ring-felixo-purple/50` → Destaque visual do dia atual
- Dias fora do mês atual ficam `border-transparent text-zinc-600/60`
- Dots roxos indicam eventos (máximo 3 visíveis + badge `+N`)
- Tooltip mostra data + `shortTitle` de cada evento

### Navegação de mês

```tsx
<button onClick={() => setSelectedMonth(addMonths(selectedMonth, -1))}>◀</button>
<button onClick={() => setSelectedMonth(startOfMonth(currentDate))}>Hoje</button>
<button onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}>▶</button>
```

---

## 5. Status do usuário por evento

### Conceito

O calendário permite que o usuário marque cada evento com um status pessoal:
- **"Vou enviar"** → Intenção de fazer a entrega
- **"Enviei"** → Entrega realizada

Esses status são salvos no `localStorage` como `Record<string, 'will' | 'sent'>`.

### Implementação

```typescript
type CalendarUserStatus = 'will' | 'sent';

const [userStatusById, setUserStatusById] = useState<Record<string, CalendarUserStatus>>(() => {
  const stored = localStorage.getItem('gestaoCalendarUserStatus');
  if (!stored) return {};
  try {
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, CalendarUserStatus>;
  } catch { return {}; }
});

useEffect(() => {
  localStorage.setItem('gestaoCalendarUserStatus', JSON.stringify(userStatusById));
}, [userStatusById]);

const handleStatusChange = (eventId: string, status: CalendarUserStatus) => {
  setUserStatusById((prev) => {
    const next = { ...prev };
    if (prev[eventId] === status) {
      delete next[eventId];  // Toggle: clicar de novo remove o status
      return next;
    }
    next[eventId] = status;
    return next;
  });
};
```

### Botões de status no card de evento

```tsx
<button
  onClick={() => onStatusChange(event.id, 'will')}
  aria-pressed={userStatus === 'will'}
  className={`rounded-full border px-2 py-1 transition ${
    userStatus === 'will'
      ? 'border-felixo-purple/60 bg-felixo-purple/15 text-felixo-purple'
      : 'border-white/10 text-zinc-300 hover:border-white/30'
  }`}
>
  Vou enviar
</button>
<button
  onClick={() => onStatusChange(event.id, 'sent')}
  aria-pressed={userStatus === 'sent'}
  className={`rounded-full border px-2 py-1 transition ${
    userStatus === 'sent'
      ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-200'
      : 'border-white/10 text-zinc-300 hover:border-white/30'
  }`}
>
  Enviei
</button>
```

**Padrão de toggle**: Clicar no botão já ativo remove o status (deseleciona). Isso evita a necessidade de um botão "limpar".

---

## 6. Card de evento com detalhes expansíveis

### Anatomia

```
┌──────────────────────────────────────────┐
│ COMPUTAÇÃO GRÁFICA [26.1] (VR/SIS/6P)   │  ← subject + courseCode + courseTrack
│ Composição de Paisagem com Primitivas    │  ← title
│ Aula 03 - Desenhando primitivas          │  ← classLabel
│                                          │
│ Atividade prática com <canvas>...        │  ← description
│                                          │
│ Aberto: 13/03/2026 • Vencimento: ...    │  ← openDate / dueDate
│ [Prazo encerrado]                        │  ← badge condicional
│                                          │
│ Minha intenção: [Vou enviar] [Enviei]    │  ← status buttons
│                                          │
│ ▶ Detalhes da atividade                  │  ← <details> expansível
│   Objetivo: ...                          │
│   Elementos obrigatórios: ...            │
│   Dicas: ...                             │
│   Registro do portal: ...                │
│   Arquivos: ...                          │
│   Notas: ...                             │
└──────────────────────────────────────────┘
```

### Padrão de seção expansível

```tsx
<details className="rounded-lg border border-white/10 bg-white/5 p-4">
  <summary className="cursor-pointer text-sm text-felixo-purple font-semibold">
    Detalhes da atividade
  </summary>
  <div className="mt-3 space-y-3 text-sm text-zinc-300">
    {/* Objetivo, requisitos, dicas, notas, anexos */}
  </div>
</details>
```

**Por que `<details>`?** Elemento nativo do HTML que não precisa de estado React. Leve e acessível.

---

## 7. Como reutilizar em outro projeto

### Passo 1: Copiar os utilitários de data

Crie `utils/dateHelpers.ts` e copie as 11 funções da seção 1 deste guia. Elas são puras, sem dependência, e funcionam em qualquer projeto TypeScript/JavaScript.

### Passo 2: Definir a interface do evento

Adapte `CalendarEvent` ao seu domínio. Campos obrigatórios mínimos:

```typescript
interface MyEvent {
  id: string;
  title: string;
  shortTitle: string;
  date: string;        // ISO date string (data de referência)
}
```

### Passo 3: Gerar a grade do mês

```typescript
const gridDays = getMonthGridDays(selectedMonth);
```

Isso retorna um array de `Date` que sempre começa na segunda-feira anterior ao dia 1 e termina no domingo após o último dia do mês.

### Passo 4: Renderizar como grid 7 colunas

```tsx
<div className="grid grid-cols-7 gap-3">
  {gridDays.map((day) => (
    <DayCell key={toDateKey(day)} day={day} events={eventsByDate.get(toDateKey(day))} />
  ))}
</div>
```

### Passo 5: Customizar visual

| O que | Onde mexer |
|---|---|
| **Cor primária** | Troque `felixo-purple` pela sua cor |
| **Início da semana** | Mude `weekStartsOn` em `startOfWeek` (0 = domingo, 1 = segunda) |
| **Idioma** | Mude `'pt-BR'` nos formatadores |
| **Tamanho da célula** | Ajuste `aspect-square` e `gap-3` |
| **Máximo de dots** | Mude o `3` em `dayEvents.slice(0, 3)` |

### Passo 6: Instalar dependências

Nenhuma dependência extra é necessária. O calendário usa apenas React e Tailwind CSS.

---

## 8. Referência de arquivos (no projeto original)

| Arquivo | O que faz |
|---|---|
| `src/pages/GestaoPage.tsx` | Componente Calendar completo + date utils + CalendarEventCard |
| `src/data/mockData.ts` | Interface CalendarEvent e dados de exemplo |

---

## Resumo da receita

1. **Date utils**: 11 funções puras sem dependência para aritmética, comparação e formatação
2. **Grid mensal**: `getMonthGridDays()` gera dias de segunda a domingo
3. **Agrupamento**: `Map<dateKey, Event[]>` com `useMemo` para performance
4. **Célula do dia**: `aspect-square`, dots para eventos, ring para hoje, opacity para fora do mês
5. **Navegação**: 3 botões (anterior, hoje, próximo) com `addMonths`
6. **Status do usuário**: `Record<id, 'will' | 'sent'>` no localStorage com toggle
7. **Card de evento**: Metadados + `<details>` nativo para seção expansível
8. **Zero dependências**: Sem date-fns, dayjs ou moment

---

> **Assinatura de Origem**
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design
> Data desta versão: 2026-05-23
> Sugestões e pull requests são bem-vindos.
